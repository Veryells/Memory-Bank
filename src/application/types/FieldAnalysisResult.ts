import type { MemoryDecision } from "../services/MemoryDecisionService.js";
import type { ResolvedSettings } from "../services/SettingsResolutionService.js";
import type { DetectedFieldDescriptor } from "../../domain/models/DetectedFieldDescriptor.js";
import type { MatchResult } from "../../domain/models/MatchResult.js";
import type { QuestionSignature } from "../../domain/models/QuestionSignature.js";

export interface FieldAnalysisResult {
  field: DetectedFieldDescriptor;
  signature: QuestionSignature;
  match: MatchResult;
  settings: ResolvedSettings;
  decision: MemoryDecision;
  showInlineIndicator: boolean;
}
