import { FieldType } from "../../domain/enums/FieldType.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import type { ScannedFieldBinding } from "./types.js";

interface ChoiceFingerprint {
  rawValue: string;
  rawText: string;
  normalizedValue: string;
  normalizedText: string;
  canonicalValue: string;
  canonicalText: string;
}

export class DomFieldWriterService {
  private static readonly usStateAliases = new Map<string, string>([
    ["alabama", "al"],
    ["alaska", "ak"],
    ["arizona", "az"],
    ["arkansas", "ar"],
    ["california", "ca"],
    ["colorado", "co"],
    ["connecticut", "ct"],
    ["delaware", "de"],
    ["district of columbia", "dc"],
    ["florida", "fl"],
    ["georgia", "ga"],
    ["hawaii", "hi"],
    ["idaho", "id"],
    ["illinois", "il"],
    ["indiana", "in"],
    ["iowa", "ia"],
    ["kansas", "ks"],
    ["kentucky", "ky"],
    ["louisiana", "la"],
    ["maine", "me"],
    ["maryland", "md"],
    ["massachusetts", "ma"],
    ["michigan", "mi"],
    ["minnesota", "mn"],
    ["mississippi", "ms"],
    ["missouri", "mo"],
    ["montana", "mt"],
    ["nebraska", "ne"],
    ["nevada", "nv"],
    ["new hampshire", "nh"],
    ["new jersey", "nj"],
    ["new mexico", "nm"],
    ["new york", "ny"],
    ["north carolina", "nc"],
    ["north dakota", "nd"],
    ["ohio", "oh"],
    ["oklahoma", "ok"],
    ["oregon", "or"],
    ["pennsylvania", "pa"],
    ["rhode island", "ri"],
    ["south carolina", "sc"],
    ["south dakota", "sd"],
    ["tennessee", "tn"],
    ["texas", "tx"],
    ["utah", "ut"],
    ["vermont", "vt"],
    ["virginia", "va"],
    ["washington", "wa"],
    ["west virginia", "wv"],
    ["wisconsin", "wi"],
    ["wyoming", "wy"],
  ]);

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
    if (
      binding.primaryElement instanceof HTMLInputElement
      || binding.primaryElement instanceof HTMLTextAreaElement
    ) {
      const targetValue = answer.selectValue ?? answer.textValue;

      if (!targetValue) {
        return false;
      }

      binding.primaryElement.focus();
      binding.primaryElement.value = targetValue;
      return true;
    }

    if (!(binding.primaryElement instanceof HTMLSelectElement)) {
      return false;
    }

    const select = binding.primaryElement;

    if (select.multiple && answer.multiSelectValues) {
      const targetChoices = answer.multiSelectValues.map((value) => this.toChoiceFingerprint(value));

      for (const option of Array.from(select.options)) {
        option.selected = targetChoices.some((targetChoice) =>
          this.getChoiceMatchScore(targetChoice, this.toOptionChoice(option)) >= 0.9,
        );
      }

      return true;
    }

    const target = answer.selectValue ?? answer.textValue;

    if (!target) {
      return false;
    }

    const matchingOption = this.findBestMatchingOption(
      select,
      this.toChoiceFingerprint(target),
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

    if (binding.primaryElement.checked !== nextValue) {
      this.activateCheckable(binding.primaryElement);
    }

    return true;
  }

  private writeRadioValue(binding: ScannedFieldBinding, answer: AnswerPayload): boolean {
    const target = answer.selectValue ?? answer.textValue;

    if (!target) {
      return false;
    }

    const targetChoice = this.toChoiceFingerprint(target);
    const matchingElement = binding.elements
      .map((element) => {
        if (!(element instanceof HTMLInputElement)) {
          return undefined;
        }

        const labelText = element.labels?.[0]?.textContent ?? "";

        return {
          element,
          score: this.getChoiceMatchScore(targetChoice, {
            rawValue: element.value,
            rawText: labelText,
            normalizedValue: this.normalizeChoice(element.value),
            normalizedText: this.normalizeChoice(labelText),
            canonicalValue: this.toCanonicalChoice(element.value),
            canonicalText: this.toCanonicalChoice(labelText),
          }),
        };
      })
      .filter((candidate): candidate is { element: HTMLInputElement; score: number } =>
        Boolean(candidate),
      )
      .sort((left, right) => right.score - left.score)[0];

    if (!matchingElement || matchingElement.score < 0.6) {
      return false;
    }

    if (!matchingElement.element.checked) {
      this.activateCheckable(matchingElement.element);
    }

    return true;
  }

