import type { MemoryRepository } from "../../application/interfaces/MemoryRepository.js";
import {
  MemorySearchService,
  type MemorySearchOptions,
} from "../../application/services/MemorySearchService.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import { STORAGE_KEYS } from "../../shared/constants/storageKeys.js";
import { ChromeStorageService } from "../browser/ChromeStorageService.js";
import { cloneValue } from "../../shared/utils/clone.js";

export class ChromeMemoryRepository implements MemoryRepository {
  constructor(
    private readonly storageService: ChromeStorageService,
    private readonly searchService: MemorySearchService = new MemorySearchService(),
  ) {}

  async getAll(): Promise<MemoryEntry[]> {
    return this.storageService.getValue<MemoryEntry[]>(STORAGE_KEYS.memories, []);
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    const memories = await this.getAll();
    return cloneValue(memories.find((entry) => entry.id === id) ?? null);
  }

  async save(memory: MemoryEntry): Promise<MemoryEntry> {
    const memories = await this.getAll();

    if (memories.some((entry) => entry.id === memory.id)) {
      throw new Error(`Memory with id "${memory.id}" already exists.`);
    }

    memories.push(cloneValue(memory));
    await this.storageService.setValue(STORAGE_KEYS.memories, memories);

    return cloneValue(memory);
  }

  async update(memory: MemoryEntry): Promise<MemoryEntry> {
    const memories = await this.getAll();
    const index = memories.findIndex((entry) => entry.id === memory.id);

    if (index === -1) {
      throw new Error(`Memory with id "${memory.id}" was not found.`);
    }

    memories[index] = cloneValue(memory);
    await this.storageService.setValue(STORAGE_KEYS.memories, memories);

    return cloneValue(memory);
  }

  async delete(id: string): Promise<boolean> {
    const memories = await this.getAll();
    const nextMemories = memories.filter((entry) => entry.id !== id);

    if (nextMemories.length === memories.length) {
      return false;
    }

    await this.storageService.setValue(STORAGE_KEYS.memories, nextMemories);
    return true;
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemoryEntry[]> {
    const memories = await this.getAll();
    return this.searchService.search(memories, query, options);
  }
}
