require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { client, CONTACTS_INDEX } = require('./search/es-client');
const adv = require('./search/advanced-search');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DEBUG LOGGER ====================
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ==================== LOAD SEEDS ====================
const SEED_FILE = path.join(__dirname, 'data', 'seed-domains.json');
let seedDomains = [];

function loadSeeds() {
  try {
    const raw = fs.readFileSync(SEED_FILE, 'utf-8');
    const cleaned = '[' + raw.replace(/^\s*\[/, '').replace(/\]\s*$/, '') + ']';
    seedDomains = JSON.parse(cleaned);
    console.log(`Loaded ${seedDomains.length} seed domains`);
  } catch (err) {
    console.error('Seed load failed:', err.message);
  }
}
loadSeeds();

// ==================== DDG ====================
async function searchDDG(query) {
  try {
    const { search } = require('duck-duck-scrape');
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    const results = await search(query, { safeSearch: 0 });
    return (results.results || []).slice(0, 15).map(r => ({
      title: r.title, url: r.url,
      domain: extractDomain(r.url),
      description: r.description || '',
      source: 'ddg',
    }));
  } catch (err) {
    console.error('[DDG]', err.message);
    return [];
  }
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
}

// ==================== TIMEOUT ====================
function withTimeout(promise, ms, label = 'op') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

// ==================== CRAWLER ====================
async function crawlUrlsInBackground(urls) {
  const { chromium } = require('playwright');
  const { extractFromText } = require('./extract/multi-field-extractor');
  const { resolveCompany } = require('./extract/entity-resolver');
  const enricher = require('./extract/enricher');
  const indexer = require('./search/indexer');

  const COMMON_PATHS = ['', '/contact', '/team', '/about'];
  const DOMAIN_TIMEOUT = 25000;
  const PAGE_TIMEOUT = 5000;

  function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const lower = email.toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,6}$/.test(lower)) return false;
    const domain = lower.split('@')[1];
    const parts = domain.split('.');
    if (parts.length < 2 || parts.length > 3) return false;
    const tld = parts[parts.length - 1];
    const validTLDs = ['com','org','net','io','co','ai','vc','in','uk','de','fr','br','us','eu','app','dev','xyz'];
    if (!validTLDs.includes(tld)) return false;
    if (domain.endsWith('.for') || domain.endsWith('.we') || domain.endsWith('.ian')) return false;
    if (/\.(mp|webm|mp4|mov|png|jpg|jpeg|gif|svg|webp|ico|css|js)$/i.test(lower)) return false;
    if (/@2x|@3x|\d+x\./i.test(lower)) return false;
    if (/\b(logo|favicon|sprite|icon|banner|hero|image)\b/i.test(lower)) return false;
    if (/\d{4,}/.test(lower)) return false;
    const local = lower.split('@')[0];
    if (local.length > 30 || !/[aeiou]/i.test(local)) return false;
    return true;
  }

  let browser = null;

  async function processOneDomain(rawUrl) {
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const domain = new URL(url).hostname.replace(/^www\./, '');
    console.log(`  [crawl] ${domain}`);

    const allEmails = new Set();
    const allPhones = new Set();
    let bestHtml = '';
    let bestText = '';
    let bestExtracted = {};

    let context = null, page = null;

    try {
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      });
      page = await context.newPage();

      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(type)) return route.abort();
        return route.continue();
      });

      for (const p of COMMON_PATHS) {
        try {
          await withTimeout(
            page.goto(`${url.replace(/\/$/, '')}${p}`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }),
            PAGE_TIMEOUT + 2000,
            `goto ${p}`
          );
          await page.waitForTimeout(300);

          const html = await withTimeout(page.content(), 3000, 'content');
          const text = await withTimeout(page.evaluate(() => document.body.innerText), 3000, 'evaluate');

          const extracted = extractFromText(text);

          let mailtoEmails = [];
          try {
            mailtoEmails = await withTimeout(
              page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
                return links.map((a) => {
                  try { return decodeURIComponent(a.href.replace('mailto:', '').split('?')[0]).toLowerCase().trim(); }
                  catch (e) { return a.href.replace('mailto:', '').split('?')[0].toLowerCase().trim(); }
                });
              }),
              2000, 'mailto'
            );
          } catch (e) { mailtoEmails = []; }

          const htmlEmails = (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g) || []).map((e) => e.toLowerCase().trim());

          [...extracted.emails, ...mailtoEmails, ...htmlEmails].forEach((e) => {
            if (isValidEmail(e)) allEmails.add(e);
          });
          (extracted.phones || []).forEach((ph) => allPhones.add(ph));

          if (!bestExtracted.name && extracted.name) bestExtracted.name = extracted.name;
          if (!bestExtracted.title && extracted.title) bestExtracted.title = extracted.title;
          if (!bestHtml) bestHtml = html;
          if (!bestText) bestText = text;

          if (allEmails.size >= 3) break;
        } catch (err) {}
      }
    } catch (err) {
      console.log(`    → error: ${err.message.slice(0, 50)}`);
    } finally {
      try { if (page) await page.close(); } catch (e) {}
      try { if (context) await context.close(); } catch (e) {}
    }

    if (allEmails.size === 0) {
      console.log(`    → 0 emails`);
      return;
    }

    const enrichment = enricher.enrichCompany(bestHtml, bestText, {
      name: resolveCompany(domain.split('.')[0]),
      domain,
      location: null,
    });

    const contacts = [...allEmails].map((email) => ({
      email,
      name: bestExtracted.name || null,
      title: bestExtracted.title || null,
      phone: [...allPhones][0] || null,
      confidence: 75,
      grade: 'B',
      verified: false,
      source: 'crawl-selected',
      sourceUrl: url,
      company: {
        name: enrichment.name,
        domain,
        industry: enrichment.industry,
        size: enrichment.size,
        location: enrichment.location || null,
        techStack: enrichment.techStack,
      },
    }));

    await indexer.bulkIndexContacts(contacts, { generateEmbeddings: false });
    console.log(`    → ${contacts.length} emails saved`);
  }

  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const url of urls) {
      try {
        await withTimeout(processOneDomain(url), DOMAIN_TIMEOUT, `domain ${url}`);
      } catch (err) {
        console.log(`    → HARD TIMEOUT (skipping ${url})`);
      }
    }
  } catch (err) {
    console.error('[crawl error]', err.message);
  } finally {
    if (browser) try { await browser.close(); } catch (e) {}
  }
}

