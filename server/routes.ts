import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { enrichLead, apifyGoogleMaps, type RawLead } from "./enrichment";
import ExcelJS from "exceljs";
import type { ApiConfig } from "@shared/schema";
import { z } from "zod";

// In-memory job queue — one active job at a time
const activeJobs = new Map<number, AbortController>();

export function registerRoutes(httpServer: Server, app: Express) {

  // ── API config ─────────────────────────────────────────────────────────────
  app.post("/api/config", (req, res) => {
    const schema = z.object({
      openaiKey: z.string().min(1),
      tavilyKey: z.string().min(1),
      firecrawlKey: z.string().min(1),
      apifyKey: z.string().min(1),
      findymailKey: z.string().optional(),
      hunterApiKey: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Ugyldig API-nøkler" });
    storage.setApiConfig(parsed.data);
    res.json({ ok: true });
  });

  app.get("/api/config/status", (req, res) => {
    const cfg = storage.getApiConfig();
    res.json({ configured: !!cfg });
  });

  // Returns existing keys so Setup page can prefill them
  app.get("/api/config/keys", (req, res) => {
    const cfg = storage.getApiConfig();
    if (!cfg) return res.json({});
    res.json({
      openaiKey: cfg.openaiKey || "",
      tavilyKey: cfg.tavilyKey || "",
      firecrawlKey: cfg.firecrawlKey || "",
      apifyKey: cfg.apifyKey || "",
      findymailKey: cfg.findymailKey || "",
      hunterApiKey: cfg.hunterApiKey || "",
    });
  });

  // ── Business profile ───────────────────────────────────────────────────────
  app.get("/api/profile", async (req, res) => {
    const profiles = await storage.listBusinessProfiles();
    res.json(profiles[0] || null);
  });

  app.post("/api/profile", async (req, res) => {
    try {
      const existing = await storage.listBusinessProfiles();
      if (existing.length > 0) {
        const updated = await storage.updateBusinessProfile(existing[0].id, req.body);
        return res.json(updated);
      }
      const profile = await storage.createBusinessProfile(req.body);
      res.json(profile);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── ICP + start scrape job ─────────────────────────────────────────────────
  app.post("/api/jobs/start", async (req, res) => {
    const apiConfig = storage.getApiConfig();
    if (!apiConfig) return res.status(400).json({ error: "API-nøkler ikke konfigurert" });

    const profiles = await storage.listBusinessProfiles();
    if (!profiles.length) return res.status(400).json({ error: "Fyll inn din bedriftsprofil først" });
    const businessProfile = profiles[0];

    try {
      const icp = await storage.createIcpProfile({
        businessProfileId: businessProfile.id,
        targetCategory: req.body.targetCategory,
        targetCity: req.body.targetCity,
        minRating: req.body.minRating ?? null,
        maxRating: req.body.maxRating ?? null,
        minReviews: req.body.minReviews ?? null,
        maxReviews: req.body.maxReviews ?? null,
        keywords: req.body.keywords ?? [],
        painPoints: req.body.painPoints ?? [],
        numberOfLeads: req.body.numberOfLeads ?? 50,
      });

      const job = await storage.createScrapeJob({
        icpProfileId: icp.id,
        status: "running",
        totalLeads: 0,
        processedLeads: 0,
        error: null,
        createdAt: new Date().toISOString(),
      });

      res.json({ jobId: job.id });

      // Run async — don't await
      runScrapeJob(job.id, icp, businessProfile, apiConfig).catch(e =>
        storage.updateScrapeJob(job.id, { status: "error", error: e.message })
      );
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── Job status ─────────────────────────────────────────────────────────────
  app.get("/api/jobs", async (req, res) => {
    const jobs = await storage.listScrapeJobs();
    res.json(jobs);
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getScrapeJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job ikke funnet" });
    res.json(job);
  });

  // ── Leads ──────────────────────────────────────────────────────────────────
  app.get("/api/jobs/:id/leads", async (req, res) => {
    const leads = await storage.listLeadsByJob(Number(req.params.id));
    res.json(leads);
  });

  app.get("/api/leads", async (req, res) => {
    const leads = await storage.listAllLeads();
    res.json(leads);
  });

  app.get("/api/leads/:id", async (req, res) => {
    const lead = await storage.getLead(Number(req.params.id));
    if (!lead) return res.status(404).json({ error: "Lead ikke funnet" });
    res.json(lead);
  });

  app.patch("/api/leads/:id/status", async (req, res) => {
    const { status } = req.body;
    const updated = await storage.updateLead(Number(req.params.id), { status });
    if (!updated) return res.status(404).json({ error: "Lead ikke funnet" });
    res.json(updated);
  });

  // ── Export leads as Excel (.xlsx) ─────────────────────────────────────────
  app.get("/api/jobs/:id/export", async (req, res) => {
    const leads = await storage.listLeadsByJob(Number(req.params.id));
    const wb = new ExcelJS.Workbook();
    wb.creator = "ProspectAI";
    const ws = wb.addWorksheet("Leads");

    ws.columns = [
      { header: "Navn", key: "name", width: 30 },
      { header: "Kategori", key: "category", width: 20 },
      { header: "By", key: "city", width: 15 },
      { header: "Telefon", key: "phone", width: 18 },
      { header: "E-post", key: "email", width: 32 },
      { header: "Nettside", key: "website", width: 35 },
      { header: "Google Maps", key: "googleMapsUrl", width: 18 },
      { header: "Rating", key: "rating", width: 10 },
      { header: "Anmeldelser", key: "reviewCount", width: 14 },
      { header: "Lead Score", key: "leadScore", width: 13 },
      { header: "Health Score", key: "healthScore", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "Pain Signals", key: "painSignals", width: 40 },
      { header: "Kald melding (Dag 0)", key: "coldMessage", width: 60 },
      { header: "Oppfølging Dag 3", key: "followUp3Day", width: 50 },
      { header: "Oppfølging Dag 7", key: "followUp7Day", width: 50 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;

    const scoreColor = (score: number) => {
      if (score >= 75) return "FF22C55E";
      if (score >= 50) return "FFFBBF24";
      return "FFEF4444";
    };

    leads.forEach((l, i) => {
      const painText = (l.painSignals as any[] || []).map((p: any) => p.label).join(" · ");
      const row = ws.addRow({
        name: l.name,
        category: l.category,
        city: l.city,
        phone: l.phone || "",
        email: l.email || "",
        website: l.website || "",
        googleMapsUrl: l.googleMapsUrl || "",
        rating: l.rating ?? "",
        reviewCount: l.reviewCount ?? "",
        leadScore: l.leadScore ?? 0,
        healthScore: l.healthScore ?? 0,
        status: l.status || "new",
        painSignals: painText,
        coldMessage: l.coldMessage || "",
        followUp3Day: l.followUp3Day || "",
        followUp7Day: l.followUp7Day || "",
      });

      const bg = i % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
      });

      const lsCell = row.getCell("leadScore");
      lsCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      lsCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: scoreColor(l.leadScore ?? 0) } };
      lsCell.alignment = { horizontal: "center", vertical: "middle" };

      const hsCell = row.getCell("healthScore");
      hsCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      hsCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: scoreColor(l.healthScore ?? 0) } };
      hsCell.alignment = { horizontal: "center", vertical: "middle" };

      if (l.website) {
        const wsCell = row.getCell("website");
        wsCell.value = { text: l.website, hyperlink: l.website };
        wsCell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
      if (l.googleMapsUrl) {
        const gmCell = row.getCell("googleMapsUrl");
        gmCell.value = { text: "Vis på Maps", hyperlink: l.googleMapsUrl };
        gmCell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
      row.height = 60;
    });

    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "P1" };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${req.params.id}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });
}

// ── Background job runner ──────────────────────────────────────────────────
async function runScrapeJob(
  jobId: number,
  icp: any,
  businessProfile: any,
  apiConfig: ApiConfig
) {
  const sellerInfo = {
    name: businessProfile.name,
    category: businessProfile.category,
    valueProposition: businessProfile.valueProposition,
    senderName: businessProfile.senderName,
  };

  try {
    // Step 1: Get raw leads from Google Maps via Apify
    const rawLeads: RawLead[] = await apifyGoogleMaps(
      icp.targetCategory,
      icp.targetCity,
      icp.numberOfLeads,
      apiConfig.apifyKey
    );

    console.log(`[Job ${jobId}] Apify returned ${rawLeads.length} raw leads`);

    // Filter by ICP criteria
    const filtered = rawLeads.filter(lead => {
      if (icp.minRating && lead.rating && lead.rating < icp.minRating) return false;
      if (icp.maxRating && lead.rating && lead.rating > icp.maxRating) return false;
      if (icp.minReviews && lead.reviewCount && lead.reviewCount < icp.minReviews) return false;
      if (icp.maxReviews && lead.reviewCount && lead.reviewCount > icp.maxReviews) return false;
      return true;
    });

    console.log(`[Job ${jobId}] ${filtered.length} leads after ICP filter`);

    await storage.updateScrapeJob(jobId, {
      totalLeads: filtered.length,
      status: "running",
    });

    // Step 2: Enrich each lead sequentially (rate limiting)
    for (let i = 0; i < filtered.length; i++) {
      const raw = filtered[i];
      try {
        console.log(`[Job ${jobId}] Enriching lead ${i + 1}/${filtered.length}: ${raw.name}`);
        const enriched = await enrichLead(raw, icp, sellerInfo, apiConfig);

        await storage.createLead({
          scrapeJobId: jobId,
          name: raw.name,
          category: raw.category,
          address: raw.address,
          city: raw.city,
          phone: raw.phone || null,
          email: enriched.email || null,
          website: raw.website || null,
          googleMapsUrl: raw.googleMapsUrl || null,
          facebookUrl: enriched.facebookUrl || null,
          rating: raw.rating,
          reviewCount: raw.reviewCount,
          lastReviewDate: enriched.lastReviewDate || null,
          googleDescription: raw.googleDescription || null,
          websiteSummary: enriched.websiteSummary || null,
          facebookLastPost: enriched.facebookLastPost || null,
          facebookLastPostDate: enriched.facebookLastPostDate || null,
          facebookFollowers: enriched.facebookFollowers || null,
          painSignals: enriched.painSignals || [],
          leadScore: enriched.leadScore || 0,
          healthScore: enriched.healthScore || 0,
          leadScoreBreakdown: enriched.leadScoreBreakdown || [],
          healthScoreBreakdown: enriched.healthScoreBreakdown || [],
          coldMessage: enriched.coldMessage || null,
          followUp3Day: enriched.followUp3Day || null,
          followUp7Day: enriched.followUp7Day || null,
          status: "new",
        });

        await storage.updateScrapeJob(jobId, { processedLeads: i + 1 });

        // Small delay between leads to avoid rate limits
        if (i < filtered.length - 1) await new Promise(r => setTimeout(r, 1500));
      } catch (e: any) {
        console.error(`[Job ${jobId}] Lead ${raw.name} failed:`, e.message);
      }
    }

    console.log(`[Job ${jobId}] Done! ${filtered.length} leads enriched.`);
    await storage.updateScrapeJob(jobId, { status: "done" });
  } catch (e: any) {
    console.error(`[Job ${jobId}] Fatal error:`, e.message);
    await storage.updateScrapeJob(jobId, { status: "error", error: e.message });
  }
}
