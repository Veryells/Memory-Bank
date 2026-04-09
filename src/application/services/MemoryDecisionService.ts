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

    if (this.isBlankAnswer(match)) {
      return {
        action: "none",
        reason: "The matched memory has no meaningful answer to apply.",
      };
    }

    if (this.isUncheckedBoolean(match)) {
      return {
        action: "none",
        reason: "A saved unchecked checkbox does not need to be applied.",
      };
    }

    if (this.isCheckedBoolean(match)) {
      return {
        action: "autoApply",
        reason: "A saved checked checkbox is applied automatically.",
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
    return settings.isEnabled
      && settings.showInlineIndicators
      && match.confidenceLevel !== ConfidenceLevel.None
      && !this.isBlankAnswer(match)
      && !this.isUncheckedBoolean(match)
      && !this.isCheckedBoolean(match);
  }

  private isBlankAnswer(match: MatchResult): boolean {
    const answer = match.answer;

    if (!answer) {
      return true;
    }

    if (typeof answer.booleanValue === "boolean") {
      return false;
    }

    if (typeof answer.textValue === "string" && answer.textValue.trim().length > 0) {
      return false;
    }

    if (typeof answer.selectValue === "string" && answer.selectValue.trim().length > 0) {
      return false;
    }

    return !(Array.isArray(answer.multiSelectValues) && answer.multiSelectValues.length > 0);
  }

  private isUncheckedBoolean(match: MatchResult): boolean {
    return match.answer?.booleanValue === false;
  }

  private isCheckedBoolean(match: MatchResult): boolean {
    return match.answer?.booleanValue === true && (match.options?.length ?? 0) <= 1;
  }
}
