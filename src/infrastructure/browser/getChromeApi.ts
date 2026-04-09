import type { ChromeApiLike } from "./ChromeApi.js";

export function getChromeApi(): ChromeApiLike {
  const chromeApi = (
    globalThis as typeof globalThis & { chrome?: ChromeApiLike }
  ).chrome;

  if (!chromeApi) {
    throw new Error("Chrome runtime APIs are not available in the current environment.");
  }

  return chromeApi;
}
