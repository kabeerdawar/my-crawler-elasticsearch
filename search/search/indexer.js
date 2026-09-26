const {
  client,
  CONTACTS_INDEX,
  COMPANIES_INDEX,
} = require('./es-client');

/**
 * Index a single contact
 */
async function indexContact(contact) {
  if (!contact.email) throw new Error('Contact must have email');

  const doc = {
    email: contact.email.toLowerCase().trim(),
    name: contact.name || null,
    title: contact.title || null,
    seniority: contact.seniority || null,
    department: contact.department || null,
    phone: contact.phone || null,
    linkedin: contact.linkedin || null,
    confidence: contact.confidence || 0,
    grade: contact.grade || 'F',
    verified: contact.verified || false,
    source: contact.source || 'unknown',
    sourceUrl: contact.sourceUrl || null,
    company: contact.company || {},
    crawledAt: contact.crawledAt || new Date().toISOString(),
  };

  await client.index({
    index: CONTACTS_INDEX,
    id: doc.email, // Use email as ID for dedup
    document: doc,
    refresh: false,
  });

  return doc;
}

/**
 * Bulk index multiple contacts
 */
async function bulkIndexContacts(contacts) {
  if (!contacts || contacts.length === 0) return { indexed: 0 };

  const operations = contacts.flatMap((contact) => {
    if (!contact.email) return [];
    const doc = {
      email: contact.email.toLowerCase().trim(),
      name: contact.name || null,
      title: contact.title || null,
      seniority: contact.seniority || null,
      department: contact.department || null,
      phone: contact.phone || null,
      linkedin: contact.linkedin || null,
      confidence: contact.confidence || 0,
      grade: contact.grade || 'F',
      verified: contact.verified || false,
      source: contact.source || 'unknown',
      sourceUrl: contact.sourceUrl || null,
      company: contact.company || {},
      crawledAt: contact.crawledAt || new Date().toISOString(),
    };
    return [
      { index: { _index: CONTACTS_INDEX, _id: doc.email } },
      doc,
    ];
  });

  if (operations.length === 0) return { indexed: 0 };

  const result = await client.bulk({ operations, refresh: true });

  return {
    indexed: operations.length / 2,
    errors: result.errors,
    items: result.items.length,
  };
}

/**
 * Index a single company
 */
async function indexCompany(company) {
  if (!company.domain) throw new Error('Company must have domain');

  const doc = {
    name: company.name || null,
    domain: company.domain.toLowerCase().trim(),
    industry: company.industry || null,
    size: company.size || null,
    revenue: company.revenue || null,
    location: company.location || null,
    website: company.website || null,
    description: company.description || null,
    techStack: company.techStack || [],
    crawledAt: company.crawledAt || new Date().toISOString(),
  };

  await client.index({
    index: COMPANIES_INDEX,
    id: doc.domain,
    document: doc,
    refresh: false,
  });

  return doc;
}

async function bulkIndexCompanies(companies) {
  if (!companies || companies.length === 0) return { indexed: 0 };

  const operations = companies.flatMap((company) => {
    if (!company.domain) return [];
    const doc = {
      name: company.name || null,
      domain: company.domain.toLowerCase().trim(),
      industry: company.industry || null,
      size: company.size || null,
      revenue: company.revenue || null,
      location: company.location || null,
      website: company.website || null,
      description: company.description || null,
      techStack: company.techStack || [],
      crawledAt: company.crawledAt || new Date().toISOString(),
    };
    return [
      { index: { _index: COMPANIES_INDEX, _id: doc.domain } },
      doc,
    ];
  });

  if (operations.length === 0) return { indexed: 0 };

  const result = await client.bulk({ operations, refresh: true });

  return {
    indexed: operations.length / 2,
    errors: result.errors,
    items: result.items.length,
  };
}

/**
 * Count documents in an index
 */
async function countDocuments(indexName) {
  const result = await client.count({ index: indexName });
  return result.count;
}

module.exports = {
  indexContact,
  bulkIndexContacts,
  indexCompany,
  bulkIndexCompanies,
  countDocuments,
};