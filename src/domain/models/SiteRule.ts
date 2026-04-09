import { ApplyMode } from "../enums/ApplyMode.js";

export interface SiteRule {
  hostName: string;
  isEnabled: boolean;
  overrideApplyMode?: ApplyMode;
}
