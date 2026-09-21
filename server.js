// server.js
console.log('🚀 server.js starting...');

// --- FIX: Global Crash Protection (Sabse upar hona chahiye) ---
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Server zinda hai...');
    console.error(err.name, err.message);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Server zinda hai...');
    console.error(err.name, err.message);
});
// -----------------------------------------------------------

const express = require("express");
const fs = require("fs");
const path = require("path");

const { parseQuery } = require("./queryParser");
const { discoverSources, loadSeedDomains } = require("./discovery");
const { crawlSites } = require("./crawler");
const { crawlSitesWithPlaywright } = require("./crawler-playwright");
const { deduplicateInvestors } = require("./deduplicator");
const { validateMany } = require("./schema");
const { discoverSourcesFromQuery } = require("./discovery-search");
const { saveInvestors, saveReviewQueue, getAllInvestors, isConfigured } = require("./db");
const scheduler = require("./scheduler");
const ai = require("./ai-helper");

console.log('📦 All modules loaded');

const app = express();
const PORT = 3000;

// ---------- SEARCH HISTORY ----------
const HISTORY_FILE = path.join(__dirname, "search-history.json");

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch { return []; }
}

function saveHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 100), null, 2));
}

const JS_HEAVY_SITES = [
  "startupindia.gov.in","sebi.gov.in","msme.gov.in","data.gov.in",
  "esma.europa.eu","vcs.go.kr","northdata.com","dealroom.co","crunchbase.com"
];

function isJsHeavy(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return JS_HEAVY_SITES.some(site => host === site || host.endsWith("." + site));
  } catch { return false; }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  req.setTimeout(3600000);
  res.setTimeout(3600000);
  next();
});

// ---------- POST /discover ----------
app.post("/discover", async (req, res) => {
  const raw = String(req.body.query || "").trim();
  if (!raw) return res.status(400).json({ error: "Please enter a query." });

  let parsed = parseQuery(raw);

  if (!parsed.understood && ai.aiStatus().groq) {
    console.log("🤖 Trying Groq AI parser...");
    try {
      const aiParsed = await ai.aiParseQuery(raw);
      if (aiParsed) {
        parsed = {
          raw,
          region: aiParsed.region,
          city: aiParsed.city,
          sectors: aiParsed.sectors || [],
          stages: aiParsed.stages || [],
          investorTypes: aiParsed.investorTypes || [],
          understood: true
        };
        console.log("✅ Groq parsed:", JSON.stringify(parsed));
      }
    } catch (err) {
      console.log("AI parse failed:", err.message);
    }
  }

  const discovery = discoverSources(parsed);
  const seedSources = discovery.sources;

  let ddgSources = [];
  try { ddgSources = await discoverSourcesFromQuery(parsed, 20); }
  catch (err) { console.log("DDG discovery failed:", err.message); }

  const seenDomains = new Set();
  const allSources = [];

  for (const s of seedSources) {
    if (!seenDomains.has(s.domain)) { seenDomains.add(s.domain); allSources.push(s); }
  }
  for (const s of ddgSources) {
    if (!seenDomains.has(s.host)) {
      seenDomains.add(s.host);
      allSources.push({
        domain: s.host, url: s.url, type: "Unknown",
        region: parsed.region || "", hq_city: null,
        sectors: [], stages: [], score: 1,
        reasons: ["discovered via DuckDuckGo"]
      });
    }
  }

  res.json({
    query: raw, parsed,
    totalConsidered: discovery.totalConsidered,
    totalMatched: allSources.length,
    seedMatched: seedSources.length,
    ddgMatched: ddgSources.length,
    sources: allSources
  });
});

