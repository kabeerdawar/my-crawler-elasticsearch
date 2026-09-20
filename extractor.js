// extractor.js

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map(v => cleanText(v)).filter(Boolean))];
}

function decodeCfEmail(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let email = "";
    for (let i = 2; i < hex.length; i += 2) {
      email += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
    }
    return email;
  } catch { return null; }
}

// ---------- JSON-LD ----------
function findJsonLd($) {
  const result = { name: "", description: "", url: "", email: "", phone: "", address: "", industry: "", founders: [], social: {} };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      let json = $(el).html();
      if (!json) return;
      json = JSON.parse(json);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const type = item["@type"];
        if (!type) continue;
        if (/Organization|Corporation|LocalBusiness|FinancialService/.test(type)) {
          if (item.name && !result.name) result.name = item.name;
          if (item.description && !result.description) result.description = item.description;
          if (item.url && !result.url) result.url = item.url;
          if (item.email && !result.email) result.email = item.email;
          if (item.telephone && !result.phone) result.phone = item.telephone;
          if (item.industry && !result.industry) result.industry = item.industry;
          if (item.address && !result.address) {
            const a = item.address;
            result.address = [a.streetAddress, a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ");
          }
          if (item.founder) {
            const fs = Array.isArray(item.founder) ? item.founder : [item.founder];
            for (const f of fs) {
              if (typeof f === "string") result.founders.push(f);
              else if (f.name) result.founders.push(f.name);
            }
          }
          if (item.sameAs) {
            const links = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
            for (const link of links) {
              if (/linkedin\.com/i.test(link)) result.social.linkedin = link;
            }
          }
        }
      }
    } catch {}
  });
  return result;
}

function findOpenGraph($) {
  const getMeta = (prop) => cleanText(
    $(`meta[property="${prop}"]`).attr("content") ||
    $(`meta[name="${prop}"]`).attr("content") || ""
  );
  return { siteName: getMeta("og:site_name"), title: getMeta("og:title"), description: getMeta("og:description"), url: getMeta("og:url") };
}

function findInvestorType(text) {
  const t = text.toLowerCase();
  if (/family office|family fund|family investment office/.test(t)) return "Family Fund";
  if (/private equity|private-equity/.test(t)) return "Private Equity";
  if (/venture capital|venture fund|vc firm|vc fund/.test(t)) return "Venture Capital";
  if (/angel investor|angel investing|angel network/.test(t)) return "Angel Investor";
  if (/\bhni\b|high-net-worth individual|high net worth individual/.test(t)) return "HNI";
  return "";
}

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
  let topRegion = ""; let topCount = 0;
  for (const [region, count] of Object.entries(counts)) {
    if (count > topCount) { topCount = count; topRegion = region; }
  }
  if (topCount < 3) return "";
  return topRegion;
}

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

