import type {
  AnalyzedContentField,
  ContentActionOption,
  ContentActionRequest,
  ContentRuntimeCallbacks,
  SaveCandidateRequest,
} from "./types.js";

export class SimpleContentUi {
  private readonly overlays = new Map<string, HTMLElement>();
  private readonly styleElementId = "memorybank-inline-styles";

  constructor() {
    this.ensureStyles();
  }

  createCallbacks(): ContentRuntimeCallbacks {
    return {
      onSuggestion: async (request) => {
        this.showActionOverlay(
          request,
          "Saved answer found.",
          "Apply",
        );
      },
      onPrompt: async (request) => {
        this.showActionOverlay(
          request,
          "Apply saved answer?",
          "Apply",
        );
      },
      onAutoApplied: async () => undefined,
      onSaveCandidate: async (request) => this.showSaveOverlay(request),
      onAnalysisComplete: async (fields) => {
        const activeIds = new Set(fields.map((field) => field.binding.descriptor.fieldId));

        for (const [fieldId, element] of this.overlays.entries()) {
          if (activeIds.has(fieldId)) {
            continue;
          }

          element.remove();
          this.overlays.delete(fieldId);
        }
      },
      onError: async (error) => {
        console.error("MemoryBank content runtime error", error);
      },
    };
  }

  private showActionOverlay(
    request: ContentActionRequest,
    message: string,
    primaryLabel: string,
  ): void {
    const optionSource: ContentActionOption[] = request.options.length > 0
      ? request.options.slice(0, 3)
      : [{ label: primaryLabel, answer: {} }];

    const optionButtons = optionSource.map((option, index) => ({
      label: request.options.length > 1
        ? `${index + 1}. ${option.label}`
        : primaryLabel,
      emphasis: index === 0,
      onClick: async () => {
        const applied = await request.apply(request.options.length > 0 ? option : undefined);

        if (!applied) {
          this.showNoticeOverlay(request.field, "Could not apply saved answer.");
        }
      },
    }));

    const overlay = this.createOverlay(
      request.field,
      request.options.length > 1 ? `${message} Choose one:` : message,
      [
        ...optionButtons,
        {
          label: "Dismiss",
          onClick: () => undefined,
        },
      ],
    );

    this.mountOverlay(
      request.field,
      overlay,
    );
  }

  private async showSaveOverlay(request: SaveCandidateRequest): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const overlay = this.createOverlay(
        request.field,
        "Save this answer?",
        [
          {
            label: "Save",
            emphasis: true,
            onClick: async () => {
              try {
                await request.save();
                this.showNoticeOverlay(request.field, "Answer saved.");
                resolve(false);
              } catch (error) {
                console.error("MemoryBank could not save answer", error);
                this.showNoticeOverlay(request.field, "Could not save answer.");
                reject(error);
              }
            },
          },
          {
            label: "Dismiss",
            onClick: () => {
              resolve(false);
            },
          },
        ],
      );

      this.mountOverlay(
        request.field,
        overlay,
      );
    });
  }

  private showNoticeOverlay(field: AnalyzedContentField, message: string): void {
    const overlay = this.createOverlay(
      field,
      message,
      [],
      true,
    );

    this.mountOverlay(
      field,
      overlay,
      2500,
    );
  }

  private createOverlay(
    field: AnalyzedContentField,
    message: string,
    buttons: Array<{
      label: string;
      emphasis?: boolean;
      onClick: () => void | Promise<void>;
    }>,
    compact = false,
  ): HTMLElement {
    const container = document.createElement("div");
    container.className = compact
      ? "memorybank-inline memorybank-inline-compact"
      : "memorybank-inline";

    const text = document.createElement("div");
    text.className = "memorybank-inline-text";
    text.textContent = message;
    container.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "memorybank-inline-actions";

    for (const buttonSpec of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = buttonSpec.emphasis
        ? "memorybank-inline-button memorybank-inline-button-primary"
        : "memorybank-inline-button";
      button.textContent = buttonSpec.label;
      button.addEventListener("click", () => {
        void Promise.resolve(buttonSpec.onClick()).finally(() => {
          container.remove();
          if (this.overlays.get(field.binding.descriptor.fieldId) === container) {
            this.overlays.delete(field.binding.descriptor.fieldId);
          }
        });
      });
      actions.appendChild(button);
    }

    if (buttons.length > 0) {
      container.appendChild(actions);
    }

    return container;
  }

  private mountOverlay(
    field: AnalyzedContentField,
    overlay: HTMLElement,
    autoCloseMs?: number,
  ): void {
    const fieldId = field.binding.descriptor.fieldId;
    this.overlays.get(fieldId)?.remove();
    this.overlays.set(fieldId, overlay);

    document.body.appendChild(overlay);
    this.positionOverlay(field.binding.primaryElement, overlay);

    if (autoCloseMs) {
      window.setTimeout(() => {
        overlay.remove();
        if (this.overlays.get(fieldId) === overlay) {
          this.overlays.delete(fieldId);
        }
      }, autoCloseMs);
    }
  }

  private positionOverlay(anchor: HTMLElement, overlay: HTMLElement): void {
    const visualAnchor = this.resolveVisualAnchor(anchor);
    const rect = visualAnchor.getBoundingClientRect();
    const fallbackRect = anchor.getBoundingClientRect();
    const targetRect = rect.width > 0 || rect.height > 0 ? rect : fallbackRect;

    overlay.style.position = "fixed";
    overlay.style.top = `${Math.max(8, targetRect.bottom + 6)}px`;
    overlay.style.left = `${Math.max(8, targetRect.left)}px`;
    overlay.style.maxWidth = `${Math.max(260, Math.min(420, targetRect.width || 360))}px`;
  }

  private resolveVisualAnchor(anchor: HTMLElement): HTMLElement {
    if (anchor instanceof HTMLSelectElement) {
      const select2Container = this.getSelect2Container(anchor);

      if (select2Container) {
        return select2Container;
      }
    }

    const fieldContainer = anchor.closest(
      [
        "[class*='question_']",
        ".application-question",
        ".field",
        ".form-group",
      ].join(","),
    );

    return fieldContainer instanceof HTMLElement ? fieldContainer : anchor;
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

  private ensureStyles(): void {
    if (document.getElementById(this.styleElementId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = this.styleElementId;
    style.textContent = `
      .memorybank-inline {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #f8fafc;
        color: #0f172a;
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
        max-width: 360px;
        position: fixed;
        z-index: 2147483646;
      }
      .memorybank-inline-compact {
        background: #ecfeff;
        border-color: #a5f3fc;
      }
      .memorybank-inline-text {
        flex: 1;
      }
      .memorybank-inline-actions {
        display: inline-flex;
        gap: 6px;
      }
      .memorybank-inline-button {
        border: 1px solid #94a3b8;
        background: white;
        color: #0f172a;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        font: inherit;
      }
      .memorybank-inline-button-primary {
        background: #0f172a;
        border-color: #0f172a;
        color: white;
      }
    `;

    document.head.appendChild(style);
  }
}