// ---------- CRAWL LOGIC ----------
async function crawlUrls(cleanUrls, query) {
  const staticUrls = cleanUrls.filter(u => !isJsHeavy(u));
  const jsUrls = cleanUrls.filter(u => isJsHeavy(u));

  console.log(`Static: ${staticUrls.length}, JS-heavy: ${jsUrls.length}`);

  let rawRecords = [];
  if (staticUrls.length > 0) {
    const r = await crawlSites(staticUrls);
    rawRecords.push(...r);
    console.log(`Static: ${r.length}`);
  }
  if (jsUrls.length > 0) {
    const r = await crawlSitesWithPlaywright(jsUrls);
    rawRecords.push(...r);
    console.log(`JS-heavy: ${r.length}`);
  }

  console.log(`Raw total: ${rawRecords.length}`);

  const { valid, invalidCount } = validateMany(rawRecords);
  console.log(`Valid: ${valid.length}, Invalid: ${invalidCount}`);

  let cleanedRecords = valid;
  if (ai.aiStatus().gemini && valid.length > 0) {
    console.log(`🤖 Cleaning first 10 records with Gemini...`);
    cleanedRecords = await Promise.all(
      valid.map(async (record, idx) => {
        if (idx >= 10) return record;
        try {
          const cleaned = await ai.aiCleanRecord(record);
          return { ...record, ...cleaned };
        } catch { return record; }
      })
    );
    console.log("✅ AI cleaning done");
  }

  console.log("Running dedup...");
  const { investors, reviewQueue } = await deduplicateInvestors(cleanedRecords);
  console.log(`Investors: ${investors.length}, Review: ${reviewQueue.length}`);
  console.log(`HIGH: ${investors.filter(r => r.confidence === "HIGH").length}`);

  const seeds = loadSeedDomains();
  for (const record of investors) {
    try {
      const recordDomain = new URL(record.source_url).hostname.replace(/^www\./, "");
      for (const seed of seeds) {
        const seedDomain = seed.domain.replace(/^www\./, "").split("/")[0];
        if (recordDomain === seedDomain || recordDomain.endsWith("." + seedDomain)) {
          record.hq_city = record.hq_city || seed.hq_city || null;
          record.cities = seed.cities || [];
          break;
        }
      }
    } catch {}
  }

  fs.writeFileSync(path.join(__dirname, "crawl-results.json"), JSON.stringify(investors, null, 2));
  fs.writeFileSync(path.join(__dirname, "review-queue.json"), JSON.stringify(reviewQueue, null, 2));

  if (isConfigured()) {
    try {
      const invR = await saveInvestors(investors);
      const revR = await saveReviewQueue(reviewQueue);
      console.log(`Supabase: ${invR.saved} investors + ${revR.saved} review saved`);
    } catch (e) {
      console.error("Supabase save failed:", e.message);
    }
  }

  saveHistory({
    query: query || "",
    urls: cleanUrls,
    timestamp: new Date().toISOString(),
    rawCount: rawRecords.length,
    uniqueCount: investors.length,
    highCount: investors.filter(r => r.confidence === "HIGH").length,
    emailCount: investors.filter(r => r.emails && r.emails.length > 0).length
  });

  return { rawRecords, valid, invalidCount, investors, reviewQueue };
}

