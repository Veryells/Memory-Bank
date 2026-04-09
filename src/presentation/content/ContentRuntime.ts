import { ChromeMessagingService } from "../../infrastructure/browser/ChromeMessagingService.js";
import { DomEventDispatcherService } from "../../infrastructure/dom/DomEventDispatcherService.js";
import { DomFieldWriterService } from "../../infrastructure/dom/DomFieldWriterService.js";
import { DomQuestionLocatorService } from "../../infrastructure/dom/DomQuestionLocatorService.js";
import { DomScannerService } from "../../infrastructure/dom/DomScannerService.js";
import { MutationObserverService, type MutationObservationHandle } from "../../infrastructure/dom/MutationObserverService.js";
import { FieldInteractionCoordinator } from "./FieldInteractionCoordinator.js";
import { PageAnalysisCoordinator } from "./PageAnalysisCoordinator.js";
import type {
  AnalyzedContentField,
  ContentActionRequest,
  ContentRuntimeCallbacks,
  ContentRuntimeHandle,
} from "./types.js";

export interface ContentRuntimeDependencies {
  pageAnalysisCoordinator: PageAnalysisCoordinator;
  fieldInteractionCoordinator: FieldInteractionCoordinator;
  mutationObserverService?: MutationObserverService;
  callbacks?: ContentRuntimeCallbacks;
}

export class ContentRuntime {
  private readonly mutationObserverService: MutationObserverService;
  private readonly callbacks: ContentRuntimeCallbacks;
  private observationHandle: MutationObservationHandle | undefined;
  private attachedListeners = new Map<string, () => void>();
  private announcedActionKeys = new Map<string, string>();
  private root: Document | HTMLElement = document;

  constructor(private readonly dependencies: ContentRuntimeDependencies) {
    this.mutationObserverService =
      dependencies.mutationObserverService ?? new MutationObserverService();
    this.callbacks = dependencies.callbacks ?? {};
  }

  async start(root: Document | HTMLElement = document): Promise<ContentRuntimeHandle> {
    this.root = root;
    await this.refresh();

    const target = root instanceof Document
      ? root.body ?? root.documentElement
      : root;

    if (target) {
      this.observationHandle = this.mutationObserverService.observe(target, () => {
        void this.refresh();
      });
    }

    return {
      refresh: async () => this.refresh(),
      stop: () => this.stop(),
    };
  }

  async refresh(): Promise<void> {
    try {
      const analyzedFields = await this.dependencies.pageAnalysisCoordinator.analyze(this.root);
      this.resetSaveListeners();

      for (const field of analyzedFields) {
        this.attachedListeners.set(
          field.binding.descriptor.fieldId,
          this.dependencies.fieldInteractionCoordinator.attachSaveDetection(
            field,
            this.callbacks,
          ),
        );
        await this.processDecision(field);
      }

      await this.callbacks.onAnalysisComplete?.(analyzedFields);
    } catch (error) {
      await this.callbacks.onError?.(error);
    }
  }

  stop(): void {
    this.observationHandle?.disconnect();
    this.observationHandle = undefined;
    this.resetSaveListeners();
    this.announcedActionKeys.clear();
  }

  private async processDecision(field: AnalyzedContentField): Promise<void> {
    const actionKey = this.buildActionKey(field);

    if (this.announcedActionKeys.get(field.binding.descriptor.fieldId) === actionKey) {
      return;
    }

    this.announcedActionKeys.set(field.binding.descriptor.fieldId, actionKey);

    const request: ContentActionRequest = {
      field,
      apply: async () => this.dependencies.fieldInteractionCoordinator.applyMemory(field),
    };

    switch (field.analysis.decision.action) {
      case "suggest":
        await this.callbacks.onSuggestion?.(request);
        break;
      case "prompt":
        await this.callbacks.onPrompt?.(request);
        break;
      case "autoApply": {
        const applied = await request.apply();

        if (applied) {
          await this.callbacks.onAutoApplied?.(field);
        }
        break;
      }
      case "none":
      default:
        break;
    }
  }

  private buildActionKey(field: AnalyzedContentField): string {
    return [
      field.analysis.decision.action,
      field.analysis.match.memoryId ?? "none",
      field.analysis.match.confidenceScore.toString(),
    ].join(":");
  }

  private resetSaveListeners(): void {
    for (const dispose of this.attachedListeners.values()) {
      dispose();
    }

    this.attachedListeners.clear();
  }
}

export function createChromeContentRuntime(
  messagingService: ChromeMessagingService,
  callbacks: ContentRuntimeCallbacks = {},
): ContentRuntime {
  const questionLocatorService = new DomQuestionLocatorService();
  const scannerService = new DomScannerService(questionLocatorService);
  const fieldWriterService = new DomFieldWriterService();
  const eventDispatcherService = new DomEventDispatcherService();
  const pageAnalysisCoordinator = new PageAnalysisCoordinator(
    scannerService,
    messagingService,
  );
  const fieldInteractionCoordinator = new FieldInteractionCoordinator(
    fieldWriterService,
    eventDispatcherService,
    messagingService,
  );

  return new ContentRuntime({
    pageAnalysisCoordinator,
    fieldInteractionCoordinator,
    callbacks,
  });
}
