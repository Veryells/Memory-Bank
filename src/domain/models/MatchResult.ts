import { ConfidenceLevel } from "../enums/ConfidenceLevel.js";
import type { AnswerPayload } from "./AnswerPayload.js";

export interface MatchedMemoryOption {
  memoryId: string;
  questionText: string;
  answer: AnswerPayload;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  reason: string;
}

export interface MatchResult {
  memoryId?: string;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  reason: string;
  matchedQuestionText?: string;
  answer?: AnswerPayload;
  hasMatch: boolean;
  alternateMemoryIds?: string[];
  options?: MatchedMemoryOption[];
}
