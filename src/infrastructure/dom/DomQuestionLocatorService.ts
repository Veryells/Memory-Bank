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
    const ariaLabel = this.normalizeWhitespace(primaryElement.getAttribute("aria-label"));
    const ariaLabelledByText = this.getAriaLabelledByText(primaryElement);
    const placeholderText = this.getPlaceholderText(primaryElement);
    const legendText = this.getLegendText(primaryElement);
    const headingText = this.getSectionHeadingText(primaryElement);
    const nearbyText = this.getNearbyText(primaryElement);
    const fallbackName = this.normalizeWhitespace(primaryElement.getAttribute("name"));
    const fallbackId = this.normalizeWhitespace(primaryElement.id);
    const optionTexts = this.getOptionTexts(primaryElement, elements);

    const questionText = this.firstNonEmpty(
      labelText,
      ariaLabelledByText,
      ariaLabel,
      legendText,
      nearbyText,
      placeholderText,
      fallbackName,
      fallbackId,
    ) ?? "Untitled field";
    const sectionText = this.firstNonEmpty(legendText, headingText);

    return {
      questionText,
      ...(placeholderText ? { placeholderText } : {}),
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
    if (element instanceof HTMLSelectElement) {
      return undefined;
    }

    return this.normalizeWhitespace(element.getAttribute("placeholder"));
  }

  private getLegendText(element: SupportedFormElement): string | undefined {
    const fieldset = element.closest("fieldset");
    const legend = fieldset?.querySelector("legend");

    return legend ? this.extractReadableText(legend) : undefined;
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

    for (const interactive of Array.from(cloned.querySelectorAll("input, select, textarea, button"))) {
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
