import type { BackgroundMessageClient } from "../../application/interfaces/BackgroundMessageClient.js";
import type { BackgroundMessageRouter } from "../../background/handlers/BackgroundMessageRouter.js";
import type {
  BackgroundMessageType,
  BackgroundRequest,
  BackgroundRequestMap,
  BackgroundResponse,
  BackgroundResponseMap,
} from "../../shared/types/messages.js";
import type {
  ChromeApiLike,
  ChromeRuntimeLike,
  ChromeRuntimeMessageListener,
} from "./ChromeApi.js";

export class ChromeMessagingService implements BackgroundMessageClient {
  private readonly runtime: ChromeRuntimeLike;

  constructor(
    private readonly chromeApi: ChromeApiLike,
    runtime?: ChromeRuntimeLike,
  ) {
    this.runtime = runtime ?? chromeApi.runtime;
  }

  async send<TType extends BackgroundMessageType>(
    type: TType,
    payload: BackgroundRequestMap[TType],
  ): Promise<BackgroundResponseMap[TType]> {
    const response = await this.execute<BackgroundResponse<TType>>((callback) =>
      this.runtime.sendMessage(
        { type, payload },
        (response) => callback(response as BackgroundResponse<TType>),
      ),
    );

    if (!response.ok) {
      throw new Error(response.error.message);
    }

    return response.payload as BackgroundResponseMap[TType];
  }

  registerBackgroundHandler(router: BackgroundMessageRouter): () => void {
    const listener: ChromeRuntimeMessageListener = (message, _sender, sendResponse) => {
      if (!this.isBackgroundRequest(message)) {
        sendResponse({
          type: "loadSettings",
          ok: false,
          error: {
            code: "INVALID_MESSAGE",
            message: "Message did not match the expected background request shape.",
          },
        } satisfies BackgroundResponse<"loadSettings">);
        return false;
      }

      void router.handleMessage(message).then(sendResponse, (error) => {
        sendResponse({
          type: message.type,
          ok: false,
          error: {
            code: "UNEXPECTED_ROUTER_FAILURE",
            message: error instanceof Error ? error.message : "Unknown router failure.",
          },
        });
      });

      return true;
    };

    this.runtime.onMessage.addListener(listener);

    return () => {
      this.runtime.onMessage.removeListener(listener);
    };
  }

  private async execute<T>(
    operation: (callback: (value: T) => void) => Promise<unknown> | void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const resolveOnce = (value: T): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };

      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error);
      };

      try {
        const maybePromise = operation((value) => {
          const runtimeError = this.chromeApi.runtime.lastError;

          if (runtimeError?.message) {
            rejectOnce(new Error(runtimeError.message));
            return;
          }

          resolveOnce(value);
        });

        if (this.isPromise(maybePromise)) {
          void maybePromise.then(
            (value) => resolveOnce(value as T),
            rejectOnce,
          );
        }
      } catch (error) {
        rejectOnce(error);
      }
    });
  }

  private isBackgroundRequest(message: unknown): message is BackgroundRequest {
    if (typeof message !== "object" || message === null) {
      return false;
    }

    return "type" in message && "payload" in message;
  }

  private isPromise(value: Promise<unknown> | void): value is Promise<unknown> {
    return typeof value === "object" && value !== null && "then" in value;
  }
}
