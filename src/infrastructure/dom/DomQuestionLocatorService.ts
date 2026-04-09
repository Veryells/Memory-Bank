import type {
  DomQuestionLocatorResult,
  SupportedFormElement,
} from "./types.js";

export class DomQuestionLocatorService {
  locate(
    primaryElement: SupportedFormElement,
    elements: SupportedFormElement[] = [primaryElement],
  ): DomQuestionLocatorResult {
    const labelText = this.getLabelText(primaryElement, elements);
    const greenhouseQuestionText = this.getGreenhouseQuestionText(primaryElement);
    const ariaLabel = this.normalizeWhitespace(primaryElement.getAttribute("aria-label"));
    const ariaLabelledByText = this.getAriaLabelledByText(primaryElement);
    const placeholderText = this.getPlaceholderText(primaryElement);
    const dropdownPromptText = this.getDropdownPromptText(primaryElement);
    const legendText = this.getLegendText(primaryElement);
    const headingText = this.getSectionHeadingText(primaryElement);
    const containerLabelText = this.getContainerLabelText(primaryElement);
    const nearbyText = this.getNearbyText(primaryElement);
    const fallbackName = this.normalizeWhitespace(primaryElement.getAttribute("name"));
    const fallbackId = this.normalizeWhitespace(primaryElement.id);
    const optionTexts = this.getOptionTexts(primaryElement, elements);
    const effectivePlaceholderText = placeholderText ?? dropdownPromptText;

    const questionText = this.firstNonEmpty(
      labelText,
      greenhouseQuestionText,
      ariaLabelledByText,
      ariaLabel,
      legendText,
      containerLabelText,
      dropdownPromptText,
      nearbyText,
      placeholderText,
      fallbackName,
      fallbackId,
    ) ?? "Untitled field";
    const sectionText = this.firstNonEmpty(legendText, headingText);

    return {
      questionText,
      ...(effectivePlaceholderText ? { placeholderText: effectivePlaceholderText } : {}),
      ...(sectionText ? { sectionText } : {}),
      ...(nearbyText ? { nearbyText } : {}),
      ...(optionTexts.length > 0 ? { optionTexts } : {}),
    };
  }

  private getLabelText(
    primaryElement: SupportedFormElement,
    elements: SupportedFormElement[],
  ): string | undefined {
    const texts: string[] = [];

    if ("labels" in primaryElement && primaryElement.labels) {
      for (const label of Array.from(primaryElement.labels)) {
        const text = this.extractReadableText(label);

        if (text) {
          texts.push(text);
        }
      }
    }

    const wrappingLabel = primaryElement.closest("label");
    const wrappingLabelText = wrappingLabel
      ? this.extractReadableText(wrappingLabel)
      : undefined;

    if (wrappingLabelText) {
      texts.push(wrappingLabelText);
    }

    if (primaryElement instanceof HTMLInputElement && primaryElement.type === "radio") {
      for (const element of elements) {
        if (!(element instanceof HTMLInputElement)) {
          continue;
        }

        const label = element.labels?.[0];
        const labelText = label ? this.extractReadableText(label) : undefined;

        if (labelText) {
          texts.push(labelText);
        }
      }
    }

    return this.firstNonEmpty(...texts);
  }

  private getGreenhouseQuestionText(element: SupportedFormElement): string | undefined {
    const container = element.closest(
      [
        "[class^='question_']",
        "[class*=' question_']",
        "[class*='question_']",
        ".application-question",
        ".field",
        ".form-group",
      ].join(","),
    );

    if (!container) {
      return undefined;
    }

    const label = container.querySelector("label");
    const labelText = label ? this.extractReadableText(label) : undefined;

    if (labelText && !this.isGenericDropdownPrompt(labelText)) {
      return labelText;
    }

    const directText = Array.from(container.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => this.normalizeWhitespace(node.textContent))
      .filter((text): text is string => Boolean(text))
      .join(" ");

    if (directText && !this.isGenericDropdownPrompt(directText)) {
      return directText;
    }

    const text = this.extractReadableText(container);

    if (text && !this.isGenericDropdownPrompt(text)) {
      return text;
    }

    return undefined;
  }

  private getAriaLabelledByText(element: SupportedFormElement): string | undefined {
    const labelledBy = element.getAttribute("aria-labelledby");

    if (!labelledBy) {
      return undefined;
    }

    const doc = element.ownerDocument;
    const texts = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .map((labelledNode) => (labelledNode ? this.extractReadableText(labelledNode) : undefined))
      .filter((text): text is string => Boolean(text));

    return this.firstNonEmpty(...texts);
  }

  private getPlaceholderText(element: SupportedFormElement): string | undefined {
    return this.firstNonEmpty(
      this.normalizeWhitespace(element.getAttribute("placeholder")),
      this.normalizeWhitespace(element.getAttribute("data-placeholder")),
      this.normalizeWhitespace(element.getAttribute("title")),
    );
  }

  private getDropdownPromptText(element: SupportedFormElement): string | undefined {
    if (element instanceof HTMLSelectElement) {
      return this.firstNonEmpty(
        this.getSelectedPlaceholderOptionText(element),
        this.getSelect2RenderedText(element),
      );
    }

    if (element instanceof HTMLInputElement) {
      const role = element.getAttribute("role")?.toLowerCase().trim();
      const hasPopup = element.getAttribute("aria-haspopup")?.toLowerCase().trim();

      if (role !== "combobox" && hasPopup !== "listbox" && hasPopup !== "menu") {
        return undefined;
      }

      return this.firstNonEmpty(
        this.getPlaceholderText(element),
        this.getComboboxRenderedText(element),
      );
    }

    return undefined;
  }