  private findBestMatchingOption(
    select: HTMLSelectElement,
    targetChoice: ChoiceFingerprint,
  ): HTMLOptionElement | undefined {
    const bestMatch = Array.from(select.options)
      .map((option) => ({
        option,
        score: this.getChoiceMatchScore(targetChoice, this.toOptionChoice(option)),
      }))
      .sort((left, right) => right.score - left.score)[0];

    return bestMatch && bestMatch.score >= 0.6 ? bestMatch.option : undefined;
  }

  private toOptionChoice(option: HTMLOptionElement): ChoiceFingerprint {
    return {
      rawValue: option.value,
      rawText: option.text,
      normalizedValue: this.normalizeChoice(option.value),
      normalizedText: this.normalizeChoice(option.text),
      canonicalValue: this.toCanonicalChoice(option.value),
      canonicalText: this.toCanonicalChoice(option.text),
    };
  }

  private toChoiceFingerprint(value: string): ChoiceFingerprint {
    return {
      rawValue: value,
      rawText: value,
      normalizedValue: this.normalizeChoice(value),
      normalizedText: this.normalizeChoice(value),
      canonicalValue: this.toCanonicalChoice(value),
      canonicalText: this.toCanonicalChoice(value),
    };
  }

  private getChoiceMatchScore(target: ChoiceFingerprint, option: ChoiceFingerprint): number {
    if (
      target.canonicalText === option.canonicalText
      || target.canonicalText === option.canonicalValue
      || target.canonicalValue === option.canonicalText
      || target.canonicalValue === option.canonicalValue
    ) {
      return 1;
    }

    if (
      target.normalizedText === option.normalizedText
      || target.normalizedText === option.normalizedValue
      || target.normalizedValue === option.normalizedText
      || target.normalizedValue === option.normalizedValue
    ) {
      return 0.95;
    }

    return Math.max(
      this.getTokenOverlap(target.normalizedText, option.normalizedText),
      this.getTokenOverlap(target.normalizedText, option.normalizedValue),
      this.getTokenOverlap(target.normalizedValue, option.normalizedText),
      this.getTokenOverlap(target.normalizedValue, option.normalizedValue),
    );
  }

  private getTokenOverlap(left: string, right: string): number {
    if (!left || !right) {
      return 0;
    }

    const leftTokens = new Set(left.split(" ").filter(Boolean));
    const rightTokens = new Set(right.split(" ").filter(Boolean));
    const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const denominator = Math.max(leftTokens.size, rightTokens.size);

    return denominator === 0 ? 0 : overlap / denominator;
  }

  private normalizeChoice(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private toCanonicalChoice(value: string): string {
    const normalized = this.normalizeChoice(value);

    if (!normalized) {
      return normalized;
    }

    return this.normalizeStateChoice(normalized)
      ?? this.normalizeEthnicityChoice(normalized)
      ?? normalized;
  }

  private normalizeStateChoice(value: string): string | undefined {
    if (value.length === 2) {
      return value;
    }

    return DomFieldWriterService.usStateAliases.get(value);
  }

  private normalizeEthnicityChoice(value: string): string | undefined {
    const compact = value
      .replace(/\b(race|ethnicity|origin|choose|select|option)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!compact) {
      return undefined;
    }

    if (/(^| )not hispanic( or latino)?$/.test(compact) || compact === "non hispanic") {
      return "not hispanic or latino";
    }

    if (/(^| )(hispanic|latino|latina|latinx)( or latino)?$/.test(compact)) {
      return "hispanic or latino";
    }

    if (compact === "black" || compact === "african american" || compact === "black african american") {
      return "black or african american";
    }

    if (compact === "american indian" || compact === "alaska native" || compact === "american indian alaska native") {
      return "american indian or alaska native";
    }

    if (compact === "native hawaiian" || compact === "pacific islander" || compact === "native hawaiian pacific islander") {
      return "native hawaiian or other pacific islander";
    }

    if (compact === "multi racial" || compact === "multiracial" || compact === "two or more") {
      return "two or more races";
    }

    if (compact === "decline" || compact === "prefer not to answer" || compact === "no answer") {
      return "prefer not to say";
    }

    return undefined;
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

  private activateCheckable(element: HTMLInputElement): void {
    const label = element.labels?.[0];

    if (label instanceof HTMLElement) {
      label.click();
      return;
    }

    element.click();
  }
}
