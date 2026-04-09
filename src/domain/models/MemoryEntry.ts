import { AnswerType } from "../enums/AnswerType.js";
import type { AnswerPayload } from "./AnswerPayload.js";

export interface MemoryEntry {
  id: string;
  questionText: string;
  normalizedQuestionText: string;
  answer: AnswerPayload;
  answerType: AnswerType;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt?: string;
  enabled: boolean;
  sourceHosts: string[];
}
