import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";

export interface MemorySearchOptions {
  includeDisabled?: boolean;
  hostName?: string;
  limit?: number;
}

export class MemorySearchService {
  search(
    memories: MemoryEntry[],
    query: string,
    options: MemorySearchOptions = {},
  ): MemoryEntry[] {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = memories.filter((memory) => {
      if (!options.includeDisabled && !memory.enabled) {
        return false;
      }

      if (options.hostName && !memory.sourceHosts.includes(options.hostName)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return this.buildSearchableText(memory).includes(normalizedQuery);
    });

    const sorted = filtered.sort((left, right) => {
      const scoreDifference = this.getSearchScore(right, normalizedQuery) - this.getSearchScore(left, normalizedQuery);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });

    const limit = options.limit ?? sorted.length;

    return sorted.slice(0, limit);
  }

  private buildSearchableText(memory: MemoryEntry): string {
    return [
      memory.questionText,
      memory.normalizedQuestionText,
      memory.answer.textValue,
      memory.answer.selectValue,
      memory.answer.multiSelectValues?.join(" "),
      memory.tags.join(" "),
      memory.sourceHosts.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  private getSearchScore(memory: MemoryEntry, query: string): number {
    if (!query) {
      return memory.usageCount;
    }

    const question = memory.questionText.toLowerCase();
    const tags = memory.tags.join(" ").toLowerCase();
    const hosts = memory.sourceHosts.join(" ").toLowerCase();
    const answer = [
      memory.answer.textValue,
      memory.answer.selectValue,
      memory.answer.multiSelectValues?.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;

    if (question === query) {
      score += 100;
    } else if (question.startsWith(query)) {
      score += 70;
    } else if (question.includes(query)) {
      score += 50;
    }

    if (tags.includes(query)) {
      score += 25;
    }

    if (hosts.includes(query)) {
      score += 15;
    }

    if (answer.includes(query)) {
      score += 10;
    }

    return score + memory.usageCount;
  }
}