function findLatestYear(text) {
  const matches = text.match(/\b(20\d{2})\b/g) || [];
  const years = matches.map(Number).filter(y => y >= 2015 && y <= 2026);
  return years.length ? Math.max(...years) : null;
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const VALID_TLDS = new Set([
  "com","org","net","io","co","ai","vc","in","us","uk","de","fr","es","it","nl",
  "sg","hk","jp","kr","cn","au","ca","br","mx","za","ng","ke","il","ae","sa",
  "ch","se","no","dk","fi","be","at","ie","pt","gr","pl","cz","ro","ru","tr",
  "biz","info","me","tv","app","dev","tech","xyz","live","online","site",
  "capital","ventures","fund","finance","bank","exchange","email","group","company",
  "partners","investments","holdings","ltd","inc"
]);

const BLOCKED_LOCAL_PARTS = ["noreply","no-reply","donotreply","do-not-reply","postmaster","abuse","webmaster","hostmaster","press","media","pr","news","marketing"];

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

const GENERIC_LOCALS = ["info","contact","hello","admin","support","sales","team","office","enquiries","enquiry","inquiries","inquiry","help","mail"];

function looksLikeJunk(email) {
  const local = email.split("@")[0] || "";
  if (local.length > 30) return true;
  if (/[a-z]{15,}/.test(local)) return true;
  if (/mailto|http|www/i.test(local)) return true;
  if (/^u003/i.test(local)) return true;
  if (/^[0-9a-f]{16,}$/i.test(local)) return true;
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
  const tld = domainLower.split(".").pop();
  if (!VALID_TLDS.has(tld)) return false;
  if (BLOCKED_LOCAL_PARTS.includes(localLower)) return false;
  if (BLOCKED_DOMAINS.includes(domainLower)) return false;
  if (BLOCKED_DOMAINS.some(b => domainLower.endsWith("." + b))) return false;
  if (looksLikeJunk(email)) return false;
  return true;
}

function scoreEmail(email, source, weight) {
  const local = email.split("@")[0].toLowerCase();
  const isGeneric = GENERIC_LOCALS.includes(local);
  if (source === "mailto") return isGeneric ? 4 : 7;
  if (source === "cf-decoded") return isGeneric ? 4 : 7;
  if (source === "data-attr") return isGeneric ? 3 : 5;
  if (source === "json-ld") return isGeneric ? 4 : 7;
  if (source === "footer") return isGeneric ? 4 : 6;
  if (source === "pattern") return 2;
  if (weight >= 6) return isGeneric ? 3 : 6;
  if (weight >= 5) return isGeneric ? 2 : 4;
  return isGeneric ? 1 : 2;
}

function findEmails($, text, url = "", jsonLd = null) {
  const found = new Map();
  const isPortfolioPage = /portfolio|companies|investments|backed|funded/i.test(url);
  let firmBaseDomain = "";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    firmBaseDomain = host.split(".").slice(-2).join(".");
  } catch {}

  function add(email, source, weight) {
    email = String(email || "").toLowerCase().trim().replace(/[.,;:!?]+$/, "");
    if (!isValidEmail(email)) return;
    if (source !== "mailto" && source !== "data-attr" && source !== "json-ld" && source !== "pattern" && source !== "cf-decoded" && firmBaseDomain) {
      const emailDomain = email.split("@")[1];
      if (!emailDomain) return;
      const emailBase = emailDomain.split(".").slice(-2).join(".");
      const personal = ["gmail.com","yahoo.com","outlook.com","hotmail.com","icloud.com"];
      if (emailBase !== firmBaseDomain && !personal.includes(emailDomain)) return;
    }
    const prev = found.get(email);
    if (!prev || prev.weight < weight) found.set(email, { source, weight });
  }

  if (jsonLd && jsonLd.email) add(jsonLd.email, "json-ld", 12);

  const rawHtml = $.html();
  const cfPattern = /<a[^>]*class="__cf_email__"[^>]*data-cfemail="([a-f0-9]+)"[^>]*>/gi;
  let cfMatch;
  while ((cfMatch = cfPattern.exec(rawHtml)) !== null) {
    try {
      const decoded = decodeCfEmail(cfMatch[1]);
      if (decoded) add(decoded, "cf-decoded", 11);
    } catch {}
  }

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const raw = href.replace(/^mailto:/i, "").split("?")[0].trim();
    add(raw, "mailto", 10);
  });

  $('[data-href^="mailto:"], [data-mailto]').each((_, el) => {
    const href = $(el).attr("data-href") || $(el).attr("data-mailto") || "";
    const raw = href.replace(/^mailto:/i, "").split("?")[0].trim();
    if (raw) add(raw, "mailto", 9);
  });

  $("[data-email]").each((_, el) => add($(el).attr("data-email") || "", "data-attr", 8));

  $("footer, .footer, #footer, .site-footer, .bottom-footer").each((_, el) => {
    const footerText = cleanText($(el).text());
    const footerEmails = footerText.match(EMAIL_REGEX) || [];
    for (const m of footerEmails) add(m, "footer", 8);
    $(el).find('a[href^="mailto:"]').each((_, mel) => {
      const href = $(mel).attr("href") || "";
      const raw = href.replace(/^mailto:/i, "").split("?")[0].trim();
      add(raw, "mailto", 10);
    });
  });

  if (!isPortfolioPage) {
    const cleanBody = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
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

  const decodedHtml = rawHtml
    .replace(/&#64;/g, "@").replace(/&#46;/g, ".")
    .replace(/&#x40;/gi, "@").replace(/&#x2e;/gi, ".")
    .replace(/&commat;/g, "@").replace(/&period;/g, ".");

  const atDecoded = decodedHtml
    .replace(/\s*\[at\]\s*/gi, "@").replace(/\s*\(at\)\s*/gi, "@").replace(/\s*\{at\}\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".").replace(/\s*\(dot\)\s*/gi, ".").replace(/\s*\{dot\}\s*/gi, ".");

  const decodedMatches = atDecoded.match(EMAIL_REGEX) || [];
  for (const m of decodedMatches) {
    if (m.includes("@") && isValidEmail(m)) add(m, "body", 6);
  }

  if (found.size === 0 && firmBaseDomain && !isPortfolioPage) {
    for (const local of ["info", "contact"]) {
      const candidate = `${local}@${firmBaseDomain}`;
      if (!found.has(candidate)) found.set(candidate, { source: "pattern", weight: 1 });
    }
  }

  return [...found.entries()]
    .map(([email, meta]) => ({ email, source: meta.source, weight: meta.weight, score: scoreEmail(email, meta.source, meta.weight) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
}

function findLinkedIn($, jsonLd = null) {
  const found = new Map();
  const seenPaths = new Set();

  if (jsonLd && jsonLd.social && jsonLd.social.linkedin) {
    try {
      const parsed = new URL(jsonLd.social.linkedin);
      const parts = parsed.pathname.toLowerCase().split("/").filter(Boolean);
      if (parts.length >= 2) {
        seenPaths.add(`${parts[0]}/${parts[1]}`);
        found.set(jsonLd.social.linkedin, { url: jsonLd.social.linkedin, score: parts[0] === "in" ? 5 : 3 });
      }
    } catch {}
  }

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !href.toLowerCase().includes("linkedin.com")) return;
    try {
      const parsed = new URL(href);
      parsed.hash = ""; parsed.search = "";
      const url = parsed.href;
      const path = parsed.pathname.toLowerCase();
      if (path.includes("/share") || path.includes("sharearticle")) return;
      const parts = path.split("/").filter(Boolean);
      if (parts.length < 2) return;
      const type = parts[0]; const slug = parts[1];
      const dedupeKey = `${type}/${slug}`;
      if (seenPaths.has(dedupeKey)) return;
      seenPaths.add(dedupeKey);
      let score = 1;
      if (type === "in") score = 5;
      else if (type === "company") score = 3;
      found.set(url, { url, score });
    } catch {}
  });

  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 10);
}

function findPhones(text) {
  const matches = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g);
  if (!matches) return [];
  return unique(matches.map(p => p.replace(/[^\d+]/g, "").trim()).filter(p => {
    const d = p.replace(/\D/g, "");
    return d.length >= 10 && d.length <= 15;
  })).slice(0, 2);
}

