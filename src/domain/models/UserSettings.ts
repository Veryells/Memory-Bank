import { ApplyMode } from "../enums/ApplyMode.js";

export interface UserSettings {
  isEnabled: boolean;
  defaultApplyMode: ApplyMode;
  promptToSaveNewAnswers: boolean;
  autoApplyConfidenceThreshold: number;
  showInlineIndicators: boolean;
  siteRulesEnabled: boolean;
}
