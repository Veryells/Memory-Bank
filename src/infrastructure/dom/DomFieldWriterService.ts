import { FieldType } from "../../domain/enums/FieldType.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import type { ScannedFieldBinding } from "./types.js";

export class DomFieldWriterService {
  write(binding: ScannedFieldBinding, answer: AnswerPayload): boolean {
    switch (binding.fieldType) {
      case FieldType.Text:
      case FieldType.TextArea:
        return this.writeTextLikeValue(binding, answer);
      case FieldType.Select:
        return this.writeSelectValue(binding, answer);
      case FieldType.Checkbox:
        return this.writeCheckboxValue(binding, answer);
      case FieldType.Radio:
        return this.writeRadioValue(binding, answer);
      default:
        return false;
    }
  }

  private writeTextLikeValue(binding: ScannedFieldBinding, answer: AnswerPayload): boolean {
    const targetValue =
      answer.textValue ??
      answer.selectValue ??
      answer.multiSelectValues?.join(", ");

    if (!targetValue) {
      return false;
    }

    if (!(binding.primaryElement instanceof HTMLInputElement || binding.primaryElement instanceof HTMLTextAreaElement)) {
      return false;
    }

    binding.primaryElement.value = targetValue;
    return true;
  }

  private writeSelectValue(binding: ScannedFieldBinding, answer: AnswerPayload): boolean {
    if (!(binding.primaryElement instanceof HTMLSelectElement)) {
      return false;
    }

    const select = binding.primaryElement;

    if (select.multiple && answer.multiSelectValues) {
      const normalizedTargets = new Set(
        answer.multiSelectValues.map((value) => this.normalizeChoice(value)),
      );

      for (const option of Array.from(select.options)) {
        option.selected = normalizedTargets.has(this.normalizeChoice(option.value))
          || normalizedTargets.has(this.normalizeChoice(option.text));
      }

      return true;
    }

    const target = answer.selectValue ?? answer.textValue;

    if (!target) {
      return false;
    }

    const normalizedTarget = this.normalizeChoice(target);
    const matchingOption = Array.from(select.options).find((option) =>
      this.normalizeChoice(option.value) === normalizedTarget
      || this.normalizeChoice(option.text) === normalizedTarget,
    );

    if (!matchingOption) {
      return false;
    }

    select.value = matchingOption.value;
    return true;
  }

  private writeCheckboxValue(binding: ScannedFieldBinding, answer: AnswerPayload): boolean {
    if (!(binding.primaryElement instanceof HTMLInputElement)) {
      return false;
    }

    const nextValue = typeof answer.booleanValue === "boolean"
      ? answer.booleanValue
      : this.coerceBoolean(answer.textValue);

    if (nextValue === undefined) {
      return false;
    }

    binding.primaryElement.checked = nextValue;
    return true;
  }

  private writeRadioValue(binding: ScannedFieldBinding, answer: AnswerPayload): boolean {
    const target = answer.selectValue ?? answer.textValue;

    if (!target) {
      return false;
    }

    const normalizedTarget = this.normalizeChoice(target);
    const matchingElement = binding.elements.find((element) => {
      if (!(element instanceof HTMLInputElement)) {
        return false;
      }

      const labelText = element.labels?.[0]?.textContent ?? "";

      return this.normalizeChoice(element.value) === normalizedTarget
        || this.normalizeChoice(labelText) === normalizedTarget;
    });

    if (!(matchingElement instanceof HTMLInputElement)) {
      return false;
    }

    matchingElement.checked = true;
    return true;
  }

  private normalizeChoice(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }

  private coerceBoolean(value?: string): boolean | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.toLowerCase().trim();

    if (["true", "yes", "1", "checked"].includes(normalized)) {
      return true;
    }

    if (["false", "no", "0", "unchecked"].includes(normalized)) {
      return false;
    }

    return undefined;
  }
}
