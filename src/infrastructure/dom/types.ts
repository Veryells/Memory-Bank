import type { FieldType } from "../../domain/enums/FieldType.js";
import type { DetectedFieldDescriptor } from "../../domain/models/DetectedFieldDescriptor.js";

export type SupportedFormElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

export interface DomQuestionLocatorResult {
  questionText: string;
  placeholderText?: string;
  sectionText?: string;
  nearbyText?: string;
  optionTexts?: string[];
}

export interface ScannedFieldBinding {
  descriptor: DetectedFieldDescriptor;
  fieldType: FieldType;
  primaryElement: SupportedFormElement;
  elements: SupportedFormElement[];
}
