/**
 * Enrichment engine:
 *  1. Tavily → search for business + Facebook page
 *  2. Firecrawl → scrape website content
 *  3. GPT-4o → analyze pain signals, compute lead/health scores, write outreach sequences
 */

import type { IcpProfile, Lead, PainSignal, ScoreBreakdown, ApiConfig } from "@shared/schema";

// ── Extract email from scraped website content ──────────────────────────────
function extractEmailFromContent(content: string): string | null {
  // Match standard email patterns, avoid image/asset extensions
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = content.match(emailRegex) || [];
  const filtered = matches.filter(e =>
    !e.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff)/i) &&
    !e.startsWith('noreply') &&
    !e.startsWith('no-reply') &&
    !e.includes('example.com') &&
    !e.includes('sentry.io') &&
    !e.includes('w3.org')
  );
  return filtered[0] || null;
}

// ── Scrape contact page for email ─────────────────────────────────────────────
async function scrapeContactPageEmail(websiteUrl: string, firecrawlKey: string): Promise<string | null> {
  try {
    const base = websiteUrl.replace(/\/$/, '');
    const contactPaths = ['/kontakt', '/contact', '/om-oss', '/about', '/kontaktoss'];
    for (const path of contactPaths) {
      const content = await firecrawlScrape(base + path, firecrawlKey);
      if (content) {
        const email = extractEmailFromContent(content);
        if (email) return email;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Findymail email finder ────────────────────────────────────────────────────
async function findymailSearch(businessName: string, domain: string, apiKey: string): Promise<string | null> {
  try {
    // Try to find the owner/contact email using business name + domain
    const res = await fetch("https://app.findymail.com/api/search/name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: businessName,
        domain: domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.contact?.email || null;
  } catch {
    return null;
  }
}

// ── Tavily search ─────────────────────────────────────────────────────────────
async function tavilySearch(query: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const results = (data.results || []).map((r: any) => `${r.title}\n${r.content}`).join("\n\n");
    return (data.answer ? `SVAR: ${data.answer}\n\n` : "") + results;
  } catch {
    return "";
  }
}

// ── Firecrawl scrape ──────────────────────────────────────────────────────────
async function firecrawlScrape(url: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], timeout: 15000 }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const md: string = data?.data?.markdown || "";
    return md.slice(0, 3000);
  } catch {
    return "";
  }
}

// ── Apify Google Maps scrape ──────────────────────────────────────────────────
export async function apifyGoogleMaps(
  query: string,
  city: string,
  maxResults: number,
  apiKey: string
): Promise<RawLead[]> {
  try {
    // Start the actor run
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Multiple search strings to bypass the ~20/search limit
          searchStringsArray: [
            `${query} ${city}`,
            `${query} sentrum ${city}`,
            `${query} ${city} Norge`,
          ].slice(0, Math.ceil(maxResults / 20)),
          maxCrawledPlacesPerSearch: 20,
          language: "no",
          includeWebResults: false,
        }),
      }
    );
    if (!startRes.ok) {
      const err = await startRes.text();
      throw new Error(`Apify start failed: ${err}`);
    }
    const runData = await startRes.json();
    const runId = runData?.data?.id;
    if (!runId) throw new Error("No run ID from Apify");

    // Poll until finished — wait up to 10 minutes, use /actor-runs endpoint
    const pollStart = Date.now();
    let apifyDone = false;
    let datasetId: string | null = null;
    while (Date.now() - pollStart < 600_000) {
      await new Promise(r => setTimeout(r, 8000));
      try {
        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
        );
        const statusData = await statusRes.json();
        const status = statusData?.data?.status;
        datasetId = statusData?.data?.defaultDatasetId || null;
        console.log(`[Apify] Run ${runId} status: ${status}, datasetId: ${datasetId}`);
        if (status === "SUCCEEDED") { apifyDone = true; break; }
        if (status === "FAILED" || status === "ABORTED") throw new Error(`Apify run ${status}`);
      } catch (pollErr: any) {
        console.error("[Apify] Poll error:", pollErr.message);
      }
    }
    if (!apifyDone) throw new Error("Apify timeout etter 10 minutter");
    if (!datasetId) throw new Error("Ingen datasetId fra Apify");

    // Fetch results using the correct dataset endpoint
    const dataRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=${maxResults}`
    );
    const items = await dataRes.json();
    console.log(`[Apify] Fetched ${Array.isArray(items) ? items.length : 'N/A (not array)'} items from dataset ${datasetId}`);
    // Deduplicate by place name
    const seen = new Set<string>();
    const allItems = (Array.isArray(items) ? items : []).filter((item: any) => {
      const key = (item.title || item.name || "").toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, maxResults);
    console.log(`[Apify] ${allItems.length} unique leads after dedup (limit: ${maxResults})`);
    return allItems.map((item: any): RawLead => ({
      name: item.title || item.name || "",
      category: item.categoryName || "",
      address: item.address || "",
      city: item.city || city,
      phone: item.phone || "",
      website: item.website || "",
      googleMapsUrl: item.url || "",
      rating: item.totalScore ?? null,
      reviewCount: item.reviewsCount ?? null,
      googleDescription: item.description || "",
    }));
  } catch (e: any) {
    console.error("Apify error:", e.message);
    return [];
  }
}

export type RawLead = {
  name: string;
  category: string;
  address: string;
  city: string;
  phone: string;
  website: string;
  googleMapsUrl: string;
  rating: number | null;
  reviewCount: number | null;
  googleDescription: string;
};

// ── Main enrichment function ──────────────────────────────────────────────────
export async function enrichLead(
  raw: RawLead,
  icp: IcpProfile,
  sellerInfo: { name: string; category: string; valueProposition: string; senderName: string },
  apiConfig: ApiConfig
): Promise<Partial<Lead>> {
  const enriched: Partial<Lead> = {};

  // 1. Search for more info + Facebook
  const searchQuery = `${raw.name} ${raw.city} Facebook anmeldelser`;
  const tavilyResult = await tavilySearch(searchQuery, apiConfig.tavilyKey);

  // Try to extract Facebook URL from Tavily results
  const fbMatch = tavilyResult.match(/facebook\.com\/[^\s"')>]+/i);
  if (fbMatch) enriched.facebookUrl = "https://" + fbMatch[0].replace(/^https?:\/\//, "");

  // 2. Scrape website if available
  let websiteContent = "";
  if (raw.website) {
    websiteContent = await firecrawlScrape(raw.website, apiConfig.firecrawlKey);
    enriched.websiteSummary = websiteContent.slice(0, 500);
  }

  // 3. Scrape Facebook if found
  let facebookContent = "";
  if (enriched.facebookUrl) {
    facebookContent = await firecrawlScrape(enriched.facebookUrl, apiConfig.firecrawlKey);
  }

  // 4. Find email — three strategies in order of preference:
  if (raw.website) {
    // Strategy A: extract from homepage content we already have
    if (websiteContent) {
      const emailFromHome = extractEmailFromContent(websiteContent);
      if (emailFromHome) { enriched.email = emailFromHome; console.log(`[Email] Found on homepage: ${emailFromHome}`); }
    }
    // Strategy B: scrape contact page if homepage had no email
    if (!enriched.email) {
      const emailFromContact = await scrapeContactPageEmail(raw.website, apiConfig.firecrawlKey);
      if (emailFromContact) { enriched.email = emailFromContact; console.log(`[Email] Found on contact page: ${emailFromContact}`); }
    }
    // Strategy C: Findymail as final fallback (if key is set)
    if (!enriched.email && apiConfig.findymailKey) {
      const foundEmail = await findymailSearch(raw.name, raw.website, apiConfig.findymailKey);
      if (foundEmail) { enriched.email = foundEmail; console.log(`[Email] Found via Findymail: ${foundEmail}`); }
    }
  }

  // 5. GPT analysis — pain signals, scores, outreach
  const gptResult = await analyzeWithGPT(
    raw, icp, sellerInfo, tavilyResult, websiteContent, facebookContent, apiConfig.openaiKey
  );

  return { ...enriched, ...gptResult };
}

// ── GPT Analysis ─────────────────────────────────────────────────────────────
async function analyzeWithGPT(
  raw: RawLead,
  icp: IcpProfile,
  seller: { name: string; category: string; valueProposition: string; senderName: string },
  tavilyData: string,
  websiteContent: string,
  facebookContent: string,
  openaiKey: string
): Promise<Partial<Lead>> {
  const systemPrompt = `Du er en ekspert på B2B lead-analyse og salgspsykologi. 
