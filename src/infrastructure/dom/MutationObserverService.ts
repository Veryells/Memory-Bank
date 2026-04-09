export interface MutationObservationHandle {
  disconnect(): void;
}

export interface MutationObserverServiceOptions {
  debounceMs?: number;
  config?: MutationObserverInit;
}

export class MutationObserverService {
  private static readonly ignoredClassNames = [
    "memorybank-inline",
    "memorybank-inline-compact",
    "memorybank-inline-text",
    "memorybank-inline-actions",
    "memorybank-inline-button",
    "memorybank-inline-button-primary",
  ];

  observe(
    target: Node,
    onMutation: () => void,
    options: MutationObserverServiceOptions = {},
  ): MutationObservationHandle {
    const debounceMs = options.debounceMs ?? 200;
    let timeoutId: number | undefined;

    const observer = new MutationObserver((mutations) => {
      if (!this.hasRelevantMutation(mutations)) {
        return;
      }

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        onMutation();
      }, debounceMs);
    });

    observer.observe(target, options.config ?? {
      childList: true,
      subtree: true,
    });

    return {
      disconnect: () => {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }

        observer.disconnect();
      },
    };
  }

  private hasRelevantMutation(mutations: MutationRecord[]): boolean {
    return mutations.some((mutation) => {
      if (mutation.type === "childList") {
        const changedNodes = [
          ...Array.from(mutation.addedNodes),
          ...Array.from(mutation.removedNodes),
        ];

        return changedNodes.some((node) => !this.isMemoryBankNode(node));
      }

      return !this.isMemoryBankNode(mutation.target);
    });
  }

  private isMemoryBankNode(node: Node | null): boolean {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    if (node.id === "memorybank-inline-styles") {
      return true;
    }

    return MutationObserverService.ignoredClassNames.some((className) =>
      node.classList.contains(className) || node.closest(`.${className}`) !== null,
    );
  }
}
