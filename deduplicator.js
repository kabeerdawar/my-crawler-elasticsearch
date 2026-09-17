// deduplicator.js

function normalize(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "")
    .trim();
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function deduplicateInvestors(records) {
  const groups = new Map();

  for (const record of records) {
    const domain = getDomain(record.source_url);
    const email = record.emails?.[0] ? normalize(record.emails[0]) : "";
    const linkedin = record.linkedin?.[0] ? normalize(record.linkedin[0]) : "";
    const company = normalize(record.company_name);

    // Priority: domain > email > linkedin > company
    let key;
    if (domain) key = `domain:${domain}`;
    else if (email) key = `email:${email}`;
    else if (linkedin) key = `li:${linkedin}`;
    else if (company) key = `c:${company}`;
    else continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const uniqueRecords = [];

  for (const [key, group] of groups.entries()) {
    const record = mergeRecords(group);
    record.confidence = group.length >= 2 ? "HIGH" : "MEDIUM";
    record.source_count = group.length;
    record.all_sources = [...new Set(group.map(r => r.source_url).filter(Boolean))];
    uniqueRecords.push(record);
  }

  return uniqueRecords;
}

function mergeRecords(group) {
  const base = { ...group[0] };

  for (let i = 1; i < group.length; i++) {
    const r = group[i];

    base.emails = [...new Set([...(base.emails || []), ...(r.emails || [])])].slice(0, 3);
    base.linkedin = [...new Set([...(base.linkedin || []), ...(r.linkedin || [])])].slice(0, 3);
    base.sectors = [...new Set([...(base.sectors || []), ...(r.sectors || [])])];
    base.tags = [...new Set([...(base.tags || []), ...(r.tags || [])])];

    base.name = base.name || r.name;
    base.company_name = base.company_name || r.company_name;
    base.investor_type = base.investor_type || r.investor_type;
    base.region = base.region || r.region;
    base.hq_city = base.hq_city || r.hq_city;

    base.email_score = Math.max(base.email_score || 0, r.email_score || 0);
    base.linkedin_score = Math.max(base.linkedin_score || 0, r.linkedin_score || 0);
    base.investor_score = Math.max(base.investor_score || 0, r.investor_score || 0);

    if (base.email_details && r.email_details) {
      const all = [...base.email_details, ...r.email_details];
      const seen = new Set();
      base.email_details = all.filter(e => {
        if (seen.has(e.email)) return false;
        seen.add(e.email);
        return true;
      }).slice(0, 3);
    }

    if (base.linkedin_details && r.linkedin_details) {
      const all = [...base.linkedin_details, ...r.linkedin_details];
      const seen = new Set();
      base.linkedin_details = all.filter(l => {
        if (seen.has(l.url)) return false;
        seen.add(l.url);
        return true;
      }).slice(0, 3);
    }

    base.is_fresh = base.is_fresh || r.is_fresh;
    base.latest_year = Math.max(base.latest_year || 0, r.latest_year || 0) || null;
  }

  return base;
}

module.exports = { deduplicateInvestors };