import type { SaveMemoryInput, SaveMemoryResult } from "../../application/services/MemorySaveService.js";
import type { MemorySearchOptions } from "../../application/services/MemorySearchService.js";
import type { FieldAnalysisResult } from "../../application/types/FieldAnalysisResult.js";
import type { DetectedFieldDescriptor } from "../../domain/models/DetectedFieldDescriptor.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import type { SiteRule } from "../../domain/models/SiteRule.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";

export interface BackgroundRequestMap {
  analyzeField: {
    field: DetectedFieldDescriptor;
  };
  saveMemory: SaveMemoryInput;
  fetchMemories: {
    query?: string;
    options?: MemorySearchOptions;
  };
  updateMemory: {
    memory: MemoryEntry;
  };
  deleteMemory: {
    memoryId: string;
  };
  loadSettings: Record<string, never>;
  updateSettings: {
    settings: UserSettings;
  };
  fetchSiteRule: {
    hostName: string;
  };
  updateSiteRule: {
    rule: SiteRule;
  };
  recordMemoryUsage: {
    memoryId: string;
    usedAt?: string;
  };
}

export interface BackgroundResponseMap {
  analyzeField: FieldAnalysisResult;
  saveMemory: SaveMemoryResult;
  fetchMemories: {
    memories: MemoryEntry[];
  };
  updateMemory: {
    memory: MemoryEntry;
  };
  deleteMemory: {
    deleted: boolean;
  };
  loadSettings: {
    settings: UserSettings;
  };
  updateSettings: {
    settings: UserSettings;
  };
  fetchSiteRule: {
    rule: SiteRule | null;
  };
  updateSiteRule: {
    rule: SiteRule;
  };
  recordMemoryUsage: {
    memory: MemoryEntry;
  };
}

export type BackgroundMessageType = keyof BackgroundRequestMap;

export interface BackgroundError {
  code: string;
  message: string;
}

export type BackgroundRequest<TType extends BackgroundMessageType = BackgroundMessageType> =
  TType extends BackgroundMessageType
    ? {
        type: TType;
        payload: BackgroundRequestMap[TType];
      }
    : never;

export type BackgroundResponse<TType extends BackgroundMessageType = BackgroundMessageType> =
  TType extends BackgroundMessageType
    ? | {
          type: TType;
          ok: true;
          payload: BackgroundResponseMap[TType];
        }
      | {
          type: TType;
          ok: false;
          error: BackgroundError;
        }
    : never;
