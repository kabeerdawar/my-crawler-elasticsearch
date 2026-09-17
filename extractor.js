// extractor.js

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map(v => cleanText(v)).filter(Boolean))];
}

// ---------- INVESTOR TYPE ----------
function findInvestorType(text) {
  const t = text.toLowerCase();
  if (/family office|family fund|family investment office/.test(t)) return "Family Fund";
  if (/private equity|private-equity/.test(t)) return "Private Equity";
  if (/venture capital|venture fund|vc firm|vc fund/.test(t)) return "Venture Capital";
  if (/angel investor|angel investing|angel network/.test(t)) return "Angel Investor";
  if (/\bhni\b|high-net-worth individual|high net worth individual/.test(t)) return "HNI";
  return "";
}

// ---------- REGION (MAJORITY VOTE) ----------
function findRegion(text) {
  const t = text.toLowerCase();

  const regions = {
    India: ["india","mumbai","delhi","new delhi","bangalore","bengaluru","hyderabad","chennai","pune","gurugram","gurgaon","ahmedabad","kolkata"],
    USA: ["united states","usa","new york","san francisco","california","boston","los angeles","texas","silicon valley","bay area","menlo park","palo alto"],
    UK: ["united kingdom","london","england","scotland"],
    Europe: ["europe","germany","france","berlin","paris","netherlands","amsterdam","spain","italy"],
    Middle_East: ["dubai","abu dhabi","uae","united arab emirates","saudi arabia","riyadh"],
    Southeast_Asia: ["singapore","indonesia","malaysia","thailand","vietnam"]
  };

  const counts = {};
  for (const [region, keys] of Object.entries(regions)) {
    let count = 0;
    for (const k of keys) {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = t.match(new RegExp(escaped, "g"));
      if (matches) count += matches.length;
    }
    counts[region] = count;
  }

  let topRegion = "";
  let topCount = 0;
  for (const [region, count] of Object.entries(counts)) {
    if (count > topCount) { topCount = count; topRegion = region; }
  }

  if (topCount < 3) return "";
  return topRegion;
}

// ---------- SECTORS ----------
function findSectors(text) {
  const t = text.toLowerCase();
  const rules = {
    AI: ["artificial intelligence","machine learning","generative ai","genai"],
    SaaS: ["saas","software as a service"],
    FinTech: ["fintech","financial technology","payments","banking technology"],
    Healthcare: ["healthcare","health tech","medical technology","biotech","life sciences"],
    EdTech: ["edtech","education technology","online education"],
    ClimateTech: ["climate tech","climatetech","clean tech","cleantech"],
    Cybersecurity: ["cybersecurity","cyber security"],
    ECommerce: ["e-commerce","ecommerce","online marketplace"],
    Consumer: ["consumer brands","consumer technology","consumer products"],
    DeepTech: ["deep tech","deeptech"],
    AgriTech: ["agritech","agri tech","agriculture technology"],
    Mobility: ["mobility","transportation technology","electric vehicles"],
    SpaceTech: ["space tech","spacetech","space technology"]
  };
  const found = [];
  for (const [sector, keys] of Object.entries(rules)) {
    if (keys.some(k => t.includes(k))) found.push(sector);
  }
  return found;
}

// ---------- TAGS ----------
function findTags(text) {
  const t = text.toLowerCase();
  const rules = {
    "Pre-Seed": ["pre-seed","pre seed"],
    Seed: ["seed stage","seed round","seed funding"],
    "Early Stage": ["early stage","early-stage"],
    "Series A": ["series a"],
    "Series B": ["series b"],
    B2B: ["b2b","business to business"],
    B2C: ["b2c","business to consumer"],
    "Lead Investor": ["lead investor","lead investment"],
    "Follow On": ["follow-on","follow on"],
    "Founder Friendly": ["founder friendly","founder-focused","founder focused"],
    Global: ["global","international"]
  };
  const found = [];
  for (const [tag, keys] of Object.entries(rules)) {
    if (keys.some(k => t.includes(k))) found.push(tag);
  }
  return found;
}

// ---------- FRESHNESS ----------
function findLatestYear(text) {
  const matches = text.match(/\b(20\d{2})\b/g) || [];
  const years = matches.map(Number).filter(y => y >= 2015 && y <= 2026);
  return years.length ? Math.max(...years) : null;
}

// ---------- EMAIL ----------
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const VALID_TLDS = new Set([
  "com","org","net","io","co","ai","vc","in","us","uk","de","fr","es","it","nl",
  "sg","hk","jp","kr","cn","au","ca","br","mx","za","ng","ke","il","ae","sa",
  "ch","se","no","dk","fi","be","at","ie","pt","gr","pl","cz","ro","ru","tr",
  "biz","info","me","tv","app","dev","tech","xyz","live","online","site",
  "capital","ventures","fund","finance","bank","exchange","email","group","company",
  "partners","investments","holdings","ltd","inc"
]);

