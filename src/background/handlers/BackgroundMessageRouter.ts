import type { MemoryRepository } from "../../application/interfaces/MemoryRepository.js";
import type { SettingsRepository } from "../../application/interfaces/SettingsRepository.js";
import type { SiteRulesRepository } from "../../application/interfaces/SiteRulesRepository.js";
import { MemoryDecisionService } from "../../application/services/MemoryDecisionService.js";
import { MemoryMatchingService } from "../../application/services/MemoryMatchingService.js";
import type { MemorySearchOptions } from "../../application/services/MemorySearchService.js";
import { MemorySaveService, type SaveMemoryInput, type SaveMemoryResult } from "../../application/services/MemorySaveService.js";
import { QuestionNormalizationService } from "../../application/services/QuestionNormalizationService.js";
import { SettingsResolutionService } from "../../application/services/SettingsResolutionService.js";
import type { FieldAnalysisResult } from "../../application/types/FieldAnalysisResult.js";
import { AnswerType } from "../../domain/enums/AnswerType.js";
import type { DetectedFieldDescriptor } from "../../domain/models/DetectedFieldDescriptor.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import type { SiteRule } from "../../domain/models/SiteRule.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";
import type {
  BackgroundError,
  BackgroundRequest,
  BackgroundRequestMap,
  BackgroundResponse,
  BackgroundResponseMap,
} from "../../shared/types/messages.js";

export interface BackgroundMessageRouterDependencies {
  memoryRepository: MemoryRepository;
  settingsRepository: SettingsRepository;
  siteRulesRepository: SiteRulesRepository;
  normalizationService?: QuestionNormalizationService;
  matchingService?: MemoryMatchingService;
  decisionService?: MemoryDecisionService;
  saveService?: MemorySaveService;
  settingsResolutionService?: SettingsResolutionService;
}

export class BackgroundMessageRouter {
  private readonly normalizationService: QuestionNormalizationService;
  private readonly matchingService: MemoryMatchingService;
  private readonly decisionService: MemoryDecisionService;
  private readonly saveService: MemorySaveService;
  private readonly settingsResolutionService: SettingsResolutionService;

  constructor(private readonly dependencies: BackgroundMessageRouterDependencies) {
    this.normalizationService =
      dependencies.normalizationService ?? new QuestionNormalizationService();
    this.matchingService = dependencies.matchingService ?? new MemoryMatchingService();
    this.decisionService = dependencies.decisionService ?? new MemoryDecisionService();
    this.saveService = dependencies.saveService ?? new MemorySaveService(this.normalizationService);
    this.settingsResolutionService =
      dependencies.settingsResolutionService ?? new SettingsResolutionService();
  }

  async handleMessage<TType extends keyof BackgroundRequestMap>(
    request: BackgroundRequest<TType>,
  ): Promise<BackgroundResponse<TType>>;
  async handleMessage(request: BackgroundRequest): Promise<BackgroundResponse> {
    try {
      switch (request.type) {
        case "analyzeField":
          return this.successResponse("analyzeField", await this.analyzeField(request.payload.field));
        case "saveMemory":
          return this.successResponse("saveMemory", await this.saveMemory(request.payload));
        case "fetchMemories":
          return this.successResponse("fetchMemories", {
            memories: await this.fetchMemories(
              request.payload.query ?? "",
              request.payload.options,
            ),
          });
        case "updateMemory":
          return this.successResponse("updateMemory", {
            memory: await this.updateMemory(request.payload.memory),
          });
        case "deleteMemory":
          return this.successResponse("deleteMemory", {
            deleted: await this.dependencies.memoryRepository.delete(request.payload.memoryId),
          });
        case "loadSettings":
          return this.successResponse("loadSettings", {
            settings: await this.dependencies.settingsRepository.load(),
          });
        case "updateSettings":
          return this.successResponse("updateSettings", {
            settings: await this.updateSettings(request.payload.settings),
          });
        case "fetchSiteRule":
          return this.successResponse("fetchSiteRule", {
            rule: await this.dependencies.siteRulesRepository.getByHost(
              request.payload.hostName,
            ),
          });
        case "updateSiteRule":
          return this.successResponse("updateSiteRule", {
            rule: await this.updateSiteRule(request.payload.rule),
          });
        case "recordMemoryUsage":
          return this.successResponse("recordMemoryUsage", {
            memory: await this.recordMemoryUsage(
              request.payload.memoryId,
              request.payload.usedAt,
            ),
          });
        default:
          throw new Error("Unhandled background message type.");
      }
    } catch (error) {
      return this.errorResponse(request.type, this.toBackgroundError(error));
    }
  }

