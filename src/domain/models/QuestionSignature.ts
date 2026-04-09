import { FieldType } from "../enums/FieldType.js";

export interface QuestionSignature {
  rawQuestionText: string;
  normalizedQuestionText: string;
  keywords: string[];
  fieldType: FieldType;
  placeholderText?: string;
  sectionText?: string;
  optionTexts?: string[];
}