const BLOCKED_LOCAL_PARTS = [
  "noreply","no-reply","donotreply","do-not-reply",
  "postmaster","abuse","webmaster","hostmaster",
  "press","media","pr","news","marketing"
];

const BLOCKED_DOMAINS = [
  "example.com","example.org","example.net","test.com","domain.com","yourdomain.com",
  "email.com","sentry.io","ingest.sentry.io","sentry.wixpress.com","wixpress.com",
  "squarespace.com","godaddy.com","shopify.com","wix.com","weebly.com",
  "google-analytics.com","googletagmanager.com","google.com","gstatic.com",
  "doubleclick.net","googlesyndication.com","cloudflare.com","cloudflareinsights.com",
  "cdn.jsdelivr.net","unpkg.com","newrelic.com","nr-data.net","hotjar.com",
  "intercom.io","schema.org","w3.org","fb.com","facebook.com","twitter.com",
  "instagram.com","linkedin.com"
];

const GENERIC_LOCALS = [
  "info","contact","hello","admin","support","sales","team","office",
  "enquiries","enquiry","inquiries","inquiry","help","mail"
];

function looksLikeJunk(email) {
  const local = email.split("@")[0] || "";
  if (local.length > 30) return true;
  if (/[a-z]{15,}/.test(local)) return true;
  if (local.length > 8) {
    const half = Math.floor(local.length / 2);
    if (local.slice(0, half) === local.slice(half, half * 2)) return true;
  }
  if (/mailto|http|www/i.test(local)) return true;
  if (/^u003/i.test(local)) return true;
  if (/^[0-9a-f]{16,}$/i.test(local)) return true;
  if (/^[a-f0-9-]{20,}$/i.test(local)) return true;
  if (/^\d+$/.test(local)) return true;
  if (/^(privacy|legal|terms|cookies|gdpr|dmca|abuse|accessibility)/.test(local)) return true;
  return false;
}

function isValidEmail(email) {
  if (!email || email.length > 80) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;

  const localLower = local.toLowerCase();
  const domainLower = domain.toLowerCase();

  if (!domainLower.includes(".")) return false;
  if (/\.\./.test(localLower) || /\.\./.test(domainLower)) return false;
  if (localLower.startsWith(".") || localLower.endsWith(".")) return false;

  const tld = domainLower.split(".").pop();
  if (!VALID_TLDS.has(tld)) return false;

  if (BLOCKED_LOCAL_PARTS.includes(localLower)) return false;
  if (BLOCKED_DOMAINS.includes(domainLower)) return false;
  if (BLOCKED_DOMAINS.some(b => domainLower.endsWith("." + b))) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico)$/i.test(domainLower)) return false;

  if (looksLikeJunk(email)) return false;
  return true;
}

function scoreEmail(email, source, weight) {
  const local = email.split("@")[0].toLowerCase();
  const isGeneric = GENERIC_LOCALS.includes(local);

  if (source === "mailto") return isGeneric ? 4 : 7;
  if (source === "data-attr") return isGeneric ? 3 : 5;
  if (weight >= 6) return isGeneric ? 3 : 6;
  if (weight >= 5) return isGeneric ? 2 : 4;
  return isGeneric ? 1 : 2;
}

