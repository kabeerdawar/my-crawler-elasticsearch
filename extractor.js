// extractor.js
// 🎯 Real emails + pattern generation + strict filtering

const { buildPatternEmails, detectPatternFromExisting } = require("./email-patterns");

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

// ---------- EMAIL VALIDATION ----------
const FILE_EXT_REGEX = /\.(png|jpe?g|gif|svg|webp|ico|bmp|tiff|css|js|json|xml|html?|pdf|zip|rar|woff2?|ttf|eot|mp[34]|avi|mov|wav)$/i;
const FILE_HINT_REGEX = /(logo|icon|sprite|image|img[_-]|_x\d|edited|resize|crop|thumb|banner|hero|background|bg[_-]|@\d+x|_\d+x\d+|screenshot|whatsapp|asset|upload)/i;

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 80 || email.length < 6) return false;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._%+-]{1,40}@[a-zA-Z0-9][a-zA-Z0-9.-]{1,40}\.[a-z]{2,6}$/i.test(email)) return false;

  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (local.length < 2 || local.length > 40) return false;
  if (domain.length < 4 || domain.length > 60) return false;

  if (FILE_EXT_REGEX.test(email)) return false;
  if (FILE_HINT_REGEX.test(local)) return false;
  if (FILE_HINT_REGEX.test(domain)) return false;

  const tld = domain.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "css", "js"].includes(tld)) return false;
  if ((local.match(/\./g) || []).length > 1) return false;
  if (/\.\w{2,4}\.\w{2,4}/.test(local)) return false;
  if (/^\d+$/.test(local)) return false;
  if (domain.split(".").length > 3) return false;
  if (tld.length > 6) return false;

  return true;
}

// ---------- REAL EMAIL EXTRACTION ----------
function extractEmailsFromMailto($) {
  const emails = new Set();
  $("a[href]").each((_, el) => {
    let href = $(el).attr("href") || "";
    if (!/^mailto:/i.test(href)) return;
    href = href.replace(/^mailto:/i, "").split("?")[0].trim();
    href.split(/[,;]/).forEach(e => {
      const email = e.trim().toLowerCase();
      if (isValidEmail(email)) emails.add(email);
    });
  });
  return [...emails];
}

function extractEmailsFromText(text) {
  if (!text) return [];
  const emailRegex = /\b[a-zA-Z][a-zA-Z0-9._%+-]{1,39}@[a-zA-Z0-9][a-zA-Z0-9.-]{1,39}\.[a-z]{2,6}\b/gi;
  const raw = text.match(emailRegex) || [];
  return unique(raw.map(e => e.toLowerCase()).filter(isValidEmail));
}

// ---------- PHONE EXTRACTION ----------
function extractPhones(text) {
  if (!text) return [];

  const patterns = [
    /\+91[\s\-]?[6-9]\d{9}\b/g,
    /\b0(11|22|33|44|40|80|79|20|124|120|172|141|522|712|755|821|824|836|866|870|891)[\s\-]\d{6,8}\b/g,
    /\+1[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b/g,
    /\+44[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{4}\b/g,
    /\+\d{2,3}[\s\-]\d{2,5}[\s\-]\d{3,5}([\s\-]\d{3,5})?\b/g
  ];

  const found = new Set();

  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const raw of matches) {
      const cleaned = raw.trim();
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) continue;
      if (/^(\d)\1+$/.test(digits)) continue;
      if (/^(0123456789|1234567890|9876543210|1122334455)/.test(digits)) continue;
      if (new Set(digits.split("")).size < 7) continue;
      if (/(\d)\1{3,}/.test(digits)) continue;
      const hasValidPrefix = cleaned.startsWith("+") || cleaned.startsWith("0") || /^[6-9]\d{9}$/.test(digits);
      if (!hasValidPrefix) continue;
      found.add(cleaned);
    }
  }

  return [...found].slice(0, 2);
}

// ---------- COMPANY NAME ----------
const BAD_COMPANY_PATTERNS = [
  /^welcome\b/i, /^invest\s+with\b/i, /^build\s+(a|your)\b/i,
  /^we\s+(are|help|build|invest|love)/i, /^the\s+(best|leading|top|future|next|only)/i,
  /^our\s+/i, /^why\s+/i, /^how\s+/i, /^what\s+/i,
  /portfolio\s+with/i, /multi-bagger/i, /^home\s*page/i, /^home$/i,
  /^click\s+/i, /^read\s+/i, /^learn\s+/i, /^explore\s+/i, /^get\s+/i,
  /^let'?s\s+/i, /\?$/, /!$/, /\blorem\b/i, /\bipsum\b/i
];