function findName($, text) {
  const selectors = ['[itemprop="name"]',".investor-name",".person-name",".profile-name",".team-member-name"];
  for (const s of selectors) {
    const v = cleanText($(s).first().text());
    if (v && v.split(/\s+/).length >= 2 && v.split(/\s+/).length <= 4 && v.length < 60) return v;
  }
  const patterns = [/(?:partner|founder|co-founder|investor|principal|director|managing partner)\s*[:\-]\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})/];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanText(m[1]);
  }
  return "";
}

function findCompany($, url, jsonLd = null, og = null) {
  if (jsonLd && jsonLd.name && jsonLd.name.length < 80) return jsonLd.name;
  if (og && og.siteName && og.siteName.length < 60 && !/^(home|welcome|blog|news)$/i.test(og.siteName)) return og.siteName;
  const legal = cleanText($('[itemprop="legalName"]').first().text());
  if (legal && legal.length < 80) return legal;
  const selectors = [".company-name",".firm-name",".fund-name",".organization-name"];
  for (const s of selectors) {
    const v = cleanText($(s).first().text());
    if (v && v.length < 80) return v;
  }
  const title = cleanText($("title").first().text());
  if (title) {
    const cleaned = title.replace(/\s*[\|\-–—]\s*.*$/, "").replace(/\s+/g, " ").trim();
    const junk = ["top ","best ","how to ","how we ","guide to ","legal ","privacy ","terms ","disclosure","cookie","faq","blog","news","home","we invest","insights","report","profile","about ","contact ","sign in","log in"];
    const low = cleaned.toLowerCase();
    if (!junk.some(p => low.includes(p)) && cleaned.length < 60 && !cleaned.includes(":") && cleaned.split(/\s+/).length <= 5) {
      return cleaned;
    }
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length >= 2) {
      let name = parts[0].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      name = name.replace(/\s+(Vc|Capital|Ventures|Investments|Partners|Holdings)$/i, "");
      return name;
    }
  } catch {}
  return "";
}

