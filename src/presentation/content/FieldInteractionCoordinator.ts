import type { BackgroundMessageClient } from "../../application/interfaces/BackgroundMessageClient.js";
import type { SaveMemoryResult } from "../../application/services/MemorySaveService.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import { FieldType } from "../../domain/enums/FieldType.js";
import { DomEventDispatcherService } from "../../infrastructure/dom/DomEventDispatcherService.js";
import { DomFieldWriterService } from "../../infrastructure/dom/DomFieldWriterService.js";
import type { ScannedFieldBinding } from "../../infrastructure/dom/types.js";
import type {
  AnalyzedContentField,
  ContentRuntimeCallbacks,
  SaveCandidateRequest,
} from "./types.js";

export class FieldInteractionCoordinator {
  private static readonly blockedCredentialTerms = [
    "username",
    "user name",
    "userid",
    "user id",
    "login",
    "log in",
    "signin",
    "sign in",
    "password",
    "passcode",
    "current password",
    "new password",
    "confirm password",
  ];

  constructor(
    private readonly fieldWriterService: DomFieldWriterService,
    private readonly eventDispatcherService: DomEventDispatcherService,
    private readonly backgroundMessageClient: BackgroundMessageClient,
  ) {}

  async applyMemory(field: AnalyzedContentField): Promise<boolean> {
    const answer = field.analysis.match.answer;

    if (!answer) {
      return false;
    }

    const wroteValue = this.fieldWriterService.write(field.binding, answer);

    if (!wroteValue) {
      return false;
    }

    this.eventDispatcherService.dispatchAfterWrite(field.binding);

    if (field.analysis.match.memoryId) {
      await this.backgroundMessageClient.send("recordMemoryUsage", {
        memoryId: field.analysis.match.memoryId,
      });
    }

    return true;
  }

  attachSaveDetection(
    field: AnalyzedContentField,
    callbacks: ContentRuntimeCallbacks,
  ): () => void {
    let baseline = this.serializeAnswer(this.readCurrentAnswer(field.binding));
    let lastPrompted = "";

    const state = {
      get baseline(): string {
        return baseline;
      },
      set baseline(value: string) {
        baseline = value;
      },
      get lastPrompted(): string {
        return lastPrompted;
      },
      set lastPrompted(value: string) {
        lastPrompted = value;
      },
    };

    const listener = (): void => {
      void this.handlePotentialSave(field, callbacks, state);
    };

    for (const element of field.binding.elements) {
      element.addEventListener("blur", listener, true);
      element.addEventListener("change", listener, true);
    }

    return () => {
      for (const element of field.binding.elements) {
        element.removeEventListener("blur", listener, true);
        element.removeEventListener("change", listener, true);
      }
    };
  }

  private async handlePotentialSave(
    field: AnalyzedContentField,
    callbacks: ContentRuntimeCallbacks,
    state: {
      baseline: string;
      lastPrompted: string;
    },
  ): Promise<void> {
    if (!callbacks.onSaveCandidate) {
      return;
    }

    if (this.shouldSkipSavePrompt(field.binding)) {
      return;
    }

    const currentAnswer = this.readCurrentAnswer(field.binding);
    const serializedAnswer = this.serializeAnswer(currentAnswer);

    if (!this.isMeaningfulAnswer(currentAnswer)) {
      return;
    }

    if (serializedAnswer === state.baseline || serializedAnswer === state.lastPrompted) {
      return;
    }

    if (
      field.analysis.match.answer
      && serializedAnswer === this.serializeAnswer(field.analysis.match.answer)
    ) {
      return;
    }

    const request: SaveCandidateRequest = {
      field,
      answer: currentAnswer,
      save: async (): Promise<SaveMemoryResult> => {
        const result = await this.backgroundMessageClient.send("saveMemory", {
          questionText: field.binding.descriptor.questionText,
          answer: currentAnswer,
          hostName: field.binding.descriptor.hostName,
        });
        state.baseline = serializedAnswer;
        state.lastPrompted = serializedAnswer;
        return result;
      },
    };

    state.lastPrompted = serializedAnswer;
    const shouldSave = await callbacks.onSaveCandidate(request);

    if (shouldSave === true) {
      await request.save();
    }
  }

  private readCurrentAnswer(binding: ScannedFieldBinding): AnswerPayload {
    switch (binding.fieldType) {
      case FieldType.Text:
      case FieldType.TextArea:
        if (
          binding.primaryElement instanceof HTMLInputElement
          || binding.primaryElement instanceof HTMLTextAreaElement
        ) {
          return { textValue: binding.primaryElement.value };
        }
        break;
      case FieldType.Select:
        if (binding.primaryElement instanceof HTMLSelectElement) {
          if (binding.primaryElement.multiple) {
            return {
              multiSelectValues: Array.from(binding.primaryElement.selectedOptions).map(
                (option) => option.value,
              ),
            };
          }

          return { selectValue: binding.primaryElement.value };
        }
        break;
      case FieldType.Checkbox:
        if (binding.primaryElement instanceof HTMLInputElement) {
          return { booleanValue: binding.primaryElement.checked };
        }
        break;
      case FieldType.Radio: {
        const selected = binding.elements.find((element) =>
          element instanceof HTMLInputElement && element.checked,
        );

        if (selected instanceof HTMLInputElement) {
          return { selectValue: selected.value };
        }
        break;
      }
      default:
        break;
    }

    return {};
  }

  private isMeaningfulAnswer(answer: AnswerPayload): boolean {
    if (typeof answer.booleanValue === "boolean") {
      return true;
    }

    if (answer.multiSelectValues && answer.multiSelectValues.length > 0) {
      return true;
    }

    if (answer.selectValue && answer.selectValue.trim().length > 0) {
      return true;
    }

    return Boolean(answer.textValue && answer.textValue.trim().length >= 3);
  }

  private serializeAnswer(answer: AnswerPayload): string {
    return JSON.stringify(answer);
  }

  private shouldSkipSavePrompt(binding: ScannedFieldBinding): boolean {
    const primaryElement = binding.primaryElement;

    if (primaryElement instanceof HTMLInputElement && primaryElement.type === "password") {
      return true;
    }

    const autocomplete = this.normalizeText(primaryElement.getAttribute("autocomplete"));

    if (
      autocomplete
      && ["username", "current-password", "new-password"].some((value) =>
        autocomplete.includes(value),
      )
    ) {
      return true;
    }

    const signals = [
      binding.descriptor.questionText,
      binding.descriptor.placeholderText,
      primaryElement.getAttribute("name"),
      primaryElement.id,
      primaryElement.getAttribute("aria-label"),
    ]
      .map((value) => this.normalizeText(value))
      .filter((value): value is string => Boolean(value));

    return signals.some((value) =>
      FieldInteractionCoordinator.blockedCredentialTerms.some((term) =>
        value.includes(term),
      ),
    );
  }

  private normalizeText(value: string | null | undefined): string | undefined {
    const normalized = value?.toLowerCase().replace(/\s+/g, " ").trim();
    return normalized ? normalized : undefined;
  }
}
