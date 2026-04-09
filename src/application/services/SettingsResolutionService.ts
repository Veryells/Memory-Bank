import { ApplyMode } from "../../domain/enums/ApplyMode.js";
import type { SiteRule } from "../../domain/models/SiteRule.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";
import type { EffectivePageSettings } from "./MemoryDecisionService.js";

export interface ResolvedSettings extends EffectivePageSettings {
  hostName: string;
  source: "global" | "site-rule";
  siteRuleApplied: boolean;
}

export class SettingsResolutionService {
  resolve(
    hostName: string,
    userSettings: UserSettings,
    siteRules: SiteRule[],
  ): ResolvedSettings {
    const matchingRule = userSettings.siteRulesEnabled
      ? siteRules.find((rule) => this.hostsMatch(rule.hostName, hostName))
      : undefined;

    const globallyEnabled = userSettings.isEnabled;
    const isEnabled = globallyEnabled && (matchingRule?.isEnabled ?? true);
    const applyMode = this.normalizeApplyMode(
      matchingRule?.overrideApplyMode ?? userSettings.defaultApplyMode,
    );

    return {
      hostName,
      isEnabled,
      applyMode: isEnabled ? applyMode : ApplyMode.Disabled,
      autoApplyConfidenceThreshold: userSettings.autoApplyConfidenceThreshold,
      showInlineIndicators: userSettings.showInlineIndicators,
      source: matchingRule ? "site-rule" : "global",
      siteRuleApplied: Boolean(matchingRule),
    };
  }

  private hostsMatch(ruleHostName: string, currentHostName: string): boolean {
    return currentHostName === ruleHostName || currentHostName.endsWith(`.${ruleHostName}`);
  }

  private normalizeApplyMode(applyMode: ApplyMode): ApplyMode {
    return applyMode === ApplyMode.SuggestOnly
      ? ApplyMode.AskBeforeApply
      : applyMode;
  }
}