  private getSelectedPlaceholderOptionText(select: HTMLSelectElement): string | undefined {
    const selectedOption = select.selectedOptions[0] ?? select.options[0];

    if (!selectedOption) {
      return undefined;
    }

    const text = this.normalizeWhitespace(selectedOption.textContent);

    if (!text || this.isGenericDropdownPrompt(text)) {
      return undefined;
    }

    if (selectedOption.disabled || selectedOption.value.trim() === "") {
      return text;
    }

    return undefined;
  }

  private getSelect2RenderedText(select: HTMLSelectElement): string | undefined {
    if (select.id) {
      const renderedById = select.ownerDocument.getElementById(`select2-${select.id}-container`);
      const textById = renderedById instanceof HTMLElement
        ? this.normalizeWhitespace(renderedById.textContent)
        : undefined;

      if (textById && !this.isGenericDropdownPrompt(textById)) {
        return textById;
      }
    }

    const container = this.getSelect2Container(select);
    const rendered = container?.querySelector(".select2-selection__rendered, .select2-chosen");
    const text = rendered instanceof HTMLElement
      ? this.normalizeWhitespace(rendered.textContent)
      : undefined;

    if (text && !this.isGenericDropdownPrompt(text)) {
      return text;
    }

    return undefined;
  }

  private getSelect2Container(select: HTMLSelectElement): HTMLElement | undefined {
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

  private getComboboxRenderedText(input: HTMLInputElement): string | undefined {
    const controls = input.getAttribute("aria-controls");

    if (controls) {
      const controlled = input.ownerDocument.getElementById(controls);
      const text = controlled instanceof HTMLElement
        ? this.normalizeWhitespace(controlled.textContent)
        : undefined;

      if (text && !this.isGenericDropdownPrompt(text)) {
        return text;
      }
    }

    return undefined;
  }

  private isGenericDropdownPrompt(value: string): boolean {
    const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();

    return [
      "select",
      "select one",
      "please select",
      "choose",
      "choose one",
      "please choose",
      "none",
      "n/a",
    ].includes(normalized);
  }

  private getLegendText(element: SupportedFormElement): string | undefined {
    const fieldset = element.closest("fieldset");
    const legend = fieldset?.querySelector("legend");

    return legend ? this.extractReadableText(legend) : undefined;
  }

  private getContainerLabelText(element: SupportedFormElement): string | undefined {
    const container = element.closest(
      [
        ".field",
        ".form-group",
        ".application-question",
        "[class*='field']",
        "[class*='question']",
        "[data-qa*='question']",
      ].join(","),
    );

    if (!container) {
      return undefined;
    }

    const explicitLabel = container.querySelector("label");

    if (explicitLabel) {
      return this.extractReadableText(explicitLabel);
    }

    return this.extractReadableText(container);
  }

  private getSectionHeadingText(element: SupportedFormElement): string | undefined {
    const headingSelectors = "h1, h2, h3, h4, h5, h6";
    let current: Element | null = element;

    while (current) {
      let sibling: Element | null = current.previousElementSibling;

      while (sibling) {
        if (sibling.matches(headingSelectors)) {
          return this.extractReadableText(sibling);
        }

        const nestedHeading = sibling.querySelector(headingSelectors);

        if (nestedHeading) {
          return this.extractReadableText(nestedHeading);
        }

        sibling = sibling.previousElementSibling;
      }

      current = current.parentElement;
    }

    return undefined;
  }

  private getNearbyText(element: SupportedFormElement): string | undefined {
    const parent = element.parentElement;

    if (!parent) {
      return undefined;
    }

    const siblingTexts = Array.from(parent.childNodes)
      .filter((node) => node !== element)
      .map((node) => this.normalizeWhitespace(node.textContent))
      .filter((text): text is string => Boolean(text));

    if (siblingTexts.length > 0) {
      return this.firstNonEmpty(...siblingTexts);
    }

    return this.extractReadableText(parent);
  }

  private getOptionTexts(
    primaryElement: SupportedFormElement,
    elements: SupportedFormElement[],
  ): string[] {
    if (primaryElement instanceof HTMLSelectElement) {
      return Array.from(primaryElement.options)
        .map((option) => this.normalizeWhitespace(option.textContent))
        .filter((text): text is string => Boolean(text));
    }

    if (primaryElement instanceof HTMLInputElement && primaryElement.type === "radio") {
      return elements
        .map((element) => {
          if (!(element instanceof HTMLInputElement)) {
            return undefined;
          }

          const label = element.labels?.[0];
          return label
            ? this.extractReadableText(label)
            : this.normalizeWhitespace(element.value);
        })
        .filter((text): text is string => Boolean(text));
    }

    return [];
  }

  private extractReadableText(node: Element): string | undefined {
    const cloned = node.cloneNode(true) as Element;

    for (const interactive of Array.from(
      cloned.querySelectorAll(
        [
          "input",
          "select",
          "textarea",
          "button",
          ".memorybank-inline",
          ".select2",
          ".select2-container",
          ".select2-dropdown",
          "[role='listbox']",
          "[role='option']",
        ].join(","),
      ),
    )) {
      interactive.remove();
    }

    return this.normalizeWhitespace(cloned.textContent);
  }

  private normalizeWhitespace(value: string | null | undefined): string | undefined {
    const normalized = value?.replace(/\s+/g, " ").trim();
    return normalized ? normalized : undefined;
  }

  private firstNonEmpty(...values: Array<string | undefined>): string | undefined {
    return values.find((value) => Boolean(value));
  }
}
