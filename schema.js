// schema.js
// Bulletproof lenient validation

function cleanRecord(raw) {
  if (!raw) return null;
  const r = { ...raw };

  r.name = typeof r.name === "string" ? r.name : "";
  r.company_name = typeof r.company_name === "string" ? r.company_name : "";
  r.investor_type = typeof r.investor_type === "string" ? r.investor_type : "";
  r.region = typeof r.region === "string" ? r.region : "";
  r.description = typeof r.description === "string" ? r.description : "";
  r.website = typeof r.website === "string" ? r.website : "";
  r.crawl_type = typeof r.crawl_type === "string" ? r.crawl_type : "general_page";
  r.source_url = typeof r.source_url === "string" ? r.source_url : "";

  r.sectors = Array.isArray(r.sectors) ? r.sectors.filter(s => typeof s === "string" && s.trim()) : [];
  r.tags = Array.isArray(r.tags) ? r.tags.filter(s => typeof s === "string" && s.trim()) : [];
  r.cities = Array.isArray(r.cities) ? r.cities.filter(s => typeof s === "string" && s.trim()) : [];
  r.phones = Array.isArray(r.phones) ? r.phones.filter(s => typeof s === "string" && s.trim()) : [];

  r.emails = Array.isArray(r.emails)
    ? r.emails.filter(e => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    : [];

  r.email_details = Array.isArray(r.email_details)
    ? r.email_details.filter(e => e && typeof e.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email))
    : [];

  r.email_score = typeof r.email_score === "number" ? r.email_score : 0;

  r.linkedin = Array.isArray(r.linkedin)
    ? r.linkedin.filter(u => typeof u === "string" && u.startsWith("http"))
    : [];

  r.linkedin_details = Array.isArray(r.linkedin_details)
    ? r.linkedin_details.filter(l => l && typeof l.url === "string" && l.url.startsWith("http"))
    : [];

  r.linkedin_score = typeof r.linkedin_score === "number" ? r.linkedin_score : 0;
  r.investor_score = typeof r.investor_score === "number" ? r.investor_score : 0;
  r.latest_year = typeof r.latest_year === "number" ? r.latest_year : null;
  r.is_fresh = typeof r.is_fresh === "boolean" ? r.is_fresh : false;
  r.hq_city = typeof r.hq_city === "string" ? r.hq_city : null;

  return r;
}

function validateRecord(record) {
  const cleaned = cleanRecord(record);
  if (!cleaned) return null;
  if (!cleaned.source_url || !cleaned.source_url.startsWith("http")) return null;
  return cleaned;
}

function validateMany(records) {
  const valid = [];
  let invalidCount = 0;
  for (const r of records) {
    const v = validateRecord(r);
    if (v) valid.push(v);
    else invalidCount++;
  }
  return { valid, invalidCount };
}

module.exports = { validateRecord, validateMany, cleanRecord };