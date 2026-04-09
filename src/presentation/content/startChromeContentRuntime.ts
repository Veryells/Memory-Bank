import { ChromeMessagingService } from "../../infrastructure/browser/ChromeMessagingService.js";
import { getChromeApi } from "../../infrastructure/browser/getChromeApi.js";
import { createChromeContentRuntime } from "./ContentRuntime.js";
import type { ContentRuntimeCallbacks, ContentRuntimeHandle } from "./types.js";

export async function startChromeContentRuntime(
  callbacks: ContentRuntimeCallbacks = {},
): Promise<ContentRuntimeHandle> {
  const chromeApi = getChromeApi();
  const messagingService = new ChromeMessagingService(chromeApi);
  const runtime = createChromeContentRuntime(messagingService, callbacks);

  return runtime.start(document);
}