function findPortfolio(text) {
  const companies = new Set();
  const portfolioBlocks = text.match(/(?:portfolio|companies|investments|backed|invested in|portfolio companies)\s*[:\-–]\s*([^\n.]{10,300})/gi) || [];
  for (const block of portfolioBlocks) {
    const cleaned = block.replace(/^[^:]+[:\-–]\s*/, "");
    const parts = cleaned.split(/[,;•·|]/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      const name = p.replace(/^(and|or|the|a|an)\s+/i, "").trim();
      if (name.length >= 3 && name.length <= 40 && /^[A-Z]/.test(name) && !name.includes("@") && !name.includes("http")) {
        companies.add(name);
      }
    }
  }
  const investedIn = text.match(/invested in\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/g) || [];
  for (const m of investedIn) {
    const name = m.replace(/^invested in\s+/i, "").trim();
    if (name.length >= 3 && name.length <= 40) companies.add(name);
  }
  return [...companies].slice(0, 10);
}

function findThesis(text) {
  const patterns = [
    /(?:our thesis|investment thesis|we invest in|we back|focused on|we look for|our focus is)\s*[:\-–]?\s*([^\n.]{20,250})/i,
    /(?:thesis|focus|strategy)\s*[:\-–]\s*([^\n.]{20,250})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const thesis = cleanText(match[1]).slice(0, 250);
      if (thesis.length >= 20) return thesis;
    }
  }
  return "";
}

