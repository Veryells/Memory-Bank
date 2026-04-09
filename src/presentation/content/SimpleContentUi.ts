import type {
  AnalyzedContentField,
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
      onAutoApplied: async (field) => {
        this.showNoticeOverlay(field, "Saved answer applied.");
      },
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
    const overlay = this.createOverlay(
      request.field,
      message,
      [
        {
          label: primaryLabel,
          emphasis: true,
          onClick: async () => {
            const applied = await request.apply();

            if (applied) {
              this.showNoticeOverlay(request.field, "Saved answer applied.");
            } else {
              this.showNoticeOverlay(request.field, "Could not apply saved answer.");
            }
          },
        },
        {
          label: "Dismiss",
          onClick: () => undefined,
        },
      ],
    );

    this.mountOverlay(
      request.field.binding.descriptor.fieldId,
      request.field.binding.primaryElement,
      overlay,
    );
  }

  private async showSaveOverlay(request: SaveCandidateRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const overlay = this.createOverlay(
        request.field,
        "Save this answer?",
        [
          {
            label: "Save",
            emphasis: true,
            onClick: async () => {
              resolve(true);
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
        request.field.binding.descriptor.fieldId,
        request.field.binding.primaryElement,
        overlay,
      );
    });
  }

  private showNoticeOverlay(field: AnalyzedContentField, message: string): void {
    const overlay = this.createOverlay(
      field,
      message,
      [
        {
          label: "Close",
          onClick: () => undefined,
        },
      ],
      true,
    );

    this.mountOverlay(
      field.binding.descriptor.fieldId,
      field.binding.primaryElement,
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
          this.overlays.delete(field.binding.descriptor.fieldId);
        });
      });
      actions.appendChild(button);
    }

    container.appendChild(actions);
    return container;
  }

  private mountOverlay(
    fieldId: string,
    anchor: HTMLElement,
    overlay: HTMLElement,
    autoCloseMs?: number,
  ): void {
    this.overlays.get(fieldId)?.remove();
    this.overlays.set(fieldId, overlay);

    if (anchor.parentElement) {
      anchor.insertAdjacentElement("afterend", overlay);
    } else {
      document.body.appendChild(overlay);
    }

    if (autoCloseMs) {
      window.setTimeout(() => {
        overlay.remove();
        this.overlays.delete(fieldId);
      }, autoCloseMs);
    }
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
        margin: 6px 0 0;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #f8fafc;
        color: #0f172a;
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
        max-width: 360px;
        position: relative;
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
