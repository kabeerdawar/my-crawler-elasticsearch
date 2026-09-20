// scheduler.js
const fs = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, "search-history.json");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let crawlerFunction = null;

function setCrawler(fn) {
  crawlerFunction = fn;
}

async function runScheduledCrawl() {
  if (!crawlerFunction) return [];
  if (!fs.existsSync(HISTORY_FILE)) return [];

  const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  const now = Date.now();
  const rerun = [];

  for (const entry of history.slice(0, 10)) {
    const lastRun = new Date(entry.timestamp).getTime();
    if (now - lastRun >= WEEK_MS) rerun.push(entry);
  }

  if (rerun.length === 0) {
    console.log("[scheduler] No queries need re-crawl");
    return [];
  }

  console.log(`[scheduler] Re-crawling ${rerun.length} queries...`);
  for (const entry of rerun) {
    try {
      await crawlerFunction(entry.urls, entry.query);
      console.log(`[scheduler] Re-crawled: ${entry.query}`);
    } catch (err) {
      console.error(`[scheduler] Failed: ${entry.query}`, err.message);
    }
  }
  return rerun;
}

function startScheduler() {
  setInterval(() => {
    runScheduledCrawl().catch(err => console.error("[scheduler] Error:", err.message));
  }, 24 * 60 * 60 * 1000);
  console.log("[scheduler] Weekly re-crawl scheduler started");
}

module.exports = { startScheduler, runScheduledCrawl, setCrawler };