function extractTeamMembers($, url, base) {
  const people = [];
  const seenLinkedIn = new Set();
  const seenNames = new Set();

  $('a[href*="linkedin.com/in/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const parsed = new URL(href);
      parsed.hash = ""; parsed.search = "";
      const linkedinUrl = parsed.href;
      const pathParts = parsed.pathname.toLowerCase().split("/").filter(Boolean);
      if (pathParts.length < 2 || pathParts[0] !== "in") return;
      const slug = pathParts[1];
      if (seenLinkedIn.has(slug)) return;
      seenLinkedIn.add(slug);

      const $el = $(el);
      let name = "";
      const linkText = cleanText($el.text());
      if (linkText && linkText.split(/\s+/).length >= 2 && linkText.split(/\s+/).length <= 4 && linkText.length < 60 && !/linkedin|profile|view/i.test(linkText)) name = linkText;
      if (!name) {
        const parent = $el.closest("div, li, article, section, td");
        if (parent.length) {
          const heading = cleanText(parent.find("h1, h2, h3, h4, h5, strong, .name, .person-name").first().text());
          if (heading && heading.split(/\s+/).length >= 2 && heading.split(/\s+/).length <= 4 && heading.length < 60) name = heading;
        }
      }
      if (!name) return;
      if (!/^[A-Z][a-z]+/.test(name)) return;
      if (seenNames.has(name.toLowerCase())) return;
      seenNames.add(name.toLowerCase());

      let title = "";
      const parent = $el.closest("div, li, article, section, td");
      if (parent.length) {
        const titleEl = parent.find(".title, .role, .position, .job-title, p").first().text();
        if (titleEl) title = cleanText(titleEl).slice(0, 100);
      }

      let personEmail = "";
      if (parent.length) {
        const mailtoEl = parent.find('a[href^="mailto:"]').first();
        if (mailtoEl.length) {
          const mhref = mailtoEl.attr("href") || "";
          const raw = mhref.replace(/^mailto:/i, "").split("?")[0].trim();
          if (isValidEmail(raw)) personEmail = raw.toLowerCase();
        }
      }

      const emailDetails = personEmail ? [{ email: personEmail, source: "mailto", weight: 10, score: 7 }] : [];

      people.push({
        name, company_name: base.company_name, investor_type: base.investor_type,
        region: base.region, sectors: base.sectors, tags: base.tags, description: title,
        portfolio: [], thesis: "",
        emails: personEmail ? [personEmail] : [], email_details: emailDetails,
        email_score: emailDetails.reduce((s, e) => s + e.score, 0),
        linkedin: [linkedinUrl], linkedin_details: [{ url: linkedinUrl, score: 5 }], linkedin_score: 5,
        phones: [], latest_year: base.latest_year, is_fresh: base.is_fresh,
        website: base.website, source_url: url, crawl_type: "team_member"
      });
    } catch {}
  });

  $("h2, h3, h4, .team-member, .person, .member, .team-card, .profile-card").each((_, el) => {
    const $el = $(el);
    const name = cleanText($el.text());
    if (!name) return;
    if (name.split(/\s+/).length < 2 || name.split(/\s+/).length > 4) return;
    if (name.length > 60) return;
    if (/^(our team|team|leadership|management|advisors|about|portfolio|investments|contact|home|board|founders|partners|staff|people)$/i.test(name)) return;
    if (!/^[A-Z][a-z]+/.test(name)) return;
    if (seenNames.has(name.toLowerCase())) return;
    seenNames.add(name.toLowerCase());

    const parent = $el.closest("div, li, article, section, td, .card, .profile-card, .team-card");
    if (!parent.length) return;

    let title = "";
    const titleEl = parent.find(".title, .role, .position, .job-title, p, .designation").first().text();
    if (titleEl) title = cleanText(titleEl).slice(0, 100);
    if (/^(we|our|the|this|read|view|click|learn|next|previous|all|more)/i.test(title)) title = "";

    let linkedinUrl = "";
    const liEl = parent.find('a[href*="linkedin.com/in/"]').first();
    if (liEl.length) {
      try {
        const parsed = new URL(liEl.attr("href"));
        parsed.hash = ""; parsed.search = "";
        linkedinUrl = parsed.href;
      } catch {}
    }

    let personEmail = "";
    const mailtoEl = parent.find('a[href^="mailto:"]').first();
    if (mailtoEl.length) {
      const mhref = mailtoEl.attr("href") || "";
      const raw = mhref.replace(/^mailto:/i, "").split("?")[0].trim();
      if (isValidEmail(raw)) personEmail = raw.toLowerCase();
    }

    const emailDetails = personEmail ? [{ email: personEmail, source: "mailto", weight: 10, score: 7 }] : [];

    people.push({
      name, company_name: base.company_name, investor_type: base.investor_type,
      region: base.region, sectors: base.sectors, tags: base.tags, description: title,
      portfolio: [], thesis: "",
      emails: personEmail ? [personEmail] : [], email_details: emailDetails,
      email_score: emailDetails.reduce((s, e) => s + e.score, 0),
      linkedin: linkedinUrl ? [linkedinUrl] : [],
      linkedin_details: linkedinUrl ? [{ url: linkedinUrl, score: 5 }] : [],
      linkedin_score: linkedinUrl ? 5 : 0,
      phones: [], latest_year: base.latest_year, is_fresh: base.is_fresh,
      website: base.website, source_url: url, crawl_type: "team_member"
    });
  });

  return people;
}

