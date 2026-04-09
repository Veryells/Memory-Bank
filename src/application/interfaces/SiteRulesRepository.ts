import type { SiteRule } from "../../domain/models/SiteRule.js";

export interface SiteRulesRepository {
  loadAll(): Promise<SiteRule[]>;
  getByHost(hostName: string): Promise<SiteRule | null>;
  save(rule: SiteRule): Promise<SiteRule>;
  delete(hostName: string): Promise<boolean>;
}
