import type { SiteRulesRepository } from "../../application/interfaces/SiteRulesRepository.js";
import type { SiteRule } from "../../domain/models/SiteRule.js";
import { cloneValue } from "../../shared/utils/clone.js";

export interface InMemorySiteRulesRepositoryOptions {
  initialRules?: SiteRule[];
}

export class InMemorySiteRulesRepository implements SiteRulesRepository {
  private rules: SiteRule[];

  constructor(options: InMemorySiteRulesRepositoryOptions = {}) {
    this.rules = cloneValue(options.initialRules ?? []);
  }

  async loadAll(): Promise<SiteRule[]> {
    return cloneValue(this.rules);
  }

  async getByHost(hostName: string): Promise<SiteRule | null> {
    const rule = this.rules.find((entry) => entry.hostName === hostName);

    return rule ? cloneValue(rule) : null;
  }

  async save(rule: SiteRule): Promise<SiteRule> {
    const cloned = cloneValue(rule);
    const index = this.rules.findIndex((entry) => entry.hostName === rule.hostName);

    if (index === -1) {
      this.rules.push(cloned);
    } else {
      this.rules[index] = cloned;
    }

    return cloneValue(cloned);
  }

  async delete(hostName: string): Promise<boolean> {
    const index = this.rules.findIndex((entry) => entry.hostName === hostName);

    if (index === -1) {
      return false;
    }

    this.rules.splice(index, 1);
    return true;
  }
}
