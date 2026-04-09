import type { UserSettings } from "../../domain/models/UserSettings.js";

export interface SettingsRepository {
  load(): Promise<UserSettings>;
  save(settings: UserSettings): Promise<UserSettings>;
}
