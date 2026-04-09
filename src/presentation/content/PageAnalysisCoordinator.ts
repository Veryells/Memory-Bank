import type { BackgroundMessageClient } from "../../application/interfaces/BackgroundMessageClient.js";
import { DomScannerService } from "../../infrastructure/dom/DomScannerService.js";
import type { AnalyzedContentField } from "./types.js";

export class PageAnalysisCoordinator {
  constructor(
    private readonly scannerService: DomScannerService,
    private readonly backgroundMessageClient: BackgroundMessageClient,
  ) {}

  async analyze(root: Document | HTMLElement = document): Promise<AnalyzedContentField[]> {
    const bindings = this.scannerService.scan(root);

    const results = await Promise.allSettled(
      bindings.map(async (binding) => {
        const sanitizedDescriptor = {
          ...binding.descriptor,
          questionText: binding.descriptor.questionText.trim() || "Untitled field",
          ...(binding.descriptor.optionTexts
            ? { optionTexts: binding.descriptor.optionTexts.slice(0, 100) }
            : {}),
        };

        return {
          binding: {
            ...binding,
            descriptor: sanitizedDescriptor,
          },
          analysis: await this.backgroundMessageClient.send("analyzeField", {
            field: sanitizedDescriptor,
          }),
        };
      }),
    );

    return results.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        return [result.value];
      }

      console.warn(
        "MemoryBank could not analyze one field",
        {
          descriptor: bindings[index]?.descriptor,
          reason: result.reason,
        },
      );
      return [];
    });
  }
}
