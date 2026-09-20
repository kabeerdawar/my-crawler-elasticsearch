// crawler.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const robotsParser = require("robots-parser");
const { extractInvestorData, extractMultipleInvestors } = require("./extractor");

const maxPagesPerSite = 60;
const userAgent = "InvestorCrawler/1.0";

function cleanText(text) { return String(text || "").replace(/\s+/g, " ").trim(); }
function cleanUrl(url) { try { const p = new URL(url); p.hash = ""; return p.href; } catch { return null; } }

async function getRobots(startUrl) {
  try {
    const parsed = new URL(startUrl);
    const res = await axios.get(`${parsed.protocol}//${parsed.hostname}/robots.txt`, {
      timeout: 10000, headers: { "User-Agent": userAgent }, validateStatus: () => true
    });
    if (res.status >= 400) return null;
    return robotsParser(`${parsed.protocol}//${parsed.hostname}/robots.txt`, res.data);
  } catch { return null; }
}

async function getSitemapUrls(startUrl) {
  const urls = new Set();
  try {
    const parsed = new URL(startUrl);
    const sitemaps = [`${parsed.protocol}//${parsed.hostname}/sitemap.xml`, `${parsed.protocol}//${parsed.hostname}/sitemap_index.xml`];
    for (const sitemapUrl of sitemaps) {
      try {
        const res = await axios.get(sitemapUrl, { timeout: 10000, headers: { "User-Agent": userAgent }, validateStatus: () => true });
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
  return /\/(team|people|our-team|our_team|leadership|leaders|partners|partner|management|founders|founder|about|about-us|about_us|who-we-are|whoweare|investors|investor|advisors|advisor|staff|portfolio|companies|investments|principals|associates|directors|our-people|the-team|meet-the-team|network|members)/.test(u);
}

function getInvestorScore(url, text = "") {
  const content = `${url} ${text}`.toLowerCase();
  const strong = ["venture capital","private equity","family office","angel investor","angel investors","investment firm","investment fund","venture fund","portfolio companies","portfolio company","investment partner","managing partner","general partner"];
  const medium = ["investor","investors","startup investment","startup investing","seed investment","seed funding","series a investment","series b investment","funding round","investment portfolio"];
  let score = 0;
  for (const k of strong) if (content.includes(k)) score += 3;
  for (const k of medium) if (content.includes(k)) score += 1;
  return score;
}

function isJunkPage(url, text) {
  const u = url.toLowerCase();
  if (/\/(login|signin|signup|register|cart|checkout)/.test(u)) return true;
  const junkPaths = ["/privacy","/terms","/legal","/cookies","/careers","/jobs","/disclaimer","/gdpr"];
  if (junkPaths.some(p => u.includes(p))) return true;
  if (text.length < 200) return true;
  return false;
}

async function crawlSite(startUrl, allRecords) {
  let startDomain;
  try { startDomain = new URL(startUrl).hostname; } catch { return; }

  let robots = await getRobots(startUrl);
  if (!robots) robots = { isAllowed: () => true };
  if (!robots.isAllowed(startUrl, userAgent)) { console.log(`Blocked: ${startUrl}`); return; }

  const visited = new Set();
  const queue = [startUrl];
  console.log(`Starting: ${startUrl}`);

  try {
    const sitemapUrls = await getSitemapUrls(startUrl);
    if (sitemapUrls.length > 0) {
      const interesting = sitemapUrls.filter(u => /\/(team|about|people|portfolio|companies|investments|contact|contact-us|partners|leadership|founders|principals|advisors|network|members)/i.test(u));
      queue.push(...interesting.slice(0, 40));
      console.log(`  Sitemap: ${sitemapUrls.length} URLs, ${interesting.length} relevant added`);
    }
  } catch {}

  while (queue.length > 0 && visited.size < maxPagesPerSite) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    if (!robots.isAllowed(url, userAgent)) continue;
    visited.add(url);

    try {
      const res = await axios.get(url, { timeout: 10000, headers: { "User-Agent": userAgent }, maxContentLength: 5 * 1024 * 1024 });
      const $ = cheerio.load(res.data);
      const text = cleanText($("body").text());
      if (isJunkPage(url, text)) continue;

      const score = getInvestorScore(url, text);
      if (score >= 2) {
        let records;
        if (isTeamPage(url)) records = extractMultipleInvestors($, url);
        else records = [extractInvestorData($, url)];

        let kept = 0;
        for (const record of records) {
          const hasName = record.name && record.name.length > 2;
          const hasCompany = record.company_name && record.company_name.length > 2;
          const hasContact = (record.emails && record.emails.length > 0) || (record.linkedin && record.linkedin.length > 0);
          if ((hasName && hasContact) || (hasCompany && !hasName)) {
            record.investor_score = score;
            record.status_code = res.status;
            allRecords.push(record);
            kept++;
          }
        }
        if (kept > 0) console.log(`  KEPT (${kept}): ${url}`);
      }

      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        try {
          const abs = new URL(href, url);
          if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
          if (abs.hostname !== startDomain) return;
          const clean = cleanUrl(abs.href);
          if (clean && !visited.has(clean) && !queue.includes(clean)) {
            if (robots.isAllowed(clean, userAgent)) queue.push(clean);
          }
        } catch {}
      });
    } catch (err) { console.log(`  Failed ${url}: ${err.message}`); }
  }
  console.log(`Done ${startDomain} — pages: ${visited.size}`);
}

async function crawlSites(urls) {
  const allRecords = [];
  for (const url of urls) { try { await crawlSite(url, allRecords); } catch { console.log(`Site failed: ${url}`); } }
  return allRecords;
}

if (require.main === module) {
  const cliUrl = process.argv[2];
  let seeds;
  if (cliUrl) seeds = [cliUrl.trim()];
  else if (fs.existsSync("seeds.txt")) seeds = fs.readFileSync("seeds.txt", "utf8").split(/\r?\n/).map(u => u.trim()).filter(u => u && !u.startsWith("#"));
  else { console.log("No URL."); process.exit(1); }
  crawlSites(seeds).then(records => {
    fs.writeFileSync("crawl-results.json", JSON.stringify(records, null, 2));
    console.log(`\nTotal: ${records.length}`);
  });
}

module.exports = { crawlSites };