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

    return Promise.all(
      bindings.map(async (binding) => ({
        binding,
        analysis: await this.backgroundMessageClient.send("analyzeField", {
          field: binding.descriptor,
        }),
      })),
    );
  }
}
