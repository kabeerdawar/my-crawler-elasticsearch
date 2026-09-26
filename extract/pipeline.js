const { extractFromText, enrichContact } = require('./multi-field-extractor');
const { dedupeContacts, dedupeCompanies, resolveCompany } = require('./entity-resolver');

function processCrawlResults(rawResults) {
  const enriched = [];

  for (const raw of rawResults) {
    const extracted = extractFromText(raw.rawText || raw.text || '');
    const title = raw.title || extracted.title;
    const name = raw.name || extracted.name;

    const contact = {
      email: raw.email || (extracted.emails[0] || null),
      name,
      title,
      seniority: raw.seniority || extracted.seniority,
      department: raw.department || extracted.department,
      phone: raw.phone || extracted.phones[0] || null,
      linkedin: raw.linkedin || extracted.linkedin,
      confidence: raw.confidence || 0,
      grade: raw.grade || 'F',
      verified: raw.verified || false,
      source: raw.source || 'crawler',
      sourceUrl: raw.sourceUrl || null,
      company: {
        name: raw.company && raw.company.name ? resolveCompany(raw.company.name) : null,
        domain: raw.company && raw.company.domain ? raw.company.domain : null,
        industry: raw.company && raw.company.industry ? raw.company.industry : null,
        size: raw.company && raw.company.size ? raw.company.size : null,
        location: raw.company && raw.company.location ? raw.company.location : null,
      },
      crawledAt: raw.crawledAt || new Date().toISOString(),
    };

    if (contact.email) enriched.push(contact);
  }

  const deduped = dedupeContacts(enriched);
  return deduped;
}

module.exports = { processCrawlResults };