function findEmails($, text, url = "") {
  const found = new Map();

  // Detect portfolio/companies pages — skip body emails there
  const isPortfolioPage = /portfolio|companies|investments|backed|funded/i.test(url);

  function add(email, source, weight) {
    email = String(email || "").toLowerCase().trim();
    email = email.replace(/[.,;:!?]+$/, "");
    email = email.replace(/^[^\w]+/, "");
    if (!isValidEmail(email)) return;
    const prev = found.get(email);
    if (!prev || prev.weight < weight) {
      found.set(email, { source, weight });
    }
  }

  // 1. mailto — always safe
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const raw = href.replace(/^mailto:/i, "").split("?")[0].trim();
    add(raw, "mailto", 10);
  });

  // 2. data-email
  $("[data-email]").each((_, el) => {
    const v = $(el).attr("data-email") || "";
    add(v, "data-attr", 8);
  });

  // 3. body text — ONLY if not portfolio page
  if (!isPortfolioPage) {
    const cleanBody = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");

    const matches = cleanBody.match(EMAIL_REGEX) || [];
    for (const m of matches) {
      const idx = cleanBody.toLowerCase().indexOf(m.toLowerCase());
      const context = cleanBody.slice(Math.max(0, idx - 100), idx + m.length + 100).toLowerCase();

      let weight = 3;
      if (/contact|email|reach|enquir|inquir|write to/.test(context)) weight = 6;
      if (/partner|founder|investor|principal|managing director/.test(context)) weight = 7;

      add(m, "body", weight);
    }
  }

  return [...found.entries()]
    .map(([email, meta]) => {
      const score = scoreEmail(email, meta.source, meta.weight);
      return { email, source: meta.source, weight: meta.weight, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ---------- LINKEDIN ----------
function findLinkedIn($) {
  const found = new Map();
  const seenPaths = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !href.toLowerCase().includes("linkedin.com")) return;

    try {
      const parsed = new URL(href);
      parsed.hash = "";
      parsed.search = "";
      const url = parsed.href;
      const path = parsed.pathname.toLowerCase();

      if (path.includes("/share") || path.includes("sharearticle")) return;

      const pathParts = path.split("/").filter(Boolean);
      if (pathParts.length < 2) return;

      const type = pathParts[0];
      const slug = pathParts[1];
      const dedupeKey = `${type}/${slug}`;
      if (seenPaths.has(dedupeKey)) return;
      seenPaths.add(dedupeKey);

      let score = 1;
      if (type === "in") score = 5;
      else if (type === "company") score = 3;

      found.set(url, { url, score });
    } catch {}
  });

  return [...found.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ---------- PHONES ----------
function findPhones(text) {
  const matches = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g);
  if (!matches) return [];
  return unique(
    matches.map(p => p.replace(/[^\d+]/g, "").trim()).filter(p => {
      const d = p.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 15;
    })
  ).slice(0, 2);
}

// ---------- NAME ----------
function findName($, text) {
  const selectors = [
    '[itemprop="name"]',
    ".investor-name",".person-name",
    ".profile-name",".team-member-name"
  ];
  for (const s of selectors) {
    const v = cleanText($(s).first().text());
    if (v && v.split(/\s+/).length >= 2 && v.split(/\s+/).length <= 4 && v.length < 60) return v;
  }
  const patterns = [
    /(?:partner|founder|co-founder|investor|principal|director|managing partner)\s*[:\-]\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanText(m[1]);
  }
  return "";
}

// ---------- COMPANY (STRICT) ----------
function findCompany($, url) {
  // 1. og:site_name is most reliable
  const siteName = cleanText($('meta[property="og:site_name"]').attr("content") || "");
  if (siteName && siteName.length > 1 && siteName.length < 60 &&
      !/^(home|welcome|blog|news)$/i.test(siteName)) {
    return siteName;
  }

  // 2. Schema
  const legal = cleanText($('[itemprop="legalName"]').first().text());
  if (legal && legal.length < 80) return legal;

  // 3. Common class selectors
  const selectors = [".company-name",".firm-name",".fund-name",".organization-name"];
  for (const s of selectors) {
    const v = cleanText($(s).first().text());
    if (v && v.length < 80) return v;
  }

  // 4. Title (with junk filter)
  const title = cleanText($("title").first().text());
  if (title) {
    const cleaned = title
      .replace(/\s*[\|\-–—]\s*.*$/, "")
      .replace(/\s+/g, " ")
      .trim();

    const junkPhrases = [
      "top ","best ","how to ","guide to ","legal ","privacy ",
      "terms ","disclosure","cookie","faq","blog","news",
      "founders go","investing in","we invest","insights","report",
      "unlocked","the ","our ","home","profile","welcome",
      "investing profile","investor profile","about ","contact ",
      "page not","error","404","sign in","log in"
    ];
    const lowerCleaned = cleaned.toLowerCase();
    const isJunk = junkPhrases.some(p => lowerCleaned.includes(p));
    if (isJunk) return "";
    if (lowerCleaned === "home") return "";

    if (cleaned.length < 60 &&
        !cleaned.includes(":") &&
        !cleaned.includes("'s ") &&
        cleaned.split(/\s+/).length <= 5) {
      return cleaned;
    }
  }

  // 5. Fallback: derive from URL
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length >= 2) {
      let name = parts[0];
      name = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      name = name.replace(/\s+(Vc|Capital|Ventures|Investments|Partners|Holdings)$/i, "");
      return name;
    }
  } catch {}

  return "";
}

// ---------- MAIN ----------
function extractInvestorData($, url) {
  const text = cleanText($("body").text());

  const name = findName($, text);
  const company_name = findCompany($, url);
  const investor_type = findInvestorType(text);
  const region = findRegion(text);
  const sectors = findSectors(text);
  const tags = findTags(text);
  const emailDetails = findEmails($, text, url);
  const linkedinDetails = findLinkedIn($);
  const phones = findPhones(text);

  const emails = emailDetails.map(e => e.email);
  const email_score = emailDetails.reduce((s, e) => s + e.score, 0);

  const linkedin = linkedinDetails.map(l => l.url);
  const linkedin_score = linkedinDetails.reduce((s, l) => s + l.score, 0);

  const latestYear = findLatestYear(text);
  const isFresh = !!(latestYear && latestYear >= 2024);

  return {
    name,
    company_name,
    investor_type,
    region,
    sectors,
    tags,
    emails,
    email_details: emailDetails,
    email_score,
    linkedin,
    linkedin_details: linkedinDetails,
    linkedin_score,
    phones,
    latest_year: latestYear,
    is_fresh: isFresh,
    website: url,
    source_url: url,
    crawl_type:
      investor_type || sectors.length || tags.length || emails.length || linkedin.length
        ? "potential_investor_page"
        : "general_page"
  };
}

module.exports = { extractInvestorData };