  private async analyzeField(field: DetectedFieldDescriptor): Promise<FieldAnalysisResult> {
    const [settings, siteRules, memories] = await Promise.all([
      this.dependencies.settingsRepository.load(),
      this.dependencies.siteRulesRepository.loadAll(),
      this.dependencies.memoryRepository.getAll(),
    ]);

    const resolvedSettings = this.settingsResolutionService.resolve(
      field.hostName,
      settings,
      siteRules,
    );

    const signature = this.normalizationService.buildQuestionSignature({
      questionText: field.questionText,
      fieldType: field.fieldType,
      ...(field.placeholderText ? { placeholderText: field.placeholderText } : {}),
      ...(field.sectionText ? { sectionText: field.sectionText } : {}),
      ...(field.optionTexts ? { optionTexts: field.optionTexts } : {}),
    });

    const match = this.matchingService.match(signature, memories);
    const decision = this.decisionService.decide(match, resolvedSettings);
    const showInlineIndicator = this.decisionService.shouldShowInlineIndicator(
      match,
      resolvedSettings,
    );

    return {
      field,
      signature,
      match,
      settings: resolvedSettings,
      decision,
      showInlineIndicator,
    };
  }

  private async saveMemory(input: SaveMemoryInput): Promise<SaveMemoryResult> {
    const existingMemories = await this.dependencies.memoryRepository.getAll();
    const result = this.saveService.save(input, existingMemories);

    if (result.kind === "created") {
      await this.dependencies.memoryRepository.save(result.memory);
      return result;
    }

    await this.dependencies.memoryRepository.update(result.memory);
    return result;
  }

  private async fetchMemories(
    query: string,
    options?: MemorySearchOptions,
  ): Promise<MemoryEntry[]> {
    return this.dependencies.memoryRepository.search(query, options);
  }

  private async updateMemory(memory: MemoryEntry): Promise<MemoryEntry> {
    const existing = await this.dependencies.memoryRepository.getById(memory.id);

    if (!existing) {
      throw new Error(`Memory with id "${memory.id}" was not found.`);
    }

    const normalizedQuestionText = this.normalizationService.normalizeQuestionText(
      memory.questionText,
    );

    if (!normalizedQuestionText) {
      throw new Error("Cannot update a memory without question text.");
    }

    const answerType = this.saveService.inferAnswerType(memory.answer);

    if (answerType === AnswerType.Unknown) {
      throw new Error("Cannot update a memory with an empty answer payload.");
    }

    const now = new Date().toISOString();
    const updated: MemoryEntry = {
      ...existing,
      ...memory,
      questionText: memory.questionText.trim(),
      normalizedQuestionText,
      answerType,
      tags: this.sanitizeStringList(memory.tags),
      sourceHosts: this.sanitizeStringList(memory.sourceHosts),
      updatedAt: now,
    };

    return this.dependencies.memoryRepository.update(updated);
  }

  private async updateSettings(settings: UserSettings): Promise<UserSettings> {
    return this.dependencies.settingsRepository.save(settings);
  }

  private async updateSiteRule(rule: SiteRule): Promise<SiteRule> {
    const sanitizedRule: SiteRule = {
      hostName: rule.hostName.trim().toLowerCase(),
      isEnabled: rule.isEnabled,
      ...(rule.overrideApplyMode ? { overrideApplyMode: rule.overrideApplyMode } : {}),
    };

    return this.dependencies.siteRulesRepository.save(sanitizedRule);
  }

  private async recordMemoryUsage(memoryId: string, usedAt?: string): Promise<MemoryEntry> {
    const memory = await this.dependencies.memoryRepository.getById(memoryId);

    if (!memory) {
      throw new Error(`Memory with id "${memoryId}" was not found.`);
    }

    const updated: MemoryEntry = {
      ...memory,
      usageCount: memory.usageCount + 1,
      lastUsedAt: usedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.dependencies.memoryRepository.update(updated);
  }

  private sanitizeStringList(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private successResponse<TType extends keyof BackgroundResponseMap>(
    type: TType,
    payload: BackgroundResponseMap[TType],
  ): BackgroundResponse<TType> {
    return {
      type,
      ok: true,
      payload,
    } as BackgroundResponse<TType>;
  }

  private errorResponse<TType extends keyof BackgroundResponseMap>(
    type: TType,
    error: BackgroundError,
  ): BackgroundResponse<TType> {
    return {
      type,
      ok: false,
      error,
    } as BackgroundResponse<TType>;
  }

  private toBackgroundError(error: unknown): BackgroundError {
    if (error instanceof Error) {
      return {
        code: "BACKGROUND_RUNTIME_ERROR",
        message: error.message,
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred.",
    };
  }
}
