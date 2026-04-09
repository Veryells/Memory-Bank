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
    return this.applyDomainAliases(text)
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

  private applyDomainAliases(text: string): string {
    return text
      .replace(/race\s*\/\s*ethnicity/gi, "ethnicity")
      .replace(/ethnicity\s*\/\s*race/gi, "ethnicity")
      .replace(/ethnic origin/gi, "ethnicity")
      .replace(/preferred first name/gi, "preferred name")
      .replace(/first name \(preferred\)/gi, "preferred name")
      .replace(/preferred given name/gi, "preferred name")
      .replace(/given name/gi, "first name")
      .replace(/family name/gi, "last name")
      .replace(/surname/gi, "last name")
      .replace(/last\s*\/\s*family name/gi, "last name")
      .replace(/family\s*\/\s*last name/gi, "last name")
      .replace(/state\s*\/\s*province/gi, "state")
      .replace(/province\s*\/\s*state/gi, "state")
      .replace(/state\s*\/\s*region/gi, "state")
      .replace(/region\s*\/\s*state/gi, "state");
  }
}
