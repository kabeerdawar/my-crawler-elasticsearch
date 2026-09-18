// deduplicator.js
// Union-Find based deduplication — merges records sharing ANY identifier

function normalize(v) {
  return String(v || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").trim();
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

// Generate all identifiers for a record
function getIdentifiers(record) {
  const ids = [];
  const domain = getDomain(record.source_url);
  const name = normalize(record.name);
  const company = normalize(record.company_name);

  // Email
  for (const email of (record.emails || [])) {
    const n = normalize(email);
    if (n) ids.push(`email:${n}`);
  }

  // LinkedIn
  for (const li of (record.linkedin || [])) {
    const n = normalize(li);
    if (n) ids.push(`li:${n}`);
  }

  // Name (only if 2+ words, looks like a person)
  if (name && name.split(/\s+/).length >= 2 && name.length > 4) {
    ids.push(`name:${name}`);
  }

  // Company + domain
  if (company && domain) ids.push(`cd:${company}|${domain}`);

  // Domain only (firm-level records)
  if (!name && company && domain) ids.push(`domain:${domain}`);

  return ids;
}

// Union-Find
class UnionFind {
  constructor() { this.parent = new Map(); }
  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)));
    return this.parent.get(x);
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function deduplicateInvestors(records) {
  const uf = new UnionFind();

  // Step 1: Link all records that share ANY identifier
  const identifierToRecords = new Map();

  records.forEach((record, idx) => {
    uf.find(`rec:${idx}`);
    const ids = getIdentifiers(record);
    for (const id of ids) {
      if (!identifierToRecords.has(id)) identifierToRecords.set(id, []);
      identifierToRecords.get(id).push(`rec:${idx}`);
    }
  });

  // Union all records that share an identifier
  for (const [id, recIds] of identifierToRecords.entries()) {
    for (let i = 1; i < recIds.length; i++) {
      uf.union(recIds[0], recIds[i]);
    }
  }

  // Step 2: Group by root
  const groups = new Map();
  records.forEach((record, idx) => {
    const root = uf.find(`rec:${idx}`);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(record);
  });

  // Step 3: Merge each group
  const uniqueRecords = [];
  for (const group of groups.values()) {
    const record = mergeRecords(group);
    record.confidence = group.length >= 2 ? "HIGH" : "MEDIUM";
    record.source_count = group.length;
    record.all_sources = [...new Set(group.map(r => r.source_url).filter(Boolean))];
    record.last_verified_at = new Date().toISOString();
    uniqueRecords.push(record);
  }

  return uniqueRecords;
}

function mergeRecords(group) {
  // Prefer the record with the most data as base
  group.sort((a, b) => {
    const scoreA = (a.emails?.length || 0) * 10 + (a.linkedin?.length || 0) * 5 + (a.name ? 3 : 0) + (a.company_name ? 2 : 0);
    const scoreB = (b.emails?.length || 0) * 10 + (b.linkedin?.length || 0) * 5 + (b.name ? 3 : 0) + (b.company_name ? 2 : 0);
    return scoreB - scoreA;
  });

  const base = { ...group[0] };

  for (let i = 1; i < group.length; i++) {
    const r = group[i];
    base.emails = [...new Set([...(base.emails || []), ...(r.emails || [])])].slice(0, 3);
    base.linkedin = [...new Set([...(base.linkedin || []), ...(r.linkedin || [])])].slice(0, 5);
    base.sectors = [...new Set([...(base.sectors || []), ...(r.sectors || [])])];
    base.tags = [...new Set([...(base.tags || []), ...(r.tags || [])])];
    base.name = base.name || r.name;
    base.company_name = base.company_name || r.company_name;
    base.investor_type = base.investor_type || r.investor_type;
    base.region = base.region || r.region;
    base.hq_city = base.hq_city || r.hq_city;
    base.description = base.description || r.description;
    base.email_score = Math.max(base.email_score || 0, r.email_score || 0);
    base.linkedin_score = Math.max(base.linkedin_score || 0, r.linkedin_score || 0);
    base.investor_score = Math.max(base.investor_score || 0, r.investor_score || 0);
    base.is_fresh = base.is_fresh || r.is_fresh;
    base.latest_year = Math.max(base.latest_year || 0, r.latest_year || 0) || null;

    if (base.email_details && r.email_details) {
      const all = [...base.email_details, ...r.email_details];
      const seen = new Set();
      base.email_details = all.filter(e => { if (seen.has(e.email)) return false; seen.add(e.email); return true; }).slice(0, 3);
    }
    if (base.linkedin_details && r.linkedin_details) {
      const all = [...base.linkedin_details, ...r.linkedin_details];
      const seen = new Set();
      base.linkedin_details = all.filter(l => { if (seen.has(l.url)) return false; seen.add(l.url); return true; }).slice(0, 5);
    }
  }

  return base;
}

module.exports = { deduplicateInvestors };