Du analyserer lokale servicebedrifter for salgsmuligheter og skriver norske outreach-meldinger.
Svar alltid på norsk. Returner alltid gyldig JSON.`;

  const userPrompt = `
BEDRIFT SOM SELGER:
Navn: ${seller.name}
Kategori: ${seller.category}
Verdiforslag: ${seller.valueProposition}
Selger heter: ${seller.senderName}

LEAD SOM SKAL ANALYSERES:
Navn: ${raw.name}
Kategori: ${raw.category}
Adresse: ${raw.address}, ${raw.city}
Telefon: ${raw.phone || "ikke funnet"}
Nettside: ${raw.website || "ingen"}
Google rating: ${raw.rating ?? "ukjent"} (${raw.reviewCount ?? 0} anmeldelser)
Google beskrivelse: ${raw.googleDescription || "ingen"}

INNSAMLET DATA:
Webs\u00f8k resultat: ${tavilyData.slice(0, 1500)}
Nettside innhold: ${websiteContent.slice(0, 1000)}
Facebook innhold: ${facebookContent.slice(0, 1000)}

OPPGAVE: Analyser denne bedriften og returner JSON med følgende struktur:
{
  "painSignals": [
    {
      "type": "low_reviews | old_reviews | low_rating | no_website | inactive_social | no_booking | manual_processes",
      "label": "Kort norsk label, maks 5 ord",
      "severity": "high | medium | low",
      "description": "Konkret forklaring på norsk - hva dette betyr for dem og hvorfor det er et problem"
    }
  ],
  "leadScore": <0-100, basert på hvor bra denne bedriften matcher verdiforslaget>,
  "healthScore": <0-100, basert på hvor pålitelig/fullstendig dataen er>,
  "leadScoreBreakdown": [
    {"label": "Norsk label", "points": <tall>, "reason": "Forklaring"}
  ],
  "healthScoreBreakdown": [
    {"label": "Norsk label", "points": <tall>, "reason": "Forklaring"}
  ],
  "coldMessage": "<Personalisert kald melding på norsk, maks 120 ord. Nevn noe spesifikt om bedriften. Avslutt med konkret CTA.>",
  "followUp3Day": "<Oppf\u00f8lging etter 3 dager, mer direkte, maks 80 ord>",
  "followUp7Day": "<Siste sjanse melding etter 7 dager, kort og direkte, maks 60 ord>",
  "facebookLastPost": "<Siste Facebook innhold funnet, eller null>",
  "facebookLastPostDate": "<Dato for siste post hvis funnet, eller null>",
  "lastReviewDate": "<Siste anmeldelsesdato hvis funnet, eller null>"
}

