import type { UserSettings } from "../domain/models/UserSettings.js";
import type { MemoryEntry } from "../domain/models/MemoryEntry.js";
import type { SiteRule } from "../domain/models/SiteRule.js";
import { BackgroundMessageRouter } from "./handlers/BackgroundMessageRouter.js";
import { InMemoryMemoryRepository } from "../infrastructure/storage/InMemoryMemoryRepository.js";
import { InMemorySettingsRepository } from "../infrastructure/storage/InMemorySettingsRepository.js";
import { InMemorySiteRulesRepository } from "../infrastructure/storage/InMemorySiteRulesRepository.js";

export interface InMemoryBackgroundRuntimeOptions {
  initialMemories?: MemoryEntry[];
  initialSettings?: UserSettings;
  initialSiteRules?: SiteRule[];
}

export function createInMemoryBackgroundRuntime(
  options: InMemoryBackgroundRuntimeOptions = {},
): BackgroundMessageRouter {
  return new BackgroundMessageRouter({
    memoryRepository: new InMemoryMemoryRepository(
      options.initialMemories
        ? { initialMemories: options.initialMemories }
        : {},
    ),
    settingsRepository: new InMemorySettingsRepository(
      options.initialSettings
        ? { initialSettings: options.initialSettings }
        : {},
    ),
    siteRulesRepository: new InMemorySiteRulesRepository(
      options.initialSiteRules
        ? { initialRules: options.initialSiteRules }
        : {},
    ),
  });
}
