import { FieldType } from "../../domain/enums/FieldType.js";
import type { QuestionSignature } from "../../domain/models/QuestionSignature.js";

export interface BuildQuestionSignatureInput {
  questionText: string;
  fieldType?: FieldType;
  placeholderText?: string;
  sectionText?: string;
  optionTexts?: string[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

export class QuestionNormalizationService {
  normalizeQuestionText(text: string): string {
    return text
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  extractKeywords(text: string): string[] {
    const normalized = this.normalizeQuestionText(text);

    if (!normalized) {
      return [];
    }

    const unique = new Set<string>();

    for (const token of normalized.split(" ")) {
      if (token.length < 2 || STOP_WORDS.has(token)) {
        continue;
      }

      unique.add(token);
    }

    return [...unique];
  }

  buildQuestionSignature(input: BuildQuestionSignatureInput): QuestionSignature {
    const placeholderText = input.placeholderText?.trim();
    const sectionText = input.sectionText?.trim();
    const optionTexts = input.optionTexts?.map((option) => option.trim()).filter(Boolean);

    return {
      rawQuestionText: input.questionText.trim(),
      normalizedQuestionText: this.normalizeQuestionText(input.questionText),
      keywords: this.extractKeywords(
        [input.questionText, placeholderText, sectionText]
          .filter(Boolean)
          .join(" "),
      ),
      fieldType: input.fieldType ?? FieldType.Unknown,
      ...(placeholderText ? { placeholderText } : {}),
      ...(sectionText ? { sectionText } : {}),
      ...(optionTexts && optionTexts.length > 0 ? { optionTexts } : {}),
    };
  }
}