// ==================== QUEUE ====================
let crawlQueue = [];
let crawlRunning = false;

async function processCrawlQueue() {
  while (crawlQueue.length > 0) {
    const batch = crawlQueue.splice(0, 5);
    try { await crawlUrlsInBackground(batch); } catch (err) { console.error('[queue]', err.message); }
  }
  crawlRunning = false;
  console.log('[queue] All crawl jobs done');
}

async function startCrawler(url) {
  crawlQueue.push(url);
  if (!crawlRunning) { crawlRunning = true; processCrawlQueue(); }
  return true;
}

// ==================== TRANSFORM ====================
function transformRecord(c) {
  const company = c.company || {};
  let investorType = 'Investor';
  const dom = (company.domain || '').toLowerCase();
  if (dom.includes('capital') || dom.includes('vc') || dom.includes('ventures')) investorType = 'VC';
  else if (dom.includes('angel')) investorType = 'Angel';

  let region = company.location || '(unknown)';
  if (region.toLowerCase().includes('delhi')) region = 'Delhi';
  else if (region.toLowerCase().includes('mumbai')) region = 'Mumbai';
  else if (region.toLowerCase().includes('bangalore') || region.toLowerCase().includes('bengaluru')) region = 'Bangalore';

  return {
    name: c.name || '(unknown)',
    company: company.name || company.domain || '(unknown)',
    investorType, region,
    sectors: company.industry ? [company.industry] : [],
    tags: company.techStack ? company.techStack.slice(0, 3) : [],
    emails: [c.email].filter(Boolean),
    linkedin: c.linkedin || null,
    phones: c.phone ? [c.phone] : [],
    investorScore: Math.round((c.confidence || 0) * 0.5),
    emailScore: c.verified ? Math.round(c.confidence || 0) : Math.round((c.confidence || 0) * 0.6),
    linkedinScore: c.linkedin ? 5 : 0,
    confidence: c.confidence || 0,
    grade: c.grade || 'F',
    source: c.sourceUrl || `https://${company.domain || 'unknown'}`,
    verified: c.verified || false,
    domain: company.domain || '',
  };
}

