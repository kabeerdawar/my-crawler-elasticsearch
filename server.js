// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const { parseQuery } = require("./queryParser");
const { discoverSources, loadSeedDomains } = require("./discovery");
const { crawlSites } = require("./crawler");
const { deduplicateInvestors } = require("./deduplicator");
const apiSources = require("./api-sources");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- POST /discover ----------
app.post("/discover", (req, res) => {
  const raw = String(req.body.query || "").trim();
  if (!raw) return res.status(400).json({ error: "Please enter a query." });

  const parsed = parseQuery(raw);
  const discovery = discoverSources(parsed);

  res.json({
    query: raw,
    parsed,
    totalConsidered: discovery.totalConsidered,
    totalMatched: discovery.totalMatched,
    sources: discovery.sources
  });
});

// ---------- POST /crawl ----------
app.post("/crawl", async (req, res) => {
  const urls = Array.isArray(req.body.urls) ? req.body.urls : [];
  const query = String(req.body.query || "").trim();

  if (urls.length === 0) {
    return res.status(400).json({ error: "No URLs provided." });
  }

  const cleanUrls = urls
    .map(u => String(u || "").trim())
    .filter(u => /^https?:\/\//i.test(u));

  if (cleanUrls.length === 0) {
    return res.status(400).json({ error: "No valid URLs." });
  }

  try {
    // 1. Crawl websites
    const rawRecords = await crawlSites(cleanUrls);
    console.log(`Crawled ${rawRecords.length} raw records from websites.`);

    // 2. Fetch from free APIs based on parsed query
    let apiRecords = [];
    if (query) {
      const parsed = parseQuery(query);

      const tasks = [
        apiSources.fetchGitDealFlow()
      ];

      if (parsed.region === "Europe") {
        tasks.push(apiSources.fetchTechEu({ limit: 50 }));
      }
      if (parsed.region === "USA") {
        tasks.push(apiSources.fetchSecEdgarFormD({ limit: 30 }));
        tasks.push(apiSources.fetchSbir({ limit: 30 }));
      }

      const results = await Promise.all(tasks);
      for (const arr of results) {
        apiRecords.push(...arr);
      }
      console.log(`Fetched ${apiRecords.length} records from APIs.`);
    }

    // 3. Merge + dedupe
    const allRecords = [...rawRecords, ...apiRecords];
    const uniqueRecords = deduplicateInvestors(allRecords);

    // 4. Enrich with hq_city from seed list
    const seeds = loadSeedDomains();
    for (const record of uniqueRecords) {
      try {
        const recordDomain = new URL(record.source_url).hostname.replace(/^www\./, "");
        for (const seed of seeds) {
          const seedDomain = seed.domain.replace(/^www\./, "").split("/")[0];
          if (recordDomain === seedDomain || recordDomain.endsWith("." + seedDomain)) {
            record.hq_city = seed.hq_city || null;
            record.cities = seed.cities || [];
            break;
          }
        }
      } catch {}
    }

    fs.writeFileSync(
      path.join(__dirname, "crawl-results.json"),
      JSON.stringify(uniqueRecords, null, 2)
    );

    res.json({
      sitesCrawled: cleanUrls.length,
      rawCount: rawRecords.length,
      apiCount: apiRecords.length,
      uniqueCount: uniqueRecords.length,
      results: uniqueRecords
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Crawl failed: " + err.message });
  }
});

// ---------- GET /results ----------
app.get("/results", (req, res) => {
  try {
    const p = path.join(__dirname, "crawl-results.json");
    if (!fs.existsSync(p)) return res.json({ count: 0, results: [] });
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    res.json({ count: data.length, results: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- GET /health ----------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "Investor Discovery Crawler" });
});

app.listen(PORT, () => {
  console.log("");
  console.log("================================");
  console.log("  INVESTOR DISCOVERY CRAWLER");
  console.log("================================");
  console.log(`Open:   http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log("================================");
  console.log("");
});