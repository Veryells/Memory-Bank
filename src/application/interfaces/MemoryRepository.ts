import type { MemorySearchOptions } from "../services/MemorySearchService.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";

export interface MemoryRepository {
  getAll(): Promise<MemoryEntry[]>;
  getById(id: string): Promise<MemoryEntry | null>;
  save(memory: MemoryEntry): Promise<MemoryEntry>;
  update(memory: MemoryEntry): Promise<MemoryEntry>;
  delete(id: string): Promise<boolean>;
  search(query: string, options?: MemorySearchOptions): Promise<MemoryEntry[]>;
}