function isBadCompanyName(name) {
  if (!name) return true;
  if (name.length < 2 || name.length > 60) return true;
  const words = name.split(" ").filter(w => w.length > 0);
  if (words.length < 1 || words.length > 5) return true;
  if (/^\d/.test(name)) return true;
  if (BAD_COMPANY_PATTERNS.some(p => p.test(name))) return true;
  const hasCapitalWord = words.some(w => /^[A-Z]/.test(w));
  if (!hasCapitalWord) return true;
  const lowerWords = words.filter(w => w.length > 2 && w[0] === w[0].toLowerCase()).length;
  if (lowerWords > 1) return true;
  return false;
}

function extractCompanyName($, sourceUrl) {
  const candidates = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = item?.["@type"];
        const isOrg = Array.isArray(type)
          ? type.some(t => /Organization|Corporation|LocalBusiness|WebSite/i.test(t))
          : /Organization|Corporation|LocalBusiness|WebSite/i.test(type || "");
        if (isOrg && item.name) candidates.push({ text: item.name, priority: 1 });
        if (item?.legalName) candidates.push({ text: item.legalName, priority: 1 });
        if (item?.publisher?.name) candidates.push({ text: item.publisher.name, priority: 2 });
      }
    } catch {}
  });

  const ogSite = $('meta[property="og:site_name"]').attr("content");
  if (ogSite) candidates.push({ text: ogSite.trim(), priority: 2 });

  const twSite = $('meta[name="twitter:site"]').attr("content");
  if (twSite) candidates.push({ text: twSite.replace("@", "").trim(), priority: 3 });

  const title = $("title").text().trim();
  if (title) {
    title.split(/[\|–—•·]/).map(p => p.trim()).filter(Boolean).forEach((p, idx) => {
      candidates.push({ text: p, priority: 4 + idx });
    });
  }

  const h1 = $("h1").first().text().trim();
  if (h1) candidates.push({ text: h1, priority: 10 });

  let domainName = "";
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    const namePart = host.split(".")[0];
    if (namePart && namePart.length > 1 && !/^\d+$/.test(namePart)) {
      domainName = namePart.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }
  } catch {}

  candidates.sort((a, b) => a.priority - b.priority);
  for (const c of candidates) {
    const name = cleanText(c.text);
    if (!isBadCompanyName(name)) return name;
  }

  return domainName;
}

// ---------- PERSON NAMES ----------
const TITLE_WORDS = ["partner", "managing", "general", "principal", "director", "founder", "co-founder", "cofounder", "ceo", "cto", "cfo", "coo", "associate", "analyst", "vice president", "vp", "head of", "lead", "investor", "advisor", "chairman", "board"];

function looksLikeName(text) {
  if (!text || text.length < 4 || text.length > 40) return false;
  const words = text.split(" ").filter(w => w.length > 0);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every(w => /^[A-Z][a-zA-Z'.-]+$/.test(w))) return false;
  if (/^(home|about|contact|team|news|blog|press|careers|read|learn)/i.test(text)) return false;
  if (TITLE_WORDS.some(t => text.toLowerCase().includes(t))) return false;
  return true;
}

function extractPersonNames($) {
  const names = new Set();

  $("a[href*='linkedin.com/in/']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/linkedin\.com\/in\/([a-z0-9\-_]+)/i);
    if (m) {
      const parts = m[1].toLowerCase().split(/[-_]/).filter(p => p.length > 1 && !/^\d+$/.test(p));
      if (parts.length >= 2 && parts.length <= 4) {
        const name = parts.map(p => p[0].toUpperCase() + p.slice(1)).join(" ");
        if (looksLikeName(name)) names.add(name);
      }
    }
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.["@type"] === "Person" && item.name && looksLikeName(item.name)) {
          names.add(cleanText(item.name));
        }
      }
    } catch {}
  });

  $("h2, h3, h4").each((_, el) => {
    const text = cleanText($(el).text());
    if (!looksLikeName(text)) return;
    const context = ($(el).next().text() + " " + $(el).parent().text().slice(0, 200)).toLowerCase();
    if (TITLE_WORDS.some(w => context.includes(w))) names.add(text);
  });

  return [...names].slice(0, 10);
}

