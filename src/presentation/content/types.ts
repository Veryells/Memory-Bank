import type { SaveMemoryResult } from "../../application/services/MemorySaveService.js";
import type { FieldAnalysisResult } from "../../application/types/FieldAnalysisResult.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import type { ScannedFieldBinding } from "../../infrastructure/dom/types.js";

export interface AnalyzedContentField {
  binding: ScannedFieldBinding;
  analysis: FieldAnalysisResult;
}

export interface ContentActionRequest {
  field: AnalyzedContentField;
  apply(): Promise<boolean>;
}

export interface SaveCandidateRequest {
  field: AnalyzedContentField;
  answer: AnswerPayload;
  save(): Promise<SaveMemoryResult>;
}

export interface ContentRuntimeCallbacks {
  onSuggestion?(request: ContentActionRequest): void | Promise<void>;
  onPrompt?(request: ContentActionRequest): void | Promise<void>;
  onAutoApplied?(field: AnalyzedContentField): void | Promise<void>;
  onSaveCandidate?(
    request: SaveCandidateRequest,
  ): boolean | void | Promise<boolean | void>;
  onAnalysisComplete?(fields: AnalyzedContentField[]): void | Promise<void>;
  onError?(error: unknown): void | Promise<void>;
}

export interface ContentRuntimeHandle {
  refresh(): Promise<void>;
  stop(): void;
}
