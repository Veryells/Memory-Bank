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

interface JQueryCollectionLike {
  val?(value: string): unknown;
  trigger?(eventName: string): unknown;
  select2?(command: string, value: string): unknown;
}

interface JQueryLike {
  (element: HTMLElement): JQueryCollectionLike;
}

interface WindowWithJQuery extends Window {
  $?: JQueryLike;
  jQuery?: JQueryLike;
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
      binding.primaryElement.click();
      this.setNativeValue(binding.primaryElement, targetValue);
      this.dispatchInputLikeEvents(binding.primaryElement);
      this.tryClickVisibleChoice(binding.primaryElement.ownerDocument, targetValue);
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

    const select2Container = this.findSelect2Container(select);

    if (select2Container) {
      this.writeEnhancedSelectValue(select, matchingOption, select2Container);
      return true;
    }

    this.selectNativeOption(select, matchingOption);
    this.syncJQuerySelectValue(select, matchingOption.value);
    this.dispatchInputLikeEvents(select);
    return true;
  }

  private selectNativeOption(select: HTMLSelectElement, selectedOption: HTMLOptionElement): void {
    for (const option of Array.from(select.options)) {
      option.selected = option === selectedOption;
    }

    select.value = selectedOption.value;
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

    return bestMatch && bestMatch.score >= this.getMinimumChoiceMatchScore(targetChoice)
      ? bestMatch.option
      : undefined;
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

    if (
      this.countTokens(target.normalizedText) >= 3
      && this.countTokens(option.normalizedText) >= 3
      && (
        option.normalizedText.includes(target.normalizedText)
        || target.normalizedText.includes(option.normalizedText)
      )
    ) {
      return 0.92;
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

  private getMinimumChoiceMatchScore(targetChoice: ChoiceFingerprint): number {
    return this.countTokens(targetChoice.normalizedText) >= 3 ? 0.9 : 0.6;
  }

  private countTokens(value: string): number {
    return value.split(" ").filter(Boolean).length;
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

  private setNativeValue(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): void {
    const prototype = element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  private writeEnhancedSelectValue(
    select: HTMLSelectElement,
    option: HTMLOptionElement,
    container: HTMLElement,
  ): void {
    const optionLabel = option.text.trim() || option.value;
    const targets = [optionLabel, option.value].filter(Boolean);

    if (targets.length === 0) {
      return;
    }

    this.selectNativeOption(select, option);
    this.syncJQuerySelectValue(select, option.value);
    this.dispatchInputLikeEvents(select);
    this.openEnhancedSelect(container);

    for (const delay of [0, 100, 250, 500]) {
      window.setTimeout(() => {
        if (this.clickVisibleChoice(select.ownerDocument, targets)) {
          return;
        }

        for (const target of targets) {
          this.primeSearchInput(select.ownerDocument, target);

          if (this.clickVisibleChoice(select.ownerDocument, targets)) {
            return;
          }
        }
      }, delay);
    }

    window.setTimeout(() => {
      if (select.value === option.value) {
        return;
      }

      this.selectNativeOption(select, option);
      this.syncJQuerySelectValue(select, option.value);
      this.dispatchInputLikeEvents(select);
    }, 700);
  }

  private openEnhancedSelect(container: HTMLElement): void {
    const selection = container.querySelector(
      ".select2-selection, .select2-choice, .select2-selection__rendered, .select2-chosen",
    );
    const target = selection instanceof HTMLElement ? selection : container;

    target.focus();
    this.activateElement(target);
  }

  private syncJQuerySelectValue(select: HTMLSelectElement, value: string): void {
    const collection = this.getJQueryCollection(select);

    if (!collection) {
      return;
    }

    try {
      collection.val?.(value);
      collection.trigger?.("change");
    } catch {
      // Some sites expose jQuery but not a normal val/trigger pair.
    }

    try {
      collection.select2?.("val", value);
      collection.trigger?.("change");
    } catch {
      // Select2 v4 removed select2("val"); native val/change above is enough there.
    }
  }

  private getJQueryCollection(select: HTMLSelectElement): JQueryCollectionLike | undefined {
    const view = select.ownerDocument.defaultView as WindowWithJQuery | null;
    const jQuery = view?.jQuery ?? view?.$;

    if (!jQuery) {
      return undefined;
    }

    try {
      return jQuery(select);
    } catch {
      return undefined;
    }
  }

  private findSelect2RenderedElement(select: HTMLSelectElement): HTMLElement | undefined {
    if (select.id) {
      const byContainerId = select.ownerDocument.getElementById(`select2-${select.id}-container`);

      if (byContainerId instanceof HTMLElement) {
        return byContainerId;
      }
    }

    const container = this.findSelect2Container(select);
    const rendered = container?.querySelector(".select2-selection__rendered, .select2-chosen");

    if (rendered instanceof HTMLElement) {
      return rendered;
    }

    return undefined;
  }

  private findSelect2Container(select: HTMLSelectElement): HTMLElement | undefined {
    const candidates: Array<Element | null> = [
      select.nextElementSibling,
      select.previousElementSibling,
      select.id ? select.ownerDocument.getElementById(`s2id_${select.id}`) : null,
    ];

    for (const candidate of candidates) {
      if (
        candidate instanceof HTMLElement
        && (
          candidate.classList.contains("select2")
          || candidate.classList.contains("select2-container")
        )
      ) {
        return candidate;
      }
    }

    return undefined;
  }

  private tryClickVisibleChoice(document: Document, target: string): void {
    const clickChoice = (): void => {
      this.primeSearchInput(document, target);
      this.clickVisibleChoice(document, [target]);
    };

    clickChoice();
    window.setTimeout(clickChoice, 100);
    window.setTimeout(clickChoice, 300);
  }

  private primeSearchInput(document: Document, target: string): void {
    const searchInput = Array.from(
      document.querySelectorAll(
        ".select2-search__field, .select2-input, .select2-search input, [role='searchbox']",
      ),
    )
      .find((element): element is HTMLInputElement =>
        element instanceof HTMLInputElement && this.isVisible(element),
      );

    if (!searchInput) {
      return;
    }

    searchInput.focus();
    this.setNativeValue(searchInput, target);
    searchInput.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: this.getLastCharacter(target),
    }));
    this.dispatchInputLikeEvents(searchInput);
    searchInput.dispatchEvent(new KeyboardEvent("keyup", {
      bubbles: true,
      key: this.getLastCharacter(target),
    }));
  }

  private clickVisibleChoice(document: Document, targets: string[]): boolean {
    if (targets.length === 0) {
      return false;
    }

    const targetChoices = targets.map((target) => this.toChoiceFingerprint(target));
    const minimumScore = Math.max(
      ...targetChoices.map((targetChoice) => this.getMinimumChoiceMatchScore(targetChoice)),
    );
    const candidates = Array.from(
      document.querySelectorAll(
        [
          "[role='option']",
          ".select2-results__option",
          ".select2-result",
          ".select2-result-label",
          ".select2-results li",
          "[data-option]",
        ].join(","),
      ),
    )
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => this.isVisible(element))
      .filter((element) => !element.classList.contains("select2-disabled"))
      .map((element) => ({
        element,
        score: Math.max(
          ...targetChoices.map((targetChoice) =>
            this.getChoiceMatchScore(
              targetChoice,
              this.toChoiceFingerprint(element.textContent ?? ""),
            ),
          ),
        ),
      }))
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];

    if (!best || best.score < minimumScore) {
      return false;
    }

    this.activateElement(best.element);
    return true;
  }

  private getLastCharacter(value: string): string {
    return value.length > 0 ? value.slice(-1) : "";
  }

  private activateElement(element: HTMLElement): void {
    for (const eventName of ["mousedown", "mouseup", "click"]) {
      element.dispatchEvent(new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: element.ownerDocument.defaultView,
      }));
    }
  }

  private isVisible(element: HTMLElement): boolean {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);

    if (!style || style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return element.offsetParent !== null || style.position === "fixed";
  }

  private dispatchInputLikeEvents(element: HTMLElement): void {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
