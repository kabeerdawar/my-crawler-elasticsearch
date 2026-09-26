// entity-resolver.js
// 🎯 Apollo-level: Cross-source entity resolution with Union-Find

const Fuse = require("fuse.js");

function normalizeCompanyName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|pvt|private|plc|co|company)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePersonName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

function isSameEntity(a, b) {
  const aEmails = new Set((a.emails || []).map(e => e.toLowerCase()));
  const bEmails = new Set((b.emails || []).map(e => e.toLowerCase()));
  for (const e of aEmails) {
    if (bEmails.has(e)) return { match: true, reason: "email", confidence: 100 };
  }

  const aDomain = normalizeDomain(a.source_url);
  const bDomain = normalizeDomain(b.source_url);
  const aName = normalizePersonName(a.name);
  const bName = normalizePersonName(b.name);

  if (aDomain && aDomain === bDomain && aName && aName === bName) {
    return { match: true, reason: "domain+person", confidence: 95 };
  }

  const aCompany = normalizeCompanyName(a.company_name);
  const bCompany = normalizeCompanyName(b.company_name);

  if (aCompany && aCompany === bCompany && aDomain && aDomain === bDomain) {
    return { match: true, reason: "company+domain", confidence: 90 };
  }

  const aLi = new Set((a.linkedin || []).map(l => l.replace(/\/$/, "")));
  const bLi = new Set((b.linkedin || []).map(l => l.replace(/\/$/, "")));
  for (const l of aLi) {
    if (bLi.has(l)) return { match: true, reason: "linkedin", confidence: 95 };
  }

  if (aCompany && bCompany) {
    const fuse = new Fuse([aCompany], { threshold: 0.2, includeScore: true });
    const results = fuse.search(bCompany);
    if (results.length > 0 && results[0].score < 0.2) {
      if (aName && bName && aName === bName) {
        return { match: true, reason: "fuzzy+person", confidence: 75 };
      }
    }
  }

  return { match: false };
}

function mergeRecords(a, b) {
  const merged = { ...a };

  merged.emails = [...new Set([...(a.emails || []), ...(b.emails || [])])];
  merged.phones = [...new Set([...(a.phones || []), ...(b.phones || [])])];
  merged.linkedin = [...new Set([...(a.linkedin || []), ...(b.linkedin || [])])];
  merged.source_urls = [...new Set([...(a.source_urls || [a.source_url]), ...(b.source_urls || [b.source_url])])];

  const emailMap = new Map();
  for (const e of [...(a.email_details || []), ...(b.email_details || [])]) {
    if (!e.email) continue;
    const key = e.email.toLowerCase();
    if (!emailMap.has(key) || (e.score || 0) > (emailMap.get(key).score || 0)) {
      emailMap.set(key, e);
    }
  }
  merged.email_details = [...emailMap.values()];

  merged.company_name = (a.company_name && a.company_name.length > (b.company_name || "").length)
    ? a.company_name : (b.company_name || a.company_name);
  merged.name = a.name || b.name;
  merged.description = (a.description && a.description.length > (b.description || "").length)
    ? a.description : (b.description || a.description);

  merged.email_score = Math.max(a.email_score || 0, b.email_score || 0);
  merged.linkedin_score = Math.max(a.linkedin_score || 0, b.linkedin_score || 0);
  merged.investor_score = Math.max(a.investor_score || 0, b.investor_score || 0);

  merged.last_verified_date = new Date().toISOString();

  return merged;
}

async function resolveEntities(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  console.log(`🔗 Entity resolution: ${records.length} raw records`);

  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const union = (x, y) => {
    const px = find(x), py = find(y);
    if (px !== py) parent.set(px, py);
  };

  let merges = 0;
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const result = isSameEntity(records[i], records[j]);
      if (result.match) {
        union(i, j);
        merges++;
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < records.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(records[i]);
  }

  console.log(`   → Merged into ${groups.size} groups (${merges} merges)`);

  const resolved = [];
  for (const group of groups.values()) {
    let merged = group[0];
    for (let i = 1; i < group.length; i++) {
      merged = mergeRecords(merged, group[i]);
    }
    resolved.push(merged);
  }

  return resolved;
}

module.exports = {
  resolveEntities,
  isSameEntity,
  mergeRecords,
  normalizeCompanyName,
  normalizePersonName,
  normalizeDomain
};