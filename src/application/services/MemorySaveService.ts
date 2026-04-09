import { AnswerType } from "../../domain/enums/AnswerType.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import { QuestionNormalizationService } from "./QuestionNormalizationService.js";

export interface SaveMemoryInput {
  questionText: string;
  answer: AnswerPayload;
  hostName: string;
  tags?: string[];
  existingId?: string;
  now?: Date | string;
}

export interface SaveMemoryResult {
  kind: "created" | "updated";
  memory: MemoryEntry;
  duplicateOfId?: string;
}

export class MemorySaveService {
  constructor(
    private readonly normalizationService: QuestionNormalizationService = new QuestionNormalizationService(),
  ) {}

  inferAnswerType(answer: AnswerPayload): AnswerType {
    if (typeof answer.booleanValue === "boolean") {
      return AnswerType.Boolean;
    }

    if (Array.isArray(answer.multiSelectValues) && answer.multiSelectValues.length > 0) {
      return AnswerType.MultiSelect;
    }

    if (typeof answer.selectValue === "string" && answer.selectValue.trim().length > 0) {
      return AnswerType.SelectChoice;
    }

    if (typeof answer.textValue === "string" && answer.textValue.trim().length > 0) {
      return AnswerType.Text;
    }

    return AnswerType.Unknown;
  }

  save(input: SaveMemoryInput, existingMemories: MemoryEntry[]): SaveMemoryResult {
    const now = this.resolveTimestamp(input.now);
    const normalizedQuestionText = this.normalizationService.normalizeQuestionText(input.questionText);
    const answerType = this.inferAnswerType(input.answer);

    if (!normalizedQuestionText) {
      throw new Error("Cannot save a memory without question text.");
    }

    if (answerType === AnswerType.Unknown) {
      throw new Error("Cannot save a memory with an empty answer payload.");
    }

    const duplicate = existingMemories.find((memory) =>
      memory.normalizedQuestionText === normalizedQuestionText &&
      memory.answerType === answerType &&
      this.serializeAnswer(memory.answer) === this.serializeAnswer(input.answer),
    );

    if (duplicate) {
      const mergedHosts = this.mergeUniqueStrings(duplicate.sourceHosts, [input.hostName]);
      const mergedTags = this.mergeUniqueStrings(duplicate.tags, input.tags ?? []);

      return {
        kind: "updated",
        duplicateOfId: duplicate.id,
        memory: {
          ...duplicate,
          questionText: input.questionText.trim(),
          normalizedQuestionText,
          answer: input.answer,
          tags: mergedTags,
          sourceHosts: mergedHosts,
          updatedAt: now,
        },
      };
    }

    const id = input.existingId ?? this.createMemoryId(normalizedQuestionText, now);

    return {
      kind: "created",
      memory: {
        id,
        questionText: input.questionText.trim(),
        normalizedQuestionText,
        answer: input.answer,
        answerType,
        tags: this.mergeUniqueStrings([], input.tags ?? []),
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        enabled: true,
        sourceHosts: this.mergeUniqueStrings([], [input.hostName]),
      },
    };
  }

  private createMemoryId(normalizedQuestionText: string, timestamp: string): string {
    const compactQuestion = normalizedQuestionText.replace(/\s+/g, "-").slice(0, 40);
    const compactTimestamp = timestamp.replace(/[^0-9]/g, "").slice(0, 14);

    return `mem_${compactQuestion}_${compactTimestamp}`;
  }

  private resolveTimestamp(value?: Date | string): string {
    if (!value) {
      return new Date().toISOString();
    }

    if (typeof value === "string") {
      return new Date(value).toISOString();
    }

    return value.toISOString();
  }

  private mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
    return [...new Set([...existing, ...incoming.map((value) => value.trim()).filter(Boolean)])];
  }

  private serializeAnswer(answer: AnswerPayload): string {
    return JSON.stringify({
      textValue: answer.textValue?.trim() || undefined,
      booleanValue: answer.booleanValue,
      selectValue: answer.selectValue?.trim() || undefined,
      multiSelectValues: answer.multiSelectValues?.map((value) => value.trim()) ?? undefined,
    });
  }
}
