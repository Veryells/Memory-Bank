import type { MemoryRepository } from "../../application/interfaces/MemoryRepository.js";
import {
  MemorySearchService,
  type MemorySearchOptions,
} from "../../application/services/MemorySearchService.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import { cloneValue } from "../../shared/utils/clone.js";

export interface InMemoryMemoryRepositoryOptions {
  initialMemories?: MemoryEntry[];
}

export class InMemoryMemoryRepository implements MemoryRepository {
  private memories: MemoryEntry[];

  constructor(
    options: InMemoryMemoryRepositoryOptions = {},
    private readonly memorySearchService: MemorySearchService = new MemorySearchService(),
  ) {
    this.memories = cloneValue(options.initialMemories ?? []);
  }

  async getAll(): Promise<MemoryEntry[]> {
    return cloneValue(this.memories);
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    const memory = this.memories.find((entry) => entry.id === id);

    return memory ? cloneValue(memory) : null;
  }

  async save(memory: MemoryEntry): Promise<MemoryEntry> {
    if (this.memories.some((entry) => entry.id === memory.id)) {
      throw new Error(`Memory with id "${memory.id}" already exists.`);
    }

    const cloned = cloneValue(memory);
    this.memories.push(cloned);

    return cloneValue(cloned);
  }

  async update(memory: MemoryEntry): Promise<MemoryEntry> {
    const index = this.memories.findIndex((entry) => entry.id === memory.id);

    if (index === -1) {
      throw new Error(`Memory with id "${memory.id}" was not found.`);
    }

    const cloned = cloneValue(memory);
    this.memories[index] = cloned;

    return cloneValue(cloned);
  }

  async delete(id: string): Promise<boolean> {
    const index = this.memories.findIndex((entry) => entry.id === id);

    if (index === -1) {
      return false;
    }

    this.memories.splice(index, 1);
    return true;
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemoryEntry[]> {
    return cloneValue(this.memorySearchService.search(this.memories, query, options));
  }
}
