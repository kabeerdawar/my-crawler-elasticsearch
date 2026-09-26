const { client, CONTACTS_INDEX, COMPANIES_INDEX } = require('./es-client');
const { embedContact } = require('./embeddings');

function buildContactDoc(contact, embedding) {
  return {
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
    embedding: embedding || null,
  };
}

/**
 * Bulk index with automatic embeddings
 * (generates embeddings for each contact before indexing)
 */
async function bulkIndexContacts(contacts, options = {}) {
  if (!contacts || contacts.length === 0) return { indexed: 0 };

  const generateEmbeddings = options.generateEmbeddings !== false;
  console.log(`Generating embeddings for ${contacts.length} contacts...`);

  const operations = [];
  let embeddingsGenerated = 0;

  for (const contact of contacts) {
    if (!contact.email) continue;

    let embedding = contact.embedding || null;

    if (!embedding && generateEmbeddings) {
      embedding = await embedContact(contact);
      if (embedding) embeddingsGenerated++;
    }

    const doc = buildContactDoc(contact, embedding);
    operations.push({ index: { _index: CONTACTS_INDEX, _id: doc.email } });
    operations.push(doc);
  }

  if (operations.length === 0) return { indexed: 0 };

  const result = await client.bulk({ operations, refresh: true });

  return {
    indexed: operations.length / 2,
    embeddingsGenerated,
    errors: result.errors,
  };
}

async function indexContact(contact) {
  const embedding = await embedContact(contact);
  const doc = buildContactDoc(contact, embedding);
  await client.index({
    index: CONTACTS_INDEX,
    id: doc.email,
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

  const result = await client.bulk({ operations, refresh: true });
  return { indexed: operations.length / 2, errors: result.errors };
}

async function countDocuments(indexName) {
  const result = await client.count({ index: indexName });
  return result.count;
}

module.exports = {
  indexContact,
  bulkIndexContacts,
  bulkIndexCompanies,
  countDocuments,
};