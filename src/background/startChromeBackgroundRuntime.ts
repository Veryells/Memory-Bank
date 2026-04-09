import { BackgroundMessageRouter } from "./handlers/BackgroundMessageRouter.js";
import { ChromeMessagingService } from "../infrastructure/browser/ChromeMessagingService.js";
import { ChromeStorageService } from "../infrastructure/browser/ChromeStorageService.js";
import { getChromeApi } from "../infrastructure/browser/getChromeApi.js";
import { ChromeMemoryRepository } from "../infrastructure/storage/ChromeMemoryRepository.js";
import { ChromeSettingsRepository } from "../infrastructure/storage/ChromeSettingsRepository.js";
import { ChromeSiteRulesRepository } from "../infrastructure/storage/ChromeSiteRulesRepository.js";

export function startChromeBackgroundRuntime(): () => void {
  const chromeApi = getChromeApi();
  const storageService = new ChromeStorageService(chromeApi);
  const router = new BackgroundMessageRouter({
    memoryRepository: new ChromeMemoryRepository(storageService),
    settingsRepository: new ChromeSettingsRepository(storageService),
    siteRulesRepository: new ChromeSiteRulesRepository(storageService),
  });
  const messagingService = new ChromeMessagingService(chromeApi);

  return messagingService.registerBackgroundHandler(router);
}
