// crawler.js
// 🎯 Multi-entity crawler — investors, wholesalers, suppliers, doctors, etc.

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const robotsParser = require("robots-parser");
const {
  extractInvestorData,
  extractMultipleInvestors,
  extractPortfolioCompanies,
  extractGenericEntity
} = require("./extractor");
const ai = require("./ai-helper");

const maxPagesPerSite = 40;
const userAgent = "InvestorCrawler/1.0";

// 🚫 JUNK DOMAIN BLACKLIST
const DOMAIN_BLACKLIST = [
  // Trade bodies
  "nasscom.in", "cii.in", "ficci.com", "assocham.org", "phdcci.in",
  // Media
  "inc42.com", "yourstory.com", "techcrunch.com", "entrackr.com",
  "economictimes.indiatimes.com", "livemint.com", "business-standard.com",
  "moneycontrol.com", "vccircle.com", "medianama.com",
  "forbes.com", "bloomberg.com", "reuters.com", "cnbc.com",
  // Social / Directories
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com",
  "youtube.com", "wikipedia.org", "medium.com", "reddit.com", "quora.com",
  "glassdoor.com", "indeed.com", "naukri.com",
  // Government
  "gov.in", "nic.in",
  // Anti-bot sites
  "justdial.com", "indiamart.com", "tradeindia.com", "sulekha.com",
  "practo.com", "urbancompany.com", "exportersindia.com"
];

function isBlacklisted(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return DOMAIN_BLACKLIST.some(d => host === d || host.endsWith("." + d));
  } catch { return false; }
}

// Rate limiting
const domainLastHit = new Map();
const MIN_DELAY_MS = 500;

