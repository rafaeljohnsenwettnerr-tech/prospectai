import { pgTable, text, integer, real, boolean, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── User / Business profile ──────────────────────────────────────────────────
export const businessProfiles = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),         // e.g. "Bilpleie", "Rørlegger"
  description: text("description").notNull(),
  targetCity: text("target_city").notNull(),
  valueProposition: text("value_proposition").notNull(),
  senderName: text("sender_name").notNull(),
  senderPhone: text("sender_phone"),
});

export const insertBusinessProfileSchema = createInsertSchema(businessProfiles).omit({ id: true });
export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfiles.$inferSelect;

// ── ICP (Ideal Client Profile) ───────────────────────────────────────────────
export const icpProfiles = pgTable("icp_profiles", {
  id: serial("id").primaryKey(),
  businessProfileId: integer("business_profile_id").notNull(),
  targetCategory: text("target_category").notNull(),   // e.g. "Bilpleie"
  targetCity: text("target_city").notNull(),
  minRating: real("min_rating"),
  maxRating: real("max_rating"),
  minReviews: integer("min_reviews"),
  maxReviews: integer("max_reviews"),
  keywords: text("keywords").array(),
  painPoints: text("pain_points").array(),
  numberOfLeads: integer("number_of_leads").notNull().default(50),
});

export const insertIcpSchema = createInsertSchema(icpProfiles).omit({ id: true });
export type InsertIcp = z.infer<typeof insertIcpSchema>;
export type IcpProfile = typeof icpProfiles.$inferSelect;

// ── Scrape Jobs ───────────────────────────────────────────────────────────────
export const scrapeJobs = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  icpProfileId: integer("icp_profile_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | done | error
  totalLeads: integer("total_leads").default(0),
  processedLeads: integer("processed_leads").default(0),
  error: text("error"),
  createdAt: text("created_at").notNull(),
});

export const insertScrapeJobSchema = createInsertSchema(scrapeJobs).omit({ id: true });
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;
export type ScrapeJob = typeof scrapeJobs.$inferSelect;

// ── Leads ─────────────────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  scrapeJobId: integer("scrape_job_id").notNull(),

  // Basic info
  name: text("name").notNull(),
  category: text("category"),
  address: text("address"),
  city: text("city"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  googleMapsUrl: text("google_maps_url"),
  facebookUrl: text("facebook_url"),

  // Google data
  rating: real("rating"),
  reviewCount: integer("review_count"),
  lastReviewDate: text("last_review_date"),
  googleDescription: text("google_description"),

  // Enrichment
  websiteSummary: text("website_summary"),
  facebookLastPost: text("facebook_last_post"),
  facebookLastPostDate: text("facebook_last_post_date"),
  facebookFollowers: integer("facebook_followers"),

  // Pain signals (JSON array of signal objects)
  painSignals: jsonb("pain_signals").$type<PainSignal[]>(),

  // Scores
  leadScore: integer("lead_score"),         // 0–100
  healthScore: integer("health_score"),     // 0–100
  leadScoreBreakdown: jsonb("lead_score_breakdown").$type<ScoreBreakdown[]>(),
  healthScoreBreakdown: jsonb("health_score_breakdown").$type<ScoreBreakdown[]>(),

  // Outreach
  coldMessage: text("cold_message"),
  followUp3Day: text("follow_up_3day"),
  followUp7Day: text("follow_up_7day"),

  status: text("status").notNull().default("new"), // new | contacted | interested | not_interested
});

export type PainSignal = {
  type: string;
  label: string;
  severity: "high" | "medium" | "low";
  description: string;
};

export type ScoreBreakdown = {
  label: string;
  points: number;
  reason: string;
};

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// ── API config (stored in memory, never DB) ───────────────────────────────────
export type ApiConfig = {
  openaiKey: string;
  tavilyKey: string;
  firecrawlKey: string;
  apifyKey: string;
  findymailKey?: string;
};