Pain signal retningslinjer:
- Få reviews (<20): "few_reviews" → høy severity
- Lav rating (<3.8): "low_rating" → høy severity
- Ingen nettside: "no_website" → medium severity
- Ingen bookingsystem synlig: "no_booking" → high severity
- Inaktiv sosiale medier (>60 dager siden siste post): "inactive_social" → medium severity
- Manuell prosess synlig (f.eks. "ring oss for booking"): "manual_processes" → high severity

Lead score retningslinjer:
- 80-100: Perfekt match, tydelige pain signals som samsvarer med verdiforslaget
- 60-79: God match, noen pain signals
- 40-59: Mulig match, usikkert
- Under 40: Dårlig match

Health score retningslinjer:
- 80-100: Nettside funnet, Facebook funnet, kontaktinfo verifisert
- 60-79: Noen data funnet
- Under 60: Lite data, vanskelig å verifisere
`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI error:", err);
      return buildFallbackScores(raw);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return buildFallbackScores(raw);

    const parsed = JSON.parse(content);
    return {
      painSignals: parsed.painSignals || [],
      leadScore: parsed.leadScore || 0,
      healthScore: parsed.healthScore || 0,
      leadScoreBreakdown: parsed.leadScoreBreakdown || [],
      healthScoreBreakdown: parsed.healthScoreBreakdown || [],
      coldMessage: parsed.coldMessage || "",
      followUp3Day: parsed.followUp3Day || "",
      followUp7Day: parsed.followUp7Day || "",
      facebookLastPost: parsed.facebookLastPost || null,
      facebookLastPostDate: parsed.facebookLastPostDate || null,
      lastReviewDate: parsed.lastReviewDate || null,
    };
  } catch (e: any) {
    console.error("GPT parse error:", e.message);
    return buildFallbackScores(raw);
  }
}

function buildFallbackScores(raw: RawLead): Partial<Lead> {
  const painSignals: PainSignal[] = [];
  if ((raw.reviewCount ?? 0) < 20) {
    painSignals.push({ type: "few_reviews", label: "Få Google-anmeldelser", severity: "high", description: "Bedriften har under 20 anmeldelser. Et automatisk review-system ville hjulpet dem raskt." });
  }
  if (raw.rating && raw.rating < 3.8) {
    painSignals.push({ type: "low_rating", label: "Lav Google-rating", severity: "high", description: "Rating under 3.8 — kunder velger konkurrenter. Potensielt dårlig review-håndtering." });
  }
  if (!raw.website) {
    painSignals.push({ type: "no_website", label: "Ingen nettside", severity: "medium", description: "Ingen synlig nettside betyr sannsynligvis ingen online booking." });
  }

  const baseScore = Math.min(
    100,
    (painSignals.length * 20) +
    (raw.reviewCount && raw.reviewCount > 10 ? 20 : 0) +
    (raw.rating && raw.rating >= 3.5 ? 10 : 0)
  );

  return {
    painSignals,
    leadScore: Math.max(30, baseScore),
    healthScore: raw.website ? 55 : 35,
    leadScoreBreakdown: [{ label: "Automatisk beregning", points: baseScore, reason: "Basert på tilgjengelig data" }],
    healthScoreBreakdown: [{ label: "Data tilgjengelighet", points: raw.website ? 55 : 35, reason: raw.website ? "Nettside funnet" : "Ingen nettside" }],
    coldMessage: `Hei! Jeg heter ${raw.name} og jobber med lokale servicebedrifter i ${raw.city}. Jeg hjelper bedrifter som din med å automatisere Google-anmeldelser og online booking. Kan vi ta en rask prat?`,
    followUp3Day: `Hei igjen! Sendte deg en melding for noen dager siden om automatisering av Google-anmeldelser. Har du 10 minutter til en rask samtale?`,
    followUp7Day: `Siste melding fra meg — hjelper ${raw.city}-bedrifter med mer booking og bedre Google-synlighet. Interessert?`,
  };
}
