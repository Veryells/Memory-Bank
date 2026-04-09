import { FieldType } from "../../domain/enums/FieldType.js";
import type { DetectedFieldDescriptor } from "../../domain/models/DetectedFieldDescriptor.js";
import { DomQuestionLocatorService } from "./DomQuestionLocatorService.js";
import type { ScannedFieldBinding, SupportedFormElement } from "./types.js";

export class DomScannerService {
  constructor(
    private readonly questionLocatorService: DomQuestionLocatorService = new DomQuestionLocatorService(),
  ) {}

  scan(root: Document | HTMLElement = document): ScannedFieldBinding[] {
    const scannedBindings: ScannedFieldBinding[] = [];
    const radioGroups = new Map<string, HTMLInputElement[]>();
    const elements = Array.from(root.querySelectorAll("input, textarea, select"));
    const hostName = this.getHostName(root);

    for (const element of elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
        continue;
      }

      const fieldType = this.getFieldType(element);

      if (fieldType === FieldType.Unknown) {
        continue;
      }

      if (fieldType === FieldType.Radio && element instanceof HTMLInputElement) {
        const groupKey = this.getRadioGroupKey(element);
        const current = radioGroups.get(groupKey) ?? [];
        current.push(element);
        radioGroups.set(groupKey, current);
        continue;
      }

      scannedBindings.push(this.createBinding(fieldType, [element], hostName));
    }

    for (const group of radioGroups.values()) {
      if (group.length === 0) {
        continue;
      }

      scannedBindings.push(this.createBinding(FieldType.Radio, group, hostName));
    }

    return scannedBindings;
  }

  private createBinding(
    fieldType: FieldType,
    elements: SupportedFormElement[],
    hostName: string,
  ): ScannedFieldBinding {
    const primaryElement = elements[0]!;
    const locatedQuestion = this.questionLocatorService.locate(primaryElement, elements);
    const descriptor: DetectedFieldDescriptor = {
      fieldId: this.buildFieldId(primaryElement),
      fieldType,
      questionText: locatedQuestion.questionText,
      isRequired: elements.some((element) => this.isRequired(element)),
      hostName,
      ...(locatedQuestion.placeholderText ? { placeholderText: locatedQuestion.placeholderText } : {}),
      ...(locatedQuestion.optionTexts && locatedQuestion.optionTexts.length > 0
        ? { optionTexts: locatedQuestion.optionTexts }
        : {}),
      ...(locatedQuestion.sectionText ? { sectionText: locatedQuestion.sectionText } : {}),
    };

    return {
      descriptor,
      fieldType,
      primaryElement,
      elements,
    };
  }

  private getFieldType(element: SupportedFormElement): FieldType {
    if (element instanceof HTMLTextAreaElement) {
      return FieldType.TextArea;
    }

    if (element instanceof HTMLSelectElement) {
      return FieldType.Select;
    }

    if (element instanceof HTMLInputElement) {
      if (element.disabled || element.type === "hidden") {
        return FieldType.Unknown;
      }

      if (element.type === "search") {
        return FieldType.Unknown;
      }

      const role = element.getAttribute("role")?.toLowerCase().trim();
      const hasPopup = element.getAttribute("aria-haspopup")?.toLowerCase().trim();

      if (
        role === "combobox"
        || hasPopup === "listbox"
        || hasPopup === "menu"
      ) {
        return FieldType.Select;
      }

      switch (element.type) {
        case "checkbox":
          return FieldType.Checkbox;
        case "radio":
          return element.name ? FieldType.Radio : FieldType.Unknown;
        case "button":
        case "submit":
        case "reset":
        case "file":
        case "image":
        case "range":
        case "color":
          return FieldType.Unknown;
        default:
          return FieldType.Text;
      }
    }

    return FieldType.Unknown;
  }

  private getRadioGroupKey(element: HTMLInputElement): string {
    const formId = element.form?.id || element.form?.getAttribute("name") || "document";
    return `${formId}:${element.name}`;
  }

  private buildFieldId(element: SupportedFormElement): string {
    const automationId = element.getAttribute("data-automation-id");

    if (automationId) {
      return `automation:${automationId}`;
    }

    if (element.id) {
      return `id:${element.id}`;
    }

    if ("name" in element && element.name) {
      return `name:${element.name}`;
    }

    const labelledBy = element.getAttribute("aria-labelledby");

    if (labelledBy) {
      return `aria:${labelledBy}`;
    }

    const placeholder = element.getAttribute("placeholder");

    if (placeholder) {
      return `placeholder:${placeholder.trim().toLowerCase()}`;
    }

    return `path:${this.buildDomPath(element)}`;
  }

  private buildDomPath(element: Element): string {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current && segments.length < 5) {
      const parent: Element | null = current.parentElement;
      const tag = current.tagName.toLowerCase();
      const currentTagName = current.tagName;

      if (!parent) {
        segments.unshift(tag);
        break;
      }

      const siblings = Array.from<Element>(parent.children).filter(
        (child: Element) => child.tagName === currentTagName,
      );
      const index = siblings.indexOf(current);
      segments.unshift(`${tag}[${index + 1}]`);
      current = parent;
    }

    return segments.join(">");
  }

  private isRequired(element: SupportedFormElement): boolean {
    return element.required || element.getAttribute("aria-required") === "true";
  }

  private getHostName(root: Document | HTMLElement): string {
    if (root instanceof Document) {
      return root.location?.hostname ?? "";
    }

    return root.ownerDocument?.location?.hostname ?? globalThis.location?.hostname ?? "";
  }
}