function extractPortfolioCompanies($, url) {
  const companies = [];
  const seen = new Set();
  const selectors = [".portfolio-item", ".company-card", ".portfolio-card", ".startup-card", ".portfolio-company", ".investment", "article", "li.portfolio"];
  let found = false;

  for (const selector of selectors) {
    const items = $(selector);
    if (items.length === 0) continue;

    items.each((_, el) => {
      const $el = $(el);
      const text = cleanText($el.text());
      if (!text || text.length < 5 || text.length > 500) return;

      let companyName = cleanText($el.find("h1, h2, h3, h4, h5, strong, .company-name, .name").first().text());
      if (!companyName || companyName.length < 2 || companyName.length > 60) return;
      if (seen.has(companyName.toLowerCase())) return;
      seen.add(companyName.toLowerCase());

      let founderName = "";
      const fm = text.match(/(?:founder|co-founder|ceo)[\s:\-]*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})/);
      if (fm) founderName = fm[1];

      const sectors = findSectors(text);

      let website = "";
      const linkEl = $el.find('a[href^="http"]').first();
      if (linkEl.length) {
        const href = linkEl.attr("href");
        if (href && !href.includes("twitter") && !href.includes("linkedin") && !href.includes("facebook")) website = href;
      }

      const linkedin = findLinkedIn($el);

      companies.push({
        name: founderName || "", company_name: companyName, investor_type: "Startup",
        region: "", sectors, tags: ["Portfolio Company"],
        portfolio: [companyName], thesis: "",
        emails: [], email_details: [], email_score: 0,
        linkedin: linkedin.map(l => l.url), linkedin_details: linkedin,
        linkedin_score: linkedin.reduce((s, l) => s + l.score, 0),
        phones: [], latest_year: findLatestYear(text),
        is_fresh: (findLatestYear(text) || 0) >= 2024,
        description: founderName ? `Founder: ${founderName}` : "",
        website: website || url, source_url: url, crawl_type: "portfolio_company"
      });
      found = true;
    });

    if (found) break;
  }

  return companies.slice(0, 30);
}

function extractInvestorData($, url) {
  const text = cleanText($("body").text());
  const jsonLd = findJsonLd($);
  const og = findOpenGraph($);

  const name = findName($, text) || (jsonLd.founders && jsonLd.founders[0]) || "";
  const company_name = findCompany($, url, jsonLd, og);
  let investor_type = findInvestorType(text + " " + (jsonLd.industry || ""));

  if (company_name) {
    const cn = company_name.toLowerCase();
    if (/\bventures?\b|\bcapital\b|\bvc\b|\bventure\b/.test(cn)) investor_type = "Venture Capital";
    else if (/\bfamily office\b|\bfamily fund\b/.test(cn)) investor_type = "Family Fund";
    else if (/\bprivate equity\b|\bpe\b/.test(cn)) investor_type = "Private Equity";
    else if (/\bangel\b|\bangels\b/.test(cn)) investor_type = "Angel Investor";
  }

  const region = findRegion(text + " " + (jsonLd.address || ""));
  const sectors = findSectors(text + " " + (jsonLd.description || "") + " " + (jsonLd.industry || ""));
  const tags = findTags(text);
  const portfolio = findPortfolio(text);
  const thesis = findThesis(text);
  const emailDetails = findEmails($, text, url, jsonLd);
  const linkedinDetails = findLinkedIn($, jsonLd);
  const phones = findPhones(text + " " + (jsonLd.phone || ""));

  const emails = emailDetails.map(e => e.email);
  const email_score = emailDetails.reduce((s, e) => s + e.score, 0);
  const linkedin = linkedinDetails.map(l => l.url);
  const linkedin_score = linkedinDetails.reduce((s, l) => s + l.score, 0);

  const latestYear = findLatestYear(text);
  const isFresh = !!(latestYear && latestYear >= 2024);

  return {
    name, company_name, investor_type, region, sectors, tags, portfolio, thesis,
    emails, email_details: emailDetails, email_score,
    linkedin, linkedin_details: linkedinDetails, linkedin_score,
    phones, latest_year: latestYear, is_fresh: isFresh,
    description: jsonLd.description || og.description || "",
    website: jsonLd.url || url, source_url: url,
    crawl_type: (investor_type || sectors.length || tags.length || emails.length || linkedin.length) ? "potential_investor_page" : "general_page"
  };
}

function extractMultipleInvestors($, url) {
  const base = extractInvestorData($, url);
  const teamMembers = extractTeamMembers($, url, base);

  if (teamMembers.length > 0) {
    const hasFirmData = (base.emails && base.emails.length > 0) || base.description;
    const hasCompanyOrName = base.company_name || base.name;
    if (hasFirmData && hasCompanyOrName) return [base, ...teamMembers];
    return teamMembers;
  }

  return [base];
}

module.exports = { extractInvestorData, extractMultipleInvestors, extractPortfolioCompanies };