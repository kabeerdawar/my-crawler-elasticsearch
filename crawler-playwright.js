// crawler-playwright.js
// Playwright-based crawler for JS-heavy government sites
// Respects robots.txt + uses same extractor as main crawler
// 🎯 Includes Gemini AI extraction fallback
// 🛡️ FIX: Dialog handler + safe cleanup to prevent server crashes

const { chromium } = require("playwright");
const cheerio = require("cheerio");
const axios = require("axios");
const robotsParser = require("robots-parser");
const { extractInvestorData, extractMultipleInvestors, extractPortfolioCompanies } = require("./extractor");
const ai = require("./ai-helper");

const maxPagesPerSite = 40;
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const robotsUserAgent = "InvestorCrawler/1.0";

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// ---------- ROBOTS.TXT ----------
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
  return /\/(team|people|our-team|our_team|leadership|leaders|partners|partner|management|founders|founder|about|about-us|about_us|who-we-are|whoweare|investors|investor|advisors|advisor|staff|principals|associates|directors|our-people|the-team|meet-the-team|network|members)/.test(u);
}

function isPortfolioPage(url) {
  const u = url.toLowerCase();
  return /\/(portfolio|companies|investments|backed|our-companies|funded|startups)/.test(u);
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

// ---------- CRAWL SITE WITH PLAYWRIGHT ----------
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
    let page;

    try {
      page = await context.newPage();

      // ============================================================
      // 🛡️ CRITICAL FIX: Attach dialog handler immediately after page creation
      // This prevents "Page.handleJavaScriptDialog: Not attached to an active page" crash
      // ============================================================
      page.on("dialog", async (dialog) => {
        try {
          console.log(`  [Popup] ${dialog.type()} on ${url} — dismissing`);
          await dialog.dismiss();
        } catch (err) {
          // Dialog may already be gone (page navigated/closed). Ignore silently.
        }
      });

      // Also catch page crashes to prevent unhandled errors
      page.on("crash", () => {
        console.log(`  [Crash] Page crashed: ${url}`);
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1000);

      // Scroll to trigger lazy content
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
        continue; // finally block will close the page
      }

      const score = getInvestorScore(url, text);

      if (score >= 2) {
        let records;
        if (isPortfolioPage(url) && !isTeamPage(url)) {
          records = extractPortfolioCompanies($, url);
          if (records.length === 0) records = [extractInvestorData($, url)];
        } else if (isTeamPage(url)) {
          records = extractMultipleInvestors($, url);
        } else {
          records = [extractInvestorData($, url)];
        }

        // 🎯 GEMINI AI EXTRACTION — if regex found nothing useful
        const hasUsefulData = records.some(r =>
          (r.emails && r.emails.length > 0) || (r.linkedin && r.linkedin.length > 0)
        );

        if (!hasUsefulData && text.length > 500 && ai.aiStatus().gemini) {
          try {
            console.log(`  🤖 Gemini extracting: ${url}`);
            const aiRecord = await ai.aiExtractInvestor(text, url);
            if (aiRecord && (aiRecord.name || aiRecord.company_name || (aiRecord.emails && aiRecord.emails.length))) {
              records = [{
                name: aiRecord.name || "",
                company_name: aiRecord.company_name || "",
                investor_type: aiRecord.investor_type || "",
                region: aiRecord.region || "",
                hq_city: aiRecord.hq_city || null,
                sectors: aiRecord.sectors || [],
                tags: aiRecord.tags || [],
                portfolio: aiRecord.portfolio || [],
                thesis: aiRecord.thesis || "",
                emails: aiRecord.emails || [],
                email_details: (aiRecord.emails || []).map(e => ({ email: e, source: "gemini", weight: 8, score: 6 })),
                email_score: 6,
                linkedin: aiRecord.linkedin || [],
                linkedin_details: (aiRecord.linkedin || []).map(u => ({ url: u, score: 5 })),
                linkedin_score: 5,
                phones: [],
                latest_year: null,
                is_fresh: false,
                description: aiRecord.description || "",
                website: url,
                source_url: url,
                investor_score: score,
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

      // Discover internal links
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

    } catch (err) {
      if (!err.message.includes("Download is starting")) {
        console.log(`  Failed ${url}: ${err.message}`);
      }
    } finally {
      // ============================================================
      // 🛡️ CRITICAL FIX: Always close page in finally, safely
      // This prevents "Not attached to an active page" errors from crashing the server
      // ============================================================
      if (page) {
        try {
          await page.close({ runBeforeUnload: false });
        } catch (closeErr) {
          // Page may already be closed. Ignore.
        }
      }
    }
  }

  try {
    await context.close();
  } catch {}
  console.log(`Done (Playwright) ${startDomain} — pages: ${visited.size}`);
}

async function crawlSitesWithPlaywright(urls) {
  const allRecords = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    for (const url of urls) {
      try {
        await crawlSiteWithPlaywright(url, allRecords, browser);
      } catch (err) {
        console.log(`Site failed: ${url} — ${err.message}`);
      }
    }
  } catch (fatalErr) {
    console.error("Fatal Playwright error:", fatalErr.message);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error("Browser close error:", e.message);
      }
    }
  }

  return allRecords;
}

module.exports = { crawlSitesWithPlaywright };