function matchSeeds(query) {
  if (!query) return seedDomains.slice(0, 20);
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['the','and','for','with','in','of','on','at','investors','investor'].includes(w));
  return seedDomains.filter(s => {
    const text = [(s.domain||''), (s.hq_city||''), (s.region||''), ((s.cities||[]).join(' '))].join(' ').toLowerCase();
    return words.some(w => text.includes(w));
  });
}

// ==================== STATS ====================
async function getStats() {
  try {
    const countResult = await client.count({ index: CONTACTS_INDEX });
    const total = countResult.count;
    let verified = 0;
    try {
      const v = await client.count({ index: CONTACTS_INDEX, body: { query: { term: { verified: true } } } });
      verified = v.count;
    } catch (e) {}
    let avgConf = 0, byGrade = [];
    try {
      const agg = await client.search({
        index: CONTACTS_INDEX, size: 0,
        body: { aggs: { avg_c: { avg: { field: 'confidence' } }, grades: { terms: { field: 'grade' } } } },
      });
      avgConf = agg.aggregations.avg_c.value || 0;
      byGrade = agg.aggregations.grades.buckets || [];
    } catch (e) {}
    return { total, totalContacts: total, totalVerified: verified, verified, avgConfidence: avgConf, highConfidence: verified, byGrade, emailsFound: total, newCrawl: total, updatedExisting: 0, seedCount: seedDomains.length };
  } catch (err) {
    return { total: 0, totalVerified: 0, avgConfidence: 0, byGrade: [], seedCount: seedDomains.length };
  }
}

app.get('/api/stats', async (req, res) => res.json(await getStats()));
app.get('/stats', async (req, res) => res.json(await getStats()));

// ==================== RECORDS ====================
async function getRecords(limit = 200) {
  try {
    const result = await client.search({
      index: CONTACTS_INDEX, size: limit,
      body: { query: { match_all: {} }, sort: [{ confidence: 'desc' }] },
    });
    return result.hits.hits.map(h => transformRecord(h._source));
  } catch (err) { return []; }
}

app.get('/records', async (req, res) => {
  const records = await getRecords(200);
  res.json({ records, results: records, count: records.length });
});

app.get('/api/records', async (req, res) => {
  const records = await getRecords(200);
  res.json({ records, results: records, count: records.length });
});

// ==================== DISCOVER ====================
app.post('/discover', async (req, res) => {
  try {
    const body = req.body || {};
    const q = (body.query || body.search || body.q || '').trim();
    console.log(`[discover] "${q}"`);

    const matchedSeeds = matchSeeds(q);
    console.log(`  Seeds: ${matchedSeeds.length}`);

    let ddgResults = [];
    if (q) {
      ddgResults = await searchDDG(q + ' venture capital contact email');
      console.log(`  DDG: ${ddgResults.length}`);
    }

    let records = [];
    if (q) {
      try {
        const results = await adv.rankedSearch(q, { size: 100 });
        records = results.map(transformRecord);
      } catch (e) { records = await getRecords(100); }
    } else {
      records = await getRecords(100);
    }

    const seedSources = matchedSeeds.map(s => ({
      domain: s.domain, url: `https://${s.domain}`,
      city: s.hq_city || '', hq_city: s.hq_city || '',
      region: s.region || '', cities: s.cities || [],
      source: 'seed', type: 'VC', name: s.domain, title: s.domain, label: s.domain,
      description: `${s.hq_city || ''} ${s.region || ''}`.trim(),
      score: 5, confidence: 75, emails: [], totalEmails: 0, emailCount: 0,
      sector: 'Venture Capital', website: `https://${s.domain}`,
    }));

    const ddgSources = ddgResults.map(d => ({
      domain: d.domain, url: d.url, title: d.title || d.domain,
      description: d.description || '', name: d.domain, label: d.domain,
      hq_city: '', city: '', region: '', cities: [],
      source: 'ddg', type: 'VC', score: 3, confidence: 60,
      emails: [], totalEmails: 0, emailCount: 0,
      sector: 'Venture Capital', website: d.url,
    }));

    res.json({
      success: true, query: q,
      seed: matchedSeeds.length, ddg: ddgResults.length,
      totalSources: matchedSeeds.length + ddgResults.length,
      sources: [...seedSources, ...ddgSources],
      records, results: records, count: records.length,
    });
  } catch (err) {
    console.error('[discover]', err);
    res.status(500).json({ success: false, error: err.message, records: [], sources: [], totalSources: 0 });
  }
});

