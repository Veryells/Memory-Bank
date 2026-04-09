import type { SettingsRepository } from "../../application/interfaces/SettingsRepository.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";
import { DEFAULT_USER_SETTINGS } from "../../shared/constants/defaultSettings.js";
import { cloneValue } from "../../shared/utils/clone.js";

export interface InMemorySettingsRepositoryOptions {
  initialSettings?: UserSettings;
}

export class InMemorySettingsRepository implements SettingsRepository {
  private settings: UserSettings;

  constructor(options: InMemorySettingsRepositoryOptions = {}) {
    this.settings = cloneValue(options.initialSettings ?? DEFAULT_USER_SETTINGS);
  }

  async load(): Promise<UserSettings> {
    return cloneValue(this.settings);
  }

  async save(settings: UserSettings): Promise<UserSettings> {
    this.settings = cloneValue(settings);
    return cloneValue(this.settings);
  }
}
