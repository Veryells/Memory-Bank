import { FieldType } from "../../domain/enums/FieldType.js";
import type { ScannedFieldBinding } from "./types.js";

export class DomEventDispatcherService {
  dispatchAfterWrite(binding: ScannedFieldBinding): void {
    const targetElements = binding.fieldType === FieldType.Radio
      ? binding.elements.filter((element) =>
          element instanceof HTMLInputElement ? element.checked : false,
        )
      : [binding.primaryElement];

    for (const element of targetElements) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}
