import { ApplyMode } from "../../domain/enums/ApplyMode.js";
import { ConfidenceLevel } from "../../domain/enums/ConfidenceLevel.js";
import type { MatchResult } from "../../domain/models/MatchResult.js";

export type MemoryDecisionType = "none" | "suggest" | "prompt" | "autoApply";

export interface EffectivePageSettings {
  isEnabled: boolean;
  applyMode: ApplyMode;
  autoApplyConfidenceThreshold: number;
  showInlineIndicators: boolean;
}

export interface MemoryDecision {
  action: MemoryDecisionType;
  reason: string;
}

export class MemoryDecisionService {
  decide(match: MatchResult, settings: EffectivePageSettings): MemoryDecision {
    if (!settings.isEnabled) {
      return {
        action: "none",
        reason: "MemoryBank is disabled for this page.",
      };
    }

    if (!match.hasMatch) {
      return {
        action: "none",
        reason: "No suitable memory was found.",
      };
    }

    switch (settings.applyMode) {
      case ApplyMode.Disabled:
        return {
          action: "none",
          reason: "Apply mode is disabled.",
        };
      case ApplyMode.SuggestOnly:
        return {
          action: "suggest",
          reason: "SuggestOnly mode always surfaces a suggestion.",
        };
      case ApplyMode.AskBeforeApply:
        return {
          action: "prompt",
          reason: "AskBeforeApply mode requires user confirmation.",
        };
      case ApplyMode.AutoApply:
        if ((match.options?.length ?? 0) > 1) {
          return {
            action: "prompt",
            reason: "Multiple saved answers were found, so user selection is required.",
          };
        }

        if (match.confidenceScore >= settings.autoApplyConfidenceThreshold) {
          return {
            action: "autoApply",
            reason: "Match confidence cleared the auto-apply threshold.",
          };
        }

        return {
          action: "prompt",
          reason: "AutoApply mode fell back to a prompt because confidence was too low.",
        };
      default:
        return {
          action: "none",
          reason: "Unknown apply mode.",
        };
    }
  }

  shouldShowInlineIndicator(
    match: MatchResult,
    settings: Pick<EffectivePageSettings, "isEnabled" | "showInlineIndicators">,
  ): boolean {
    return settings.isEnabled && settings.showInlineIndicators && match.confidenceLevel !== ConfidenceLevel.None;
  }
}
