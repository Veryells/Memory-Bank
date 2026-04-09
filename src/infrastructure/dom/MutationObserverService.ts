export interface MutationObservationHandle {
  disconnect(): void;
}

export interface MutationObserverServiceOptions {
  debounceMs?: number;
  config?: MutationObserverInit;
}

export class MutationObserverService {
  observe(
    target: Node,
    onMutation: () => void,
    options: MutationObserverServiceOptions = {},
  ): MutationObservationHandle {
    const debounceMs = options.debounceMs ?? 200;
    let timeoutId: number | undefined;

    const observer = new MutationObserver(() => {
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
      attributes: true,
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
}