app.get('/discover', async (req, res) => {
  const q = req.query.q || req.query.query || '';
  const matchedSeeds = matchSeeds(q);
  const records = await getRecords(100);
  const seedSources = matchedSeeds.map(s => ({
    domain: s.domain, url: `https://${s.domain}`,
    city: s.hq_city || '', hq_city: s.hq_city || '',
    region: s.region || '', cities: s.cities || [],
    source: 'seed', type: 'VC', name: s.domain, title: s.domain, label: s.domain,
    description: `${s.hq_city || ''} ${s.region || ''}`.trim(),
    score: 5, confidence: 75, emails: [], totalEmails: 0, emailCount: 0,
    sector: 'Venture Capital', website: `https://${s.domain}`,
  }));
  res.json({
    success: true, query: q,
    seed: matchedSeeds.length, ddg: 0,
    totalSources: matchedSeeds.length,
    sources: seedSources,
    records, results: records, count: records.length,
  });
});

// ==================== CRAWL ENDPOINTS ====================
function extractUrls(body) {
  const urls = [];
  const candidates = body.domains || body.sources || body.urls || body.selected || [];
  for (const d of candidates) {
    if (typeof d === 'string') urls.push(d.startsWith('http') ? d : `https://${d}`);
    else if (d && d.url) urls.push(d.url);
    else if (d && d.domain) urls.push(`https://${d.domain}`);
  }
  if (body.url) urls.push(body.url.startsWith('http') ? body.url : `https://${body.url}`);
  return [...new Set(urls)];
}

const crawlEndpoints = ['/crawl','/crawl-selected','/crawl-selected-sources','/crawlSelected','/crawl-bulk','/crawl-urls','/crawl_urls','/crawlSources','/crawl-sources'];

for (const endpoint of crawlEndpoints) {
  app.post(endpoint, async (req, res) => {
    try {
      const body = req.body || {};
      const urls = extractUrls(body);
      console.log(`[${endpoint}] ${urls.length} urls`);
      if (!urls.length) return res.json({ success: false, error: 'no urls', records: [], started: 0 });

      let started = 0;
      for (const url of urls) {
        try { await startCrawler(url); started++; } catch (e) {}
      }
      res.json({ success: true, started, total: urls.length, records: [], message: `${started} crawlers queued.` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message, records: [], started: 0 });
    }
  });
}

app.post('/crawl/:anything', async (req, res) => {
  try {
    const body = req.body || {};
    const urls = extractUrls(body);
    if (!urls.length) return res.json({ success: false, error: 'no urls', records: [], started: 0 });
    let started = 0;
    for (const url of urls) { try { await startCrawler(url); started++; } catch (e) {} }
    res.json({ success: true, started, total: urls.length, records: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, records: [], started: 0 });
  }
});

app.post('/reset', async (req, res) => {
  try {
    await client.deleteByQuery({ index: CONTACTS_INDEX, body: { query: { match_all: {} } }, refresh: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== API SEARCH ====================
app.get('/api/search', async (req, res) => {
  try {
    const { q, size = 50 } = req.query;
    let records;
    if (q && q.trim()) {
      const results = await adv.rankedSearch(q, { size: parseInt(size) });
      records = results.map(transformRecord);
    } else {
      records = await getRecords(parseInt(size));
    }
    res.json({ count: records.length, results: records, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== DASHBOARD ====================
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`   ${seedDomains.length} seed domains loaded`);
  console.log(`   Debug logger: ON`);
  console.log(`   Watch for [REQ] lines below\n`);
});