const { chromium } = require('playwright');
const { waterfallVerify } = require('../verify/waterfall-verifier');
const { extractFromText } = require('../extract/multi-field-extractor');
const { resolveCompany } = require('../extract/entity-resolver');
const indexer = require('../search/indexer');

// Common email-related paths to check on each domain
const COMMON_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/team', '/company'];

function isCleanEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 100) return false;

  const lower = email.toLowerCase().trim();

  // Strict email pattern
  const strict = /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,6}$/;
  if (!strict.test(lower)) return false;

  const [local, domain] = lower.split('@');
  if (!local || !domain) return false;

  // Reject HTML entity artifacts (\u003e, &gt;, etc.)
  if (/u00[0-9a-f]{2}/i.test(lower)) return false;
  if (/&[a-z]+;/i.test(lower)) return false;

  // Reject image/video/media extensions in domain
  if (/\.(mp|webm|mp4|mov|png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf)$/i.test(domain)) return false;

  // Reject retina/size notation (@2x, @3x)
  if (/\d+x/i.test(domain)) return false;

  // Reject placeholder/example domains
  const badDomains = [
    'email.com', 'example.com', 'example.org', 'yourdomain.com',
    'domain.com', 'test.com', 'localhost', 'sentry.io', 'sentry-next.wixpress.com',
    'wixpress.com', 'godaddy.com', 'wordpress.com', 'squarespace.com',
  ];
  if (badDomains.includes(domain)) return false;

  // Reject local parts ending with .in / .co / .io (file extension trap)
  if (/\.(in|co|io|to|mp|webm)$/i.test(local)) return false;

  // Reject common placeholder local parts
  const badLocals = ['your-email', 'yourname', 'youremail', 'email', 'test', 'demo', 'sample'];
  if (badLocals.includes(local)) return false;

  // Reject no-reply (unless you specifically want them)
  if (local.startsWith('noreply') || local.startsWith('no-reply')) return false;

  // Reject excessively long local parts (usually junk)
  if (local.length > 40) return false;

  // Reject too many dots in local (junk)
  if ((local.match(/\./g) || []).length > 3) return false;

  return true;
}
/**
 * Crawl a single page and extract all possible emails
 */
async function crawlPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);

    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);

    // 1. Visible text extraction
    const extracted = extractFromText(text);

    // 2. mailto: links extraction
    const mailtoEmails = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
      return links.map((a) => {
        try {
          return decodeURIComponent(a.href.replace('mailto:', '').split('?')[0]).toLowerCase().trim();
        } catch (e) {
          return a.href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
        }
      });
    });

    // 3. HTML source regex
    const htmlEmails = (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g) || [])
      .map((e) => e.toLowerCase().trim());

    // 4. Obfuscated emails — "john [at] company [dot] com" style
    const obfuscated = text.match(/[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\)|&#64;|@)\s*[A-Za-z0-9.-]+\s*(?:\[dot\]|\(dot\)|&#46;|\.)\s*[A-Za-z]{2,}/gi) || [];
    const deobfuscated = obfuscated.map((e) =>
      e.replace(/\s*\[at\]\s*|\s*\(at\)\s*|&#64;|\s*@\s*/gi, '@')
       .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*|&#46;|\s*\.\s*/gi, '.')
       .toLowerCase()
    );

    // Merge all emails
    const allEmails = [...new Set([
      ...extracted.emails,
      ...mailtoEmails,
      ...htmlEmails,
      ...deobfuscated,
    ])].filter(isCleanEmail);

    return { extracted, emails: allEmails, html, text };
  } catch (err) {
    return { extracted: {}, emails: [], error: err.message };
  }
}

/**
 * Crawl a domain — multiple common paths, dedupe results
 */
async function crawlDomain(domain, options = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const allEmails = new Set();
  const allPhones = new Set();
  let bestExtracted = {};

  try {
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    const base = new URL(baseUrl);
    const domainName = base.hostname.replace(/^www\./, '');

    // Try each path
    for (const path of COMMON_PATHS) {
      const url = `${base.protocol}//${base.hostname}${path}`;
      console.log(`    Trying: ${url}`);

      const result = await crawlPage(page, url);
      if (result.emails.length > 0) {
        result.emails.forEach((e) => allEmails.add(e));
      }
      if (result.extracted.phones) {
        result.extracted.phones.forEach((p) => allPhones.add(p));
      }
      // Keep the best name/title (first one found)
      if (!bestExtracted.name && result.extracted.name) bestExtracted.name = result.extracted.name;
      if (!bestExtracted.title && result.extracted.title) bestExtracted.title = result.extracted.title;
      if (!bestExtracted.linkedin && result.extracted.linkedin) bestExtracted.linkedin = result.extracted.linkedin;

      // If we found good emails, we can stop early
      if (allEmails.size >= 3) break;
    }

    const company = {
      name: resolveCompany(domainName),
      domain: domainName,
      industry: null,
      size: null,
      location: null,
    };

    const contacts = [];
    for (const email of allEmails) {
      contacts.push({
        email,
        name: bestExtracted.name || null,
        title: bestExtracted.title || null,
        seniority: bestExtracted.seniority || null,
        department: bestExtracted.department || null,
        phone: [...allPhones][0] || null,
        linkedin: bestExtracted.linkedin || null,
        confidence: 0,
        grade: 'F',
        verified: false,
        source: 'crawler',
        sourceUrl: baseUrl,
        company,
      });
    }

    console.log(`    Found ${contacts.length} unique emails, ${allPhones.size} phones`);
    return { domain: domainName, contacts };
  } catch (err) {
    console.log(`    Error: ${err.message}`);
    return { domain, contacts: [], error: err.message };
  } finally {
    await browser.close();
  }
}

/**
 * Full pipeline: crawl → verify → index
 */
async function processDomain(domain, options = {}) {
  const startTime = Date.now();

  const crawlResult = await crawlDomain(domain, options);
  if (crawlResult.contacts.length === 0) {
    return { domain, contacts: [], indexed: 0, durationMs: Date.now() - startTime };
  }

  console.log(`    Verifying ${crawlResult.contacts.length} emails...`);
  const verified = [];
  for (const contact of crawlResult.contacts) {
    try {
      const v = await waterfallVerify(contact.email, {
        sourceType: 'company_website',
        hasSourceUrl: true,
        smtpTimeout: 15000,
        useApify: options.useApify !== false,
      });
      verified.push({
        ...contact,
        confidence: v.finalConfidence || v.confidence,
        grade: v.finalGrade || v.grade,
        verified: v.finalVerified || v.verified,
        verificationSource: v.verificationSource,
      });
    } catch (err) {
      verified.push(contact);
    }
  }

  let indexed = 0;
  if (options.index !== false && verified.length > 0) {
    try {
      const result = await indexer.bulkIndexContacts(verified, { generateEmbeddings: false });
      indexed = result.indexed;
      console.log(`    Indexed ${indexed} contacts to ES`);
    } catch (err) {
      console.log(`    Index error: ${err.message}`);
    }
  }

  return {
    domain: crawlResult.domain,
    contacts: verified,
    indexed,
    durationMs: Date.now() - startTime,
  };
}

async function processDomains(domains, options = {}) {
  const results = [];
  for (let i = 0; i < domains.length; i++) {
    console.log(`\n[${i + 1}/${domains.length}] ${domains[i]}`);
    const result = await processDomain(domains[i], options);
    results.push(result);
  }
  return results;
}

// Backwards compatibility
const processUrl = processDomain;
const processUrls = processDomains;

module.exports = { crawlDomain, processDomain, processDomains, processUrl, processUrls };