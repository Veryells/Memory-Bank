import type { SettingsRepository } from "../../application/interfaces/SettingsRepository.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";
import { STORAGE_KEYS } from "../../shared/constants/storageKeys.js";
import { DEFAULT_USER_SETTINGS } from "../../shared/constants/defaultSettings.js";
import { ChromeStorageService } from "../browser/ChromeStorageService.js";
import { cloneValue } from "../../shared/utils/clone.js";

export class ChromeSettingsRepository implements SettingsRepository {
  constructor(private readonly storageService: ChromeStorageService) {}

  async load(): Promise<UserSettings> {
    return this.storageService.getValue<UserSettings>(
      STORAGE_KEYS.settings,
      DEFAULT_USER_SETTINGS,
    );
  }

  async save(settings: UserSettings): Promise<UserSettings> {
    await this.storageService.setValue(STORAGE_KEYS.settings, settings);
    return cloneValue(settings);
  }
}
