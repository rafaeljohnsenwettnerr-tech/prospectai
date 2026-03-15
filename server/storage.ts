import {
  type BusinessProfile, type InsertBusinessProfile,
  type IcpProfile, type InsertIcp,
  type ScrapeJob, type InsertScrapeJob,
  type Lead, type InsertLead,
  type ApiConfig,
} from "@shared/schema";

export interface IStorage {
  // Business profiles
  getBusinessProfile(id: number): Promise<BusinessProfile | undefined>;
  createBusinessProfile(data: InsertBusinessProfile): Promise<BusinessProfile>;
  updateBusinessProfile(id: number, data: Partial<InsertBusinessProfile>): Promise<BusinessProfile | undefined>;
  listBusinessProfiles(): Promise<BusinessProfile[]>;

  // ICP profiles
  createIcpProfile(data: InsertIcp): Promise<IcpProfile>;
  getIcpProfile(id: number): Promise<IcpProfile | undefined>;

  // Scrape jobs
  createScrapeJob(data: InsertScrapeJob): Promise<ScrapeJob>;
  getScrapeJob(id: number): Promise<ScrapeJob | undefined>;
  updateScrapeJob(id: number, data: Partial<ScrapeJob>): Promise<ScrapeJob | undefined>;
  listScrapeJobs(): Promise<ScrapeJob[]>;

  // Leads
  createLead(data: InsertLead): Promise<Lead>;
  getLead(id: number): Promise<Lead | undefined>;
  updateLead(id: number, data: Partial<Lead>): Promise<Lead | undefined>;
  listLeadsByJob(scrapeJobId: number): Promise<Lead[]>;
  listAllLeads(): Promise<Lead[]>;

  // API config
  getApiConfig(): ApiConfig | null;
  setApiConfig(config: ApiConfig): void;
}

class MemStorage implements IStorage {
  private businessProfiles = new Map<number, BusinessProfile>();
  private icpProfiles = new Map<number, IcpProfile>();
  private scrapeJobs = new Map<number, ScrapeJob>();
  private leads = new Map<number, Lead>();
  private apiConfig: ApiConfig | null = null;
  private nextId = { bp: 1, icp: 1, job: 1, lead: 1 };

  async getBusinessProfile(id: number) { return this.businessProfiles.get(id); }
  async createBusinessProfile(data: InsertBusinessProfile) {
    const bp: BusinessProfile = { ...data, id: this.nextId.bp++ };
    this.businessProfiles.set(bp.id, bp);
    return bp;
  }
  async updateBusinessProfile(id: number, data: Partial<InsertBusinessProfile>) {
    const existing = this.businessProfiles.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.businessProfiles.set(id, updated);
    return updated;
  }
  async listBusinessProfiles() { return Array.from(this.businessProfiles.values()); }

  async createIcpProfile(data: InsertIcp) {
    const icp: IcpProfile = { ...data, id: this.nextId.icp++ };
    this.icpProfiles.set(icp.id, icp);
    return icp;
  }
  async getIcpProfile(id: number) { return this.icpProfiles.get(id); }

  async createScrapeJob(data: InsertScrapeJob) {
    const job: ScrapeJob = { ...data, id: this.nextId.job++ };
    this.scrapeJobs.set(job.id, job);
    return job;
  }
  async getScrapeJob(id: number) { return this.scrapeJobs.get(id); }
  async updateScrapeJob(id: number, data: Partial<ScrapeJob>) {
    const existing = this.scrapeJobs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.scrapeJobs.set(id, updated);
    return updated;
  }
  async listScrapeJobs() {
    return Array.from(this.scrapeJobs.values()).sort((a, b) => b.id - a.id);
  }

  async createLead(data: InsertLead) {
    const lead: Lead = {
      id: this.nextId.lead++,
      scrapeJobId: data.scrapeJobId,
      name: data.name,
      category: data.category ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      googleMapsUrl: data.googleMapsUrl ?? null,
      facebookUrl: data.facebookUrl ?? null,
      rating: data.rating ?? null,
      reviewCount: data.reviewCount ?? null,
      lastReviewDate: data.lastReviewDate ?? null,
      googleDescription: data.googleDescription ?? null,
      websiteSummary: data.websiteSummary ?? null,
      facebookLastPost: data.facebookLastPost ?? null,
      facebookLastPostDate: data.facebookLastPostDate ?? null,
      facebookFollowers: data.facebookFollowers ?? null,
      painSignals: data.painSignals ?? null,
      leadScore: data.leadScore ?? null,
      healthScore: data.healthScore ?? null,
      leadScoreBreakdown: data.leadScoreBreakdown ?? null,
      healthScoreBreakdown: data.healthScoreBreakdown ?? null,
      coldMessage: data.coldMessage ?? null,
      followUp3Day: data.followUp3Day ?? null,
      followUp7Day: data.followUp7Day ?? null,
      status: data.status ?? "new",
    };
    this.leads.set(lead.id, lead);
    return lead;
  }
  async getLead(id: number) { return this.leads.get(id); }
  async updateLead(id: number, data: Partial<Lead>) {
    const existing = this.leads.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.leads.set(id, updated);
    return updated;
  }
  async listLeadsByJob(scrapeJobId: number) {
    return Array.from(this.leads.values()).filter(l => l.scrapeJobId === scrapeJobId);
  }
  async listAllLeads() { return Array.from(this.leads.values()); }

  getApiConfig() { return this.apiConfig; }
  setApiConfig(config: ApiConfig) { this.apiConfig = config; }
}

export const storage = new MemStorage();