// ---------- LINKEDIN ----------
function extractLinkedIn($) {
  const links = new Set();
  $("a[href]").each((_, el) => {
    let href = $(el).attr("href") || "";
    if (href.startsWith("/")) href = "https://www.linkedin.com" + href;
    if (!href.startsWith("http")) href = "https://" + href;
    if (/linkedin\.com\/(in|company)\//i.test(href)) links.add(href.split("?")[0]);
  });
  return [...links];
}

function scoreLinkedIn(url) {
  if (url.includes("/in/")) return 5;
  if (url.includes("/company/")) return 3;
  return 1;
}

// ---------- CORE PIPELINE WITH PATTERN GENERATION ----------
function extractAllContacts($, url) {
  const text = cleanText($("body").text());
  const mailtoEmails = extractEmailsFromMailto($);
  const bodyEmails = extractEmailsFromText(text);
  const companyName = extractCompanyName($, url);
  const phones = extractPhones(text);
  const linkedin = extractLinkedIn($);
  const personNames = extractPersonNames($);
  const domain = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return ""; }
  })();

  const realEmails = unique([...mailtoEmails, ...bodyEmails]);

  // 🎯 PATTERN-BASED EMAIL GENERATION
  const patternEmails = [];
  if (personNames.length > 0 && domain) {
    const detectedPattern = detectPatternFromExisting(realEmails, personNames[0]);

    for (const name of personNames.slice(0, 5)) {
      const patterns = buildPatternEmails(name, domain, detectedPattern);
      for (const p of patterns) {
        if (!realEmails.includes(p.email) && !patternEmails.some(pe => pe.email === p.email)) {
          patternEmails.push({ ...p, name });
        }
      }
    }
  }

  const emailDetails = [
    ...mailtoEmails.map(e => ({ email: e, source: "mailto", weight: 10, score: 10, verified: null })),
    ...bodyEmails.filter(e => !mailtoEmails.includes(e)).map(e => ({ email: e, source: "body", weight: 7, score: 7, verified: null })),
    ...patternEmails.map(p => ({
      email: p.email,
      source: "pattern",
      weight: 3,
      score: 3,
      verified: null,
      pattern: p.pattern,
      personName: p.name
    }))
  ];

  return {
    companyName,
    personNames,
    emails: unique(emailDetails.map(e => e.email)),
    emailDetails,
    emailScore: emailDetails.reduce((s, e) => s + (e.score || 0), 0),
    phones,
    linkedin,
    linkedinDetails: linkedin.map(u => ({ url: u, score: scoreLinkedIn(u) })),
    linkedinScore: linkedin.reduce((s, u) => s + scoreLinkedIn(u), 0),
    text,
    domain
  };
}

// ---------- RECORD BUILDERS ----------
function buildRecord(c, url, entityType, crawlType, name = "") {
  return {
    name,
    company_name: c.companyName,
    investor_type: entityType === "investor" ? "VC" : entityType,
    region: "", hq_city: null,
    sectors: [], tags: [], portfolio: [], thesis: "",
    emails: c.emails,
    email_details: c.emailDetails,
    email_score: c.emailScore,
    linkedin: c.linkedin,
    linkedin_details: c.linkedinDetails,
    linkedin_score: c.linkedinScore,
    phones: c.phones,
    latest_year: null, is_fresh: false,
    description: c.text.substring(0, 300),
    website: url, source_url: url, source_urls: [url],
    investor_score: 0, confidence: "", status_code: null,
    crawl_type: crawlType, entity_type: entityType
  };
}

function extractInvestorData($, url) {
  const c = extractAllContacts($, url);
  return buildRecord(c, url, "investor", "investor_page", c.personNames[0] || "");
}

function extractMultipleInvestors($, url) {
  const c = extractAllContacts($, url);
  if (c.personNames.length > 0) {
    return c.personNames.map(name => buildRecord(c, url, "investor", "team_page", name));
  }
  return [buildRecord(c, url, "investor", "team_page")];
}

function extractPortfolioCompanies($, url) {
  const c = extractAllContacts($, url);
  return [buildRecord(c, url, "investor", "portfolio_page")];
}

function extractGenericEntity($, url, entityType = "wholesaler") {
  const c = extractAllContacts($, url);
  return buildRecord(c, url, entityType, "generic_extraction", c.personNames[0] || "");
}

module.exports = {
  extractInvestorData,
  extractMultipleInvestors,
  extractPortfolioCompanies,
  extractGenericEntity
};