// Wire scheduler
scheduler.setCrawler(async (urls, query) => {
  const cleanUrls = urls.map(u => String(u || "").trim()).filter(u => /^https?:\/\//i.test(u));
  if (cleanUrls.length === 0) return;
  console.log(`[scheduler] Auto-crawl: ${query || "urls"}`);
  await crawlUrls(cleanUrls, query || "");
});

// ---------- POST /crawl ----------
app.post("/crawl", async (req, res) => {
  const urls = Array.isArray(req.body.urls) ? req.body.urls : [];
  if (urls.length === 0) return res.status(400).json({ error: "No URLs provided." });

  const cleanUrls = urls.map(u => String(u || "").trim()).filter(u => /^https?:\/\//i.test(u));
  if (cleanUrls.length === 0) return res.status(400).json({ error: "No valid URLs." });

  try {
    const result = await crawlUrls(cleanUrls, req.body.query || "");
    res.json({
      sitesCrawled: cleanUrls.length,
      rawCount: result.rawRecords.length,
      validCount: result.valid.length,
      invalidCount: result.invalidCount,
      uniqueCount: result.investors.length,
      reviewCount: result.reviewQueue.length,
      results: result.investors
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Crawl failed: " + err.message });
  }
});

// ---------- GET /results ----------
app.get("/results", async (req, res) => {
  try {
    if (isConfigured()) {
      const data = await getAllInvestors();
      if (data.length > 0) return res.json({ count: data.length, results: data, source: "supabase" });
    }
    const p = path.join(__dirname, "crawl-results.json");
    if (!fs.existsSync(p)) return res.json({ count: 0, results: [] });
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    res.json({ count: data.length, results: data, source: "json" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- GET /results/all (FIXED: Added for frontend toggle) ----------
app.get("/results/all", async (req, res) => {
  try {
    if (isConfigured()) {
      const data = await getAllInvestors();
      return res.json({ count: data.length, results: data, source: "supabase" });
    }
    const p = path.join(__dirname, "crawl-results.json");
    if (!fs.existsSync(p)) return res.json({ count: 0, results: [] });
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    res.json({ count: data.length, results: data, source: "json" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- POST /reset (FIXED: Added for frontend reset button) ----------
app.post("/reset", async (req, res) => {
  try {
    // 1. Clear search history
    if (fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
    }

    // 2. Clear crawler tracker file if it exists
    const trackerPath = path.join(__dirname, "crawl-tracker.json");
    if (fs.existsSync(trackerPath)) {
      fs.writeFileSync(trackerPath, JSON.stringify({}, null, 2));
    }

    // 3. Count preserved data (do NOT delete)
    let investorCount = 0;
    let reviewCount = 0;

    if (isConfigured()) {
      try {
        const all = await getAllInvestors();
        investorCount = all.length;
      } catch {}
    } else {
      const p = path.join(__dirname, "crawl-results.json");
      if (fs.existsSync(p)) {
        try { investorCount = JSON.parse(fs.readFileSync(p, "utf8")).length; } catch {}
      }
    }

    const rqPath = path.join(__dirname, "review-queue.json");
    if (fs.existsSync(rqPath)) {
      try { reviewCount = JSON.parse(fs.readFileSync(rqPath, "utf8")).length; } catch {}
    }

    res.json({
      success: true,
      message: "Crawler reset successfully",
      dataPreserved: {
        investors: investorCount,
        review: reviewCount
      }
    });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- GET /review ----------
app.get("/review", (req, res) => {
  try {
    const p = path.join(__dirname, "review-queue.json");
    if (!fs.existsSync(p)) return res.json({ count: 0, results: [] });
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    res.json({ count: data.length, results: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- GET /history ----------
app.get("/history", (req, res) => {
  res.json({ history: loadHistory() });
});

// ---------- POST /scheduler/run ----------
app.post("/scheduler/run", async (req, res) => {
  try {
    const rerun = await scheduler.runScheduledCrawl();
    res.json({ rerun: rerun.length, queries: rerun.map(r => r.query) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- GET /health ----------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Investor Discovery Crawler",
    supabase: isConfigured(),
    ai: ai.aiStatus()
  });
});

// ---------- GET /ai/status ----------
app.get("/ai/status", (req, res) => {
  res.json(ai.aiStatus());
});

// ---------- START ----------
scheduler.startScheduler();

console.log('📡 About to call app.listen on port', PORT);

app.listen(PORT, () => {
  console.log('✅ Server is listening!');
  console.log("");
  console.log("================================");
  console.log("  INVESTOR DISCOVERY CRAWLER");
  console.log("================================");
  console.log(`Open:      http://localhost:${PORT}`);
  console.log(`Supabase:  ${isConfigured() ? "✅ Connected" : "⚠️  Not configured"}`);
  console.log(`AI:        Groq ${ai.aiStatus().groq ? "✅" : "❌"} | Gemini ${ai.aiStatus().gemini ? "✅" : "❌"}`);
  console.log("================================");
  console.log("");
});