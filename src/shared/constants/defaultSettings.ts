import { ApplyMode } from "../../domain/enums/ApplyMode.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  isEnabled: true,
  defaultApplyMode: ApplyMode.AskBeforeApply,
  promptToSaveNewAnswers: true,
  autoApplyConfidenceThreshold: 0.9,
  showInlineIndicators: true,
  siteRulesEnabled: true,
};
