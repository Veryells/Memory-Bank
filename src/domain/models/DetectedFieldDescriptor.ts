import { FieldType } from "../enums/FieldType.js";

export interface DetectedFieldDescriptor {
  fieldId: string;
  fieldType: FieldType;
  questionText: string;
  placeholderText?: string;
  isRequired: boolean;
  optionTexts?: string[];
  hostName: string;
  sectionText?: string;
}
