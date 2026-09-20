// crawler-playwright.js
// Playwright-based crawler for JS-heavy government sites

const { chromium } = require("playwright");
const cheerio = require("cheerio");
const axios = require("axios");
const robotsParser = require("robots-parser");
const { extractInvestorData, extractMultipleInvestors } = require("./extractor");

const maxPagesPerSite = 40;
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const robotsUserAgent = "InvestorCrawler/1.0";

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

async function getRobots(startUrl) {
  try {
    const parsed = new URL(startUrl);
    const robotsUrl = `${parsed.protocol}//${parsed.hostname}/robots.txt`;
    const res = await axios.get(robotsUrl, {
      timeout: 10000,
      headers: { "User-Agent": robotsUserAgent },
      validateStatus: () => true
    });
    if (res.status >= 400) return null;
    return robotsParser(robotsUrl, res.data);
  } catch { return null; }
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

function isNonHtmlFile(pathname) {
  return /\.(pdf|docx?|xlsx?|pptx?|zip|rar|jpg|jpeg|png|gif|svg|mp4|mp3|avi|mov|webp|csv|json|xml)$/i.test(pathname);
}

async function crawlSiteWithPlaywright(startUrl, allRecords, browser) {
  let startDomain;
  try { startDomain = new URL(startUrl).hostname; }
  catch { return; }

  let robots = await getRobots(startUrl);
  if (!robots) {
    console.log(`  No robots.txt — crawling anyway`);
    robots = { isAllowed: () => true };
  }
  if (!robots.isAllowed(startUrl, robotsUserAgent)) {
    console.log(`  Blocked by robots.txt: ${startUrl}`);
    return;
  }

  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1366, height: 768 }
  });

  const visited = new Set();
  const queue = [startUrl];
  console.log(`Starting (Playwright): ${startUrl}`);

  while (queue.length > 0 && visited.size < maxPagesPerSite) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;

    if (!robots.isAllowed(url, robotsUserAgent)) {
      console.log(`  Skipped (robots.txt): ${url}`);
      continue;
    }

    visited.add(url);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1000);

      try {
        await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight / 2); });
        await page.waitForTimeout(500);
        await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
        await page.waitForTimeout(1000);
      } catch {}

      const html = await page.content();
      const $ = cheerio.load(html);
      const text = cleanText($("body").text());

      if (isJunkPage(url, text)) {
        await page.close();
        continue;
      }

      const score = getInvestorScore(url, text);

      if (score >= 2) {
        let records;
        if (isTeamPage(url)) {
          records = extractMultipleInvestors($, url);
        } else {
          records = [extractInvestorData($, url)];
        }

        let kept = 0;
        for (const record of records) {
          const hasName = record.name && record.name.length > 2;
          const hasCompany = record.company_name && record.company_name.length > 2;
          const hasContact = (record.emails && record.emails.length > 0) || (record.linkedin && record.linkedin.length > 0);

          const isPersonRecord = hasName && hasContact;
          const isFirmRecord = hasCompany && !hasName;

          if (isPersonRecord || isFirmRecord) {
            record.investor_score = score;
            record.crawl_type = (record.crawl_type || "general_page") + "_playwright";
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
          if (isNonHtmlFile(abs.pathname)) return;
          abs.hash = "";
          const clean = abs.href;
          if (clean && !visited.has(clean) && !queue.includes(clean)) {
            if (robots.isAllowed(clean, robotsUserAgent)) {
              queue.push(clean);
            }
          }
        } catch {}
      });

      await page.close();
    } catch (err) {
      if (!err.message.includes("Download is starting")) {
        console.log(`  Failed ${url}: ${err.message}`);
      }
      await page.close().catch(() => {});
    }
  }

  await context.close();
  console.log(`Done (Playwright) ${startDomain} — pages: ${visited.size}`);
}

async function crawlSitesWithPlaywright(urls) {
  const allRecords = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const url of urls) {
      try {
        await crawlSiteWithPlaywright(url, allRecords, browser);
      } catch (err) {
        console.log(`Site failed: ${url} — ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  return allRecords;
}

module.exports = { crawlSitesWithPlaywright };