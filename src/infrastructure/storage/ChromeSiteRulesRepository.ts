import type { SiteRulesRepository } from "../../application/interfaces/SiteRulesRepository.js";
import type { SiteRule } from "../../domain/models/SiteRule.js";
import { STORAGE_KEYS } from "../../shared/constants/storageKeys.js";
import { ChromeStorageService } from "../browser/ChromeStorageService.js";
import { cloneValue } from "../../shared/utils/clone.js";

export class ChromeSiteRulesRepository implements SiteRulesRepository {
  constructor(private readonly storageService: ChromeStorageService) {}

  async loadAll(): Promise<SiteRule[]> {
    return this.storageService.getValue<SiteRule[]>(STORAGE_KEYS.siteRules, []);
  }

  async getByHost(hostName: string): Promise<SiteRule | null> {
    const rules = await this.loadAll();
    return cloneValue(rules.find((entry) => entry.hostName === hostName) ?? null);
  }

  async save(rule: SiteRule): Promise<SiteRule> {
    const rules = await this.loadAll();
    const index = rules.findIndex((entry) => entry.hostName === rule.hostName);
    const cloned = cloneValue(rule);

    if (index === -1) {
      rules.push(cloned);
    } else {
      rules[index] = cloned;
    }

    await this.storageService.setValue(STORAGE_KEYS.siteRules, rules);
    return cloneValue(cloned);
  }

  async delete(hostName: string): Promise<boolean> {
    const rules = await this.loadAll();
    const nextRules = rules.filter((entry) => entry.hostName !== hostName);

    if (nextRules.length === rules.length) {
      return false;
    }

    await this.storageService.setValue(STORAGE_KEYS.siteRules, nextRules);
    return true;
  }
}
