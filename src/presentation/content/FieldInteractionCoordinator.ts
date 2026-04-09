import type { BackgroundMessageClient } from "../../application/interfaces/BackgroundMessageClient.js";
import type { SaveMemoryResult } from "../../application/services/MemorySaveService.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import { FieldType } from "../../domain/enums/FieldType.js";
import { DomEventDispatcherService } from "../../infrastructure/dom/DomEventDispatcherService.js";
import { DomFieldWriterService } from "../../infrastructure/dom/DomFieldWriterService.js";
import type { ScannedFieldBinding } from "../../infrastructure/dom/types.js";
import {
  hasDateLikeSignal,
  isDateLikeInputType,
} from "../../shared/utils/dateFieldHeuristics.js";
import type {
  AnalyzedContentField,
  ContentActionOption,
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

  private static readonly blockedSearchTerms = [
    "search",
    "search term",
    "search query",
    "site search",
    "keyword",
    "keywords",
    "find",
    "lookup",
    "filter",
    "query",
  ];

  constructor(
    private readonly fieldWriterService: DomFieldWriterService,
    private readonly eventDispatcherService: DomEventDispatcherService,
    private readonly backgroundMessageClient: BackgroundMessageClient,
  ) {}

  private readonly recentlyAppliedAnswers = new Map<string, string>();

  async applyMemory(field: AnalyzedContentField): Promise<boolean> {
    return this.applyOption(field);
  }

  async applyOption(
    field: AnalyzedContentField,
    option?: Pick<ContentActionOption, "answer" | "memoryId">,
  ): Promise<boolean> {
    const answer = option?.answer ?? field.analysis.match.answer;

    if (!answer) {
      return false;
    }

    const wroteValue = this.fieldWriterService.write(field.binding, answer);

    if (!wroteValue) {
      return false;
    }

    const serializedAppliedAnswer = this.serializeAnswer(answer);
    this.recentlyAppliedAnswers.set(
      field.binding.descriptor.fieldId,
      serializedAppliedAnswer,
    );

    this.eventDispatcherService.dispatchAfterWrite(field.binding);

    window.setTimeout(() => {
      if (this.recentlyAppliedAnswers.get(field.binding.descriptor.fieldId) === serializedAppliedAnswer) {
        this.recentlyAppliedAnswers.delete(field.binding.descriptor.fieldId);
      }
    }, 1500);

    const memoryId = option?.memoryId ?? field.analysis.match.memoryId;

    if (memoryId) {
      await this.backgroundMessageClient.send("recordMemoryUsage", {
        memoryId,
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
    let timeoutId: number | undefined;

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
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        void this.handlePotentialSave(field, callbacks, state);
      }, field.binding.fieldType === FieldType.Select ? 100 : 350);
    };

    const extraTargets = this.getAdditionalSaveDetectionTargets(field.binding);

    for (const element of field.binding.elements) {
      element.addEventListener("blur", listener, true);
      element.addEventListener("change", listener, true);
      element.addEventListener("input", listener, true);
    }

    for (const target of extraTargets) {
      target.addEventListener("click", listener, true);
      target.addEventListener("mouseup", listener, true);
      target.addEventListener("keyup", listener, true);
    }

    return () => {
      if (timeoutId !== undefined && field.binding.fieldType !== FieldType.Select) {
        window.clearTimeout(timeoutId);
      }

      for (const element of field.binding.elements) {
        element.removeEventListener("blur", listener, true);
        element.removeEventListener("change", listener, true);
        element.removeEventListener("input", listener, true);
      }

      for (const target of extraTargets) {
        target.removeEventListener("click", listener, true);
        target.removeEventListener("mouseup", listener, true);
        target.removeEventListener("keyup", listener, true);
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

    if (!field.binding.primaryElement.isConnected) {
      return;
    }

    if (this.shouldSkipSavePrompt(field.binding)) {
      return;
    }

    const currentAnswer = this.readCurrentAnswer(field.binding);
    const serializedAnswer = this.serializeAnswer(currentAnswer);
    const recentlyAppliedAnswer = this.recentlyAppliedAnswers.get(
      field.binding.descriptor.fieldId,
    );

    if (!this.isMeaningfulAnswer(currentAnswer)) {
      return;
    }

    if (this.answerLooksLikeQuestionOrPrompt(currentAnswer, field.binding.descriptor)) {
      return;
    }

    if (
      serializedAnswer === recentlyAppliedAnswer
      || this.answersEquivalent(currentAnswer, field.analysis.match.answer)
      || (field.analysis.match.options ?? []).some((option) =>
        this.answersEquivalent(currentAnswer, option.answer),
      )
    ) {
      state.baseline = serializedAnswer;
      state.lastPrompted = serializedAnswer;
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
    try {
      const shouldSave = await callbacks.onSaveCandidate(request);

      if (shouldSave === true) {
        await request.save();
      }
    } catch (error) {
      state.lastPrompted = "";
      await callbacks.onError?.(error);
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
          const select = binding.primaryElement;
          const visibleAnswer = this.getVisibleDropdownAnswer(select);

          if (visibleAnswer) {
            return { selectValue: visibleAnswer };
          }

          if (select.multiple) {
            return {
              multiSelectValues: Array.from(select.selectedOptions).map(
                (option) => option.textContent?.trim() || option.value,
              ),
            };
          }

          if (this.isDefaultEnhancedSelectOption(select)) {
            return {};
          }

          const selectedOption = select.selectedOptions[0];
          const selectedAnswer =
            this.getSelectedOptionAnswer(selectedOption)
            ?? this.normalizeDropdownAnswer(select.value);

          return selectedAnswer ? { selectValue: selectedAnswer } : {};
        }
        if (
          binding.primaryElement instanceof HTMLInputElement
          || binding.primaryElement instanceof HTMLTextAreaElement
        ) {
          const visibleAnswer = this.getVisibleComboboxAnswer(binding.primaryElement);
          return { selectValue: visibleAnswer || binding.primaryElement.value };
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
          const selectedLabel = selected.labels?.[0]?.textContent?.trim();
          return { selectValue: selectedLabel || selected.value };
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

  private answersEquivalent(left: AnswerPayload, right: AnswerPayload | undefined): boolean {
    if (!right) {
      return false;
    }

    if (
      typeof left.booleanValue === "boolean"
      || typeof right.booleanValue === "boolean"
    ) {
      return left.booleanValue === right.booleanValue;
    }

    const leftValue = this.normalizeComparableAnswer(left);
    const rightValue = this.normalizeComparableAnswer(right);

    return Boolean(leftValue && rightValue && leftValue === rightValue);
  }

  private normalizeComparableAnswer(answer: AnswerPayload): string {
    return [
      answer.textValue,
      answer.selectValue,
      answer.multiSelectValues?.join(" "),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private getAdditionalSaveDetectionTargets(binding: ScannedFieldBinding): EventTarget[] {
    if (binding.fieldType !== FieldType.Select) {
      return [];
    }

    const targets = new Set<EventTarget>();
    const document = binding.primaryElement.ownerDocument;

    targets.add(document);

    if (binding.primaryElement instanceof HTMLSelectElement) {
      const select2Container = this.getSelect2Container(binding.primaryElement);

      if (select2Container) {
        targets.add(select2Container);
      }
    }

    const closestQuestionContainer = binding.primaryElement.closest(
      [
        "[class*='question_']",
        ".application-question",
        ".field",
        ".form-group",
      ].join(","),
    );

    if (closestQuestionContainer) {
      targets.add(closestQuestionContainer);
    }

    return [...targets];
  }

  private getVisibleDropdownAnswer(select: HTMLSelectElement): string | undefined {
    const rendered = this.getSelect2RenderedElement(select);
    const renderedText = this.normalizeDropdownAnswer(rendered?.textContent);

    if (renderedText) {
      return renderedText;
    }

    if (rendered && this.isDefaultEnhancedSelectOption(select)) {
      return undefined;
    }

    const selectedOption = select.selectedOptions[0];
    const optionText = this.getSelectedOptionAnswer(selectedOption);

    if (optionText) {
      return optionText;
    }

    return this.normalizeDropdownAnswer(select.value);
  }

  private isDefaultEnhancedSelectOption(select: HTMLSelectElement): boolean {
    const selectedOption = select.selectedOptions[0];
    return Boolean(
      this.getSelect2RenderedElement(select)
      && selectedOption
      && selectedOption === select.options[0]
      && !selectedOption.defaultSelected
    );
  }

  private getSelectedOptionAnswer(option: HTMLOptionElement | undefined): string | undefined {
    if (!option || option.disabled || option.value.trim() === "") {
      return undefined;
    }

    return this.normalizeDropdownAnswer(option.textContent) ?? this.normalizeDropdownAnswer(option.value);
  }

  private getVisibleComboboxAnswer(input: HTMLInputElement | HTMLTextAreaElement): string | undefined {
    const inputValue = this.normalizeDropdownAnswer(input.value);

    if (inputValue) {
      return inputValue;
    }

    if (!(input instanceof HTMLInputElement)) {
      return undefined;
    }

    const activeDescendantId = input.getAttribute("aria-activedescendant");
    const activeDescendant = activeDescendantId
      ? input.ownerDocument.getElementById(activeDescendantId)
      : null;
    const activeText = this.normalizeDropdownAnswer(activeDescendant?.textContent);

    if (activeText) {
      return activeText;
    }

    const labelledBy = input.getAttribute("aria-labelledby");

    if (!labelledBy) {
      return undefined;
    }

    const labelledText = labelledBy
      .split(/\s+/)
      .map((id) => input.ownerDocument.getElementById(id))
      .map((element) => this.normalizeDropdownAnswer(element?.textContent))
      .find((value): value is string => Boolean(value));

    return labelledText;
  }

  private getSelect2RenderedElement(select: HTMLSelectElement): HTMLElement | undefined {
    if (select.id) {
      const renderedById = select.ownerDocument.getElementById(`select2-${select.id}-container`);

      if (renderedById instanceof HTMLElement) {
        return renderedById;
      }
    }

    const container = this.getSelect2Container(select);
    const rendered = container?.querySelector(".select2-selection__rendered, .select2-chosen");

    return rendered instanceof HTMLElement ? rendered : undefined;
  }

  private getSelect2Container(select: HTMLSelectElement): HTMLElement | undefined {
    const candidates: Array<Element | null> = [
      select.nextElementSibling,
      select.previousElementSibling,
      select.id ? select.ownerDocument.getElementById(`s2id_${select.id}`) : null,
    ];

    for (const candidate of candidates) {
      if (
        candidate instanceof HTMLElement
        && (
          candidate.classList.contains("select2")
          || candidate.classList.contains("select2-container")
        )
      ) {
        return candidate;
      }
    }

    if (!select.id) {
      return undefined;
    }

    const renderedById = select.ownerDocument.getElementById(`select2-${select.id}-container`);
    const container = renderedById?.closest(".select2, .select2-container");

    return container instanceof HTMLElement ? container : undefined;
  }

  private normalizeDropdownAnswer(value: string | null | undefined): string | undefined {
    const normalized = value?.replace(/\s+/g, " ").trim();

    if (!normalized) {
      return undefined;
    }

    const lower = normalized.toLowerCase();

    if ([
      "select",
      "select one",
      "please select",
      "choose",
      "choose one",
      "please choose",
      "n/a",
      "none",
      "save",
      "save this answer",
      "apply",
      "apply saved answer",
      "apply saved answer?",
      "saved answer found",
    ].includes(lower)) {
      return undefined;
    }

    return normalized;
  }

  private answerLooksLikeQuestionOrPrompt(
    answer: AnswerPayload,
    descriptor: ScannedFieldBinding["descriptor"],
  ): boolean {
    const answerText = this.normalizeComparableAnswer(answer);

    if (!answerText) {
      return true;
    }

    const blockedValues = [
      descriptor.questionText,
      descriptor.placeholderText,
      "save this answer",
      "apply saved answer",
      "saved answer found",
    ]
      .map((value) => this.normalizeComparableText(value))
      .filter((value): value is string => Boolean(value));

    return blockedValues.some((value) => value === answerText);
  }

  private shouldSkipSavePrompt(binding: ScannedFieldBinding): boolean {
    const primaryElement = binding.primaryElement;

    if (primaryElement instanceof HTMLInputElement && primaryElement.type === "password") {
      return true;
    }

    if (primaryElement instanceof HTMLInputElement && primaryElement.type === "search") {
      return true;
    }

    if (primaryElement instanceof HTMLInputElement && isDateLikeInputType(primaryElement.type)) {
      return true;
    }

    const autocomplete = this.normalizeText(primaryElement.getAttribute("autocomplete"));
    const role = this.normalizeText(primaryElement.getAttribute("role"));

    if (
      autocomplete
      && ["username", "current-password", "new-password"].some((value) =>
        autocomplete.includes(value),
      )
    ) {
      return true;
    }

    if (autocomplete?.includes("search") || role === "searchbox") {
      return true;
    }

    const rawSignals = [
      binding.descriptor.questionText,
      binding.descriptor.placeholderText,
      binding.descriptor.sectionText,
      primaryElement.getAttribute("name"),
      primaryElement.id,
      primaryElement.getAttribute("aria-label"),
      primaryElement.getAttribute("autocomplete"),
      primaryElement.getAttribute("data-automation-id"),
      primaryElement.getAttribute("placeholder"),
      primaryElement.getAttribute("title"),
    ];

    if (hasDateLikeSignal(rawSignals, binding.descriptor.optionTexts)) {
      return true;
    }

    const signals = rawSignals
      .map((value) => this.normalizeText(value))
      .filter((value): value is string => Boolean(value));

    if (
      signals.some((value) =>
        FieldInteractionCoordinator.blockedCredentialTerms.some((term) =>
          value.includes(term),
        ),
      )
    ) {
      return true;
    }

    return signals.some((value) =>
      FieldInteractionCoordinator.blockedSearchTerms.some((term) =>
        value.includes(term),
      ),
    );
  }

  private normalizeText(value: string | null | undefined): string | undefined {
    const normalized = value?.toLowerCase().replace(/\s+/g, " ").trim();
    return normalized ? normalized : undefined;
  }

  private normalizeComparableText(value: string | null | undefined): string | undefined {
    const normalized = value
      ?.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return normalized ? normalized : undefined;
  }
}