async function rateLimit(domain) {
  const last = domainLastHit.get(domain) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  domainLastHit.set(domain, Date.now());
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function cleanUrl(url) {
  try { const p = new URL(url); p.hash = ""; return p.href; }
  catch { return null; }
}

async function getRobots(startUrl) {
  try {
    const parsed = new URL(startUrl);
    const robotsUrl = `${parsed.protocol}//${parsed.hostname}/robots.txt`;
    const res = await axios.get(robotsUrl, {
      timeout: 10000,
      headers: { "User-Agent": userAgent },
      validateStatus: () => true
    });
    if (res.status >= 400) return null;
    return robotsParser(robotsUrl, res.data);
  } catch { return null; }
}

async function getSitemapUrls(startUrl) {
  const urls = new Set();
  try {
    const parsed = new URL(startUrl);
    const sitemaps = [
      `${parsed.protocol}//${parsed.hostname}/sitemap.xml`,
      `${parsed.protocol}//${parsed.hostname}/sitemap_index.xml`
    ];
    for (const sitemapUrl of sitemaps) {
      try {
        const res = await axios.get(sitemapUrl, {
          timeout: 30000,
          headers: { "User-Agent": userAgent },
          validateStatus: () => true
        });
        if (res.status !== 200) continue;
        const xml = String(res.data);
        const locMatches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
        for (const loc of locMatches) {
          const url = loc.replace(/<\/?loc>/g, "").trim();
          if (url.endsWith(".xml")) continue;
          urls.add(url);
        }
        if (urls.size > 0) break;
      } catch {}
    }
  } catch {}
  return [...urls];
}

function isTeamPage(url) {
  const u = url.toLowerCase();
  return /\/(team|people|our-team|our_team|leadership|leaders|partners|partner|management|founders|founder|about|about-us|who-we-are|investors|investor|advisors|advisor|staff|principals|associates|directors|our-people|the-team|meet-the-team|network|members)/.test(u);
}

function isContactPage(url) {
  const u = url.toLowerCase();
  return /\/(contact|contact-us|get-in-touch|reach-us|impressum)/.test(u);
}

function isPortfolioPage(url) {
  const u = url.toLowerCase();
  return /\/(portfolio|companies|investments|backed|our-companies|funded|startups|products|services|catalog)/.test(u);
}

function getEntityScore(url, text, entityType = "investor") {
  const content = `${url} ${text}`.toLowerCase();

  const KEYWORDS = {
    investor: {
      strong: ["venture capital", "private equity", "family office", "angel investor", "investment firm", "portfolio companies", "managing partner", "general partner"],
      medium: ["investor", "fund", "capital", "seed funding", "series a", "series b"]
    },
    wholesaler: {
      strong: ["wholesaler", "wholesale supplier", "bulk supplier", "wholesale price", "minimum order", "moq"],
      medium: ["supplier", "bulk", "dealer", "trade", "b2b", "distributor"]
    },
    supplier: {
      strong: ["supplier", "supply chain", "authorized supplier"],
      medium: ["vendor", "provider", "b2b", "bulk", "wholesale"]
    },
    manufacturer: {
      strong: ["manufacturer", "manufacturing", "factory", "production unit"],
      medium: ["producer", "industrial", "plant"]
    },
    exporter: {
      strong: ["exporter", "export house", "international trade"],
      medium: ["export", "shipping", "customs"]
    },
    importer: {
      strong: ["importer", "import house"],
      medium: ["import", "international"]
    },
    dealer: {
      strong: ["dealer", "authorized dealer", "showroom"],
      medium: ["retailer", "shop", "store", "outlet"]
    },
    service_provider: {
      strong: ["doctor", "lawyer", "advocate", "consultant", "clinic", "hospital", "professional services"],
      medium: ["service", "professional", "expert", "specialist"]
    }
  };

  const keywords = KEYWORDS[entityType] || KEYWORDS.investor;
  let score = 0;
  for (const k of keywords.strong) if (content.includes(k)) score += 3;
  for (const k of keywords.medium) if (content.includes(k)) score += 1;
  return score;
}

function isJunkPage(url, text) {
  const u = url.toLowerCase();
  if (/\/(login|signin|signup|register|cart|checkout)/.test(u)) return true;
  const junkPaths = ["/privacy", "/terms", "/legal", "/cookies", "/careers", "/jobs", "/disclaimer", "/gdpr"];
  if (junkPaths.some(p => u.includes(p))) return true;
  if (text.length < 200) return true;
  return false;
}

// ---------- CRAWL SINGLE SITE ----------
async function crawlSite(startUrl, allRecords, entityType = "investor") {
  if (isBlacklisted(startUrl)) {
    console.log(`  ⏭️  Skipped (blacklisted): ${startUrl}`);
    return;
  }

  let startDomain;
  try { startDomain = new URL(startUrl).hostname; } catch { return; }

  let robots = await getRobots(startUrl);
  if (!robots) robots = { isAllowed: () => true };
  if (!robots.isAllowed(startUrl, userAgent)) {
    console.log(`Blocked: ${startUrl}`);
    return;
  }

  const visited = new Set();
  const queue = [startUrl];
  console.log(`Starting: ${startUrl} [${entityType}]`);

  try {
    const sitemapUrls = await getSitemapUrls(startUrl);
    if (sitemapUrls.length > 0) {
      const contactPages = sitemapUrls.filter(u => isContactPage(u));
      const teamPages = sitemapUrls.filter(u => isTeamPage(u));
      const otherPages = sitemapUrls.filter(u =>
        isPortfolioPage(u) || /\/(products|services|catalog|about)/i.test(u)
      );

      // 🎯 Priority: contact > team > portfolio
      queue.push(...contactPages.slice(0, 5));
      queue.push(...teamPages.slice(0, 15));
      queue.push(...otherPages.slice(0, 15));

      console.log(`  Sitemap: ${contactPages.length} contact, ${teamPages.length} team, ${otherPages.length} other`);
    }
  } catch {}

  while (queue.length > 0 && visited.size < maxPagesPerSite) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    if (isBlacklisted(url)) continue;
    if (!robots.isAllowed(url, userAgent)) continue;

    visited.add(url);

    try {
      await rateLimit(startDomain);
      const res = await axios.get(url, {
        timeout: 30000,
        headers: { "User-Agent": userAgent },
        maxContentLength: 5 * 1024 * 1024
      });
      const $ = cheerio.load(res.data);
      const text = cleanText($("body").text());
      if (isJunkPage(url, text)) continue;

      const score = getEntityScore(url, text, entityType);
      if (score >= 2) {
        let records;
        if (entityType === "investor") {
          if (isPortfolioPage(url) && !isTeamPage(url)) {
            records = extractPortfolioCompanies($, url);
            if (records.length === 0) records = [extractInvestorData($, url)];
          } else if (isTeamPage(url) || isContactPage(url)) {
            records = extractMultipleInvestors($, url);
          } else {
            records = [extractInvestorData($, url)];
          }
        } else {
          records = [extractGenericEntity($, url, entityType)];
        }

        // 🎯 Gemini fallback if no useful data
        const hasUsefulData = records.some(r =>
          (r.emails && r.emails.length > 0) ||
          (r.linkedin && r.linkedin.length > 0) ||
          (r.phones && r.phones.length > 0)
        );

        if (!hasUsefulData && text.length > 500 && ai.aiStatus().gemini) {
          try {
            console.log(`  🤖 Gemini extracting: ${url}`);
            const aiRecord = await ai.aiExtractEntity(text, url, entityType);
            if (aiRecord && (aiRecord.name || aiRecord.company_name || (aiRecord.emails && aiRecord.emails.length))) {
              records = [{
                name: aiRecord.name || "",
                company_name: aiRecord.company_name || "",
                investor_type: aiRecord.investor_type || entityType,
                region: aiRecord.region || "",
                hq_city: aiRecord.hq_city || null,
                sectors: aiRecord.sectors || [],
                tags: aiRecord.tags || [],
                portfolio: aiRecord.portfolio || [],
                thesis: aiRecord.thesis || "",
                emails: aiRecord.emails || [],
                email_details: (aiRecord.emails || []).map(e => ({ email: e, source: "gemini", weight: 8, score: 8, verified: null })),
                email_score: (aiRecord.emails || []).length * 8,
                linkedin: aiRecord.linkedin || [],
                linkedin_details: (aiRecord.linkedin || []).map(u => ({ url: u, score: 5 })),
                linkedin_score: (aiRecord.linkedin || []).length * 5,
                phones: aiRecord.phones || [],
                latest_year: null,
                is_fresh: false,
                description: aiRecord.description || "",
                website: url,
                source_url: url,
                source_urls: [url],
                investor_score: score,
                entity_type: entityType,
                crawl_type: "gemini_extracted"
              }];
              console.log(`  ✅ Gemini extracted: ${aiRecord.company_name || aiRecord.name || "record"}`);
            }
          } catch (err) {
            console.log(`  Gemini extraction failed: ${err.message}`);
          }
        }

        let kept = 0;
        for (const record of records) {
          const hasName = record.name && record.name.length > 2;
          const hasCompany = record.company_name && record.company_name.length > 2;
          const hasContact = (record.emails && record.emails.length > 0) ||
                             (record.linkedin && record.linkedin.length > 0) ||
                             (record.phones && record.phones.length > 0);
          if ((hasName && hasContact) || (hasCompany && !hasName) || (hasCompany && hasContact)) {
            record.investor_score = score;
            record.entity_type = entityType;
            record.status_code = res.status;
            allRecords.push(record);
            kept++;
          }
        }
        if (kept > 0) console.log(`  KEPT (${kept}): ${url}`);
      }

      // Discover internal links
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        try {
          const abs = new URL(href, url);
          if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
          if (abs.hostname !== startDomain) return;
          const clean = cleanUrl(abs.href);
          if (clean && !visited.has(clean) && !queue.includes(clean)) {
            if (!isBlacklisted(clean) && robots.isAllowed(clean, userAgent)) queue.push(clean);
          }
        } catch {}
      });
    } catch (err) {
      console.log(`  Failed ${url}: ${err.message}`);
    }
  }
  console.log(`Done ${startDomain} — pages: ${visited.size}`);
}

// ---------- CRAWL MULTIPLE SITES ----------
async function crawlSites(urls, entityType = "investor") {
  const allRecords = [];
  for (const url of urls) {
    try {
      await crawlSite(url, allRecords, entityType);
    } catch {
      console.log(`Site failed: ${url}`);
    }
  }
  return allRecords;
}

// ---------- CLI ----------
if (require.main === module) {
  const cliUrl = process.argv[2];
  let seeds;
  if (cliUrl) seeds = [cliUrl.trim()];
  else if (fs.existsSync("seeds.txt")) {
    seeds = fs.readFileSync("seeds.txt", "utf8")
      .split(/\r?\n/)
      .map(u => u.trim())
      .filter(u => u && !u.startsWith("#"));
  } else {
    console.log("No URL.");
    process.exit(1);
  }
  crawlSites(seeds).then(records => {
    fs.writeFileSync("crawl-results.json", JSON.stringify(records, null, 2));
    console.log(`\nTotal: ${records.length}`);
  });
}

// 🎯 EXPORTS
module.exports = { crawlSites };