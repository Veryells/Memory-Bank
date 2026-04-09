import type { ChromeApiLike, ChromeStorageAreaLike } from "./ChromeApi.js";
import { cloneValue } from "../../shared/utils/clone.js";

export class ChromeStorageService {
  private readonly storageArea: ChromeStorageAreaLike;

  constructor(
    private readonly chromeApi: ChromeApiLike,
    storageArea?: ChromeStorageAreaLike,
  ) {
    this.storageArea = storageArea ?? chromeApi.storage.local;
  }

  async getValue<T>(key: string, fallback: T): Promise<T> {
    const items = await this.execute<Record<string, unknown>>((callback) =>
      this.storageArea.get(key, callback),
    );
    const value = items[key];

    return value === undefined ? cloneValue(fallback) : (cloneValue(value) as T);
  }

  async setValue<T>(key: string, value: T): Promise<void> {
    await this.execute<void>((callback) =>
      this.storageArea.set({ [key]: cloneValue(value) }, () => callback(undefined)),
    );
  }

  async removeValue(key: string): Promise<void> {
    await this.execute<void>((callback) =>
      this.storageArea.remove(key, () => callback(undefined)),
    );
  }

  private async execute<T>(
    operation: (callback: (value: T) => void) => Promise<T> | void,
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

        if (this.isPromise<T>(maybePromise)) {
          void maybePromise.then(resolveOnce, rejectOnce);
        }
      } catch (error) {
        rejectOnce(error);
      }
    });
  }

  private isPromise<T>(value: Promise<T> | void): value is Promise<T> {
    return typeof value === "object" && value !== null && "then" in value;
  }
}
