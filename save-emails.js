require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { extractFromText } = require('./extract/multi-field-extractor');
const { resolveCompany } = require('./extract/entity-resolver');
const enricher = require('./extract/enricher');
const indexer = require('./search/indexer');

const SEED_FILE = path.join(__dirname, 'data', 'seed-domains.json');
const MAX_DOMAINS = parseInt(process.env.MAX_DOMAINS) || 83;
const COMMON_PATHS = ['', '/contact', '/team', '/about'];

const SKIP_DOMAINS = new Set([
  'sequoiacap.com', 'a16z.com', 'accel.com', 'kleinerperkins.com',
  'foundersfund.com', 'benchmark.com', 'insightpartners.com',
  'tiger-global.com', 'greylock.com', 'gv.com', 'indexventures.com',
  'lightspeed.com', 'generalatlantic.com', 'nea.com', 'bvp.com',
  'redpoint.com', 'sparkcapital.com', 'svangel.com', 'khoslaventures.com',
  'matrix.vc', 'balderton.com', 'atomico.com', 'eurazeo.com',
  'targetglobal.vc', 'hvcapital.com', 'speedinvest.com', 'lakestar.com',
]);

function loadSeeds() {
  const raw = fs.readFileSync(SEED_FILE, 'utf-8');
  const cleaned = '[' + raw.replace(/^\s*\[/, '').replace(/\]\s*$/, '') + ']';
  try { return JSON.parse(cleaned); }
  catch (err) {
    const lines = raw.split('\n').filter((l) => l.trim().startsWith('{'));
    return lines.map((l) => {
      try { return JSON.parse(l.replace(/,\s*$/, '')); } catch (e) { return null; }
    }).filter(Boolean);
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,6}$/.test(lower)) return false;
  if (/\.(mp|webm|mp4|mov|png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(lower)) return false;
  if (/@2x|@3x|\d+x\./i.test(lower)) return false;
  const domain = lower.split('@')[1];
  const badDomains = ['example.com', 'example.org', 'yourdomain.com', 'domain.com', 'email.com'];
  if (badDomains.includes(domain)) return false;
  if (lower.includes('u00') || lower.includes('&#')) return false;
  return true;
}

async function crawlAndSave(browser, seed) {
  const domain = seed.domain;
  const baseUrl = `https://${domain}`;
  const allEmails = new Set();
  let bestExtracted = {};
  let bestHtml = '';
  let bestText = '';

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    for (const p of COMMON_PATHS) {
      const url = `${baseUrl}${p}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 6000 });
        await page.waitForTimeout(300);

        const html = await page.content();
        const text = await page.evaluate(() => document.body.innerText);

        const extracted = extractFromText(text);
        const mailtoEmails = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
          return links.map((a) => {
            try { return decodeURIComponent(a.href.replace('mailto:', '').split('?')[0]).toLowerCase().trim(); }
            catch (e) { return a.href.replace('mailto:', '').split('?')[0].toLowerCase().trim(); }
          });
        });
        const htmlEmails = (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g) || []).map((e) => e.toLowerCase().trim());

        [...extracted.emails, ...mailtoEmails, ...htmlEmails].forEach((e) => {
          if (isValidEmail(e)) allEmails.add(e);
        });

        if (!bestExtracted.name && extracted.name) bestExtracted.name = extracted.name;
        if (!bestExtracted.title && extracted.title) bestExtracted.title = extracted.title;
        if (!bestHtml) bestHtml = html;
        if (!bestText) bestText = text;

        if (allEmails.size >= 3) break;
      } catch (err) {}
    }
  } finally {
    try { await page.close(); } catch (e) {}
    try { await context.close(); } catch (e) {}
  }

  if (allEmails.size === 0) return null;

  const enrichment = enricher.enrichCompany(bestHtml, bestText, {
    name: resolveCompany(domain.split('.')[0]),
    domain,
    location: seed.hq_city || null,
  });

  const contacts = [...allEmails].map((email) => ({
    email,
    name: bestExtracted.name || null,
    title: bestExtracted.title || null,
    confidence: 75,
    grade: 'B',
    verified: false,
    source: 'seed-crawl',
    sourceUrl: `https://${seed.domain}`,
    company: {
      name: enrichment.name,
      domain: seed.domain,
      industry: enrichment.industry,
      size: enrichment.size,
      location: seed.hq_city || null,
      techStack: enrichment.techStack,
    },
  }));

  await indexer.bulkIndexContacts(contacts, { generateEmbeddings: false });
  return contacts.length;
}

async function main() {
  console.log('=== SAVE EMAILS TO ELASTICSEARCH ===\n');

  const seeds = loadSeeds();
  const slice = seeds.slice(0, MAX_DOMAINS);
  const candidates = slice.filter((s) => !SKIP_DOMAINS.has(s.domain));

  console.log(`Processing ${candidates.length} domains...\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let totalContacts = 0;
  let domainsWithEmails = 0;

  for (let i = 0; i < candidates.length; i++) {
    const seed = candidates[i];
    const start = Date.now();
    process.stdout.write(`[${i + 1}/${candidates.length}] ${seed.domain.padEnd(28)} `);

    try {
      const count = await Promise.race([
        crawlAndSave(browser, seed),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
      ]);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (count === null) {
        console.log(`0 emails (${elapsed}s)`);
      } else {
        domainsWithEmails++;
        totalContacts += count;
        console.log(`${count} emails saved (${elapsed}s)`);
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`TIMEOUT (${elapsed}s)`);
    }
  }

  try { await browser.close(); } catch (e) {}

  console.log(`\n=== SUMMARY ===`);
  console.log(`Domains processed:   ${candidates.length}`);
  console.log(`Domains with emails: ${domainsWithEmails}`);
  console.log(`Contacts saved:      ${totalContacts}`);
  console.log(`\n✅ Check dashboard: http://localhost:3000`);
}

main().catch(console.error);