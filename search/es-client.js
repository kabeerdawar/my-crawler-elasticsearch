const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: 'http://localhost:9200',
  maxRetries: 3,
  requestTimeout: 30000,
});

const CONTACTS_INDEX = 'contacts';
const COMPANIES_INDEX = 'companies';

async function createContactsIndex() {
  const exists = await client.indices.exists({ index: CONTACTS_INDEX });
  if (exists) {
    await client.indices.delete({ index: CONTACTS_INDEX });
  }

  await client.indices.create({
    index: CONTACTS_INDEX,
    body: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            autocomplete_analyzer: {
              type: 'custom',
              tokenizer: 'autocomplete_tokenizer',
              filter: ['lowercase'],
            },
            autocomplete_search_analyzer: {
              type: 'custom',
              tokenizer: 'keyword',
              filter: ['lowercase'],
            },
          },
          tokenizer: {
            autocomplete_tokenizer: {
              type: 'edge_ngram',
              min_gram: 2,
              max_gram: 15,
              token_chars: ['letter', 'digit'],
            },
          },
        },
      },
      mappings: {
        properties: {
          email: { type: 'keyword' },
          name: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_analyzer',
                search_analyzer: 'autocomplete_search_analyzer',
              },
            },
          },
          title: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_analyzer',
                search_analyzer: 'autocomplete_search_analyzer',
              },
            },
          },
          seniority: { type: 'keyword' },
          department: { type: 'keyword' },
          phone: { type: 'keyword' },
          linkedin: { type: 'keyword' },
          confidence: { type: 'integer' },
          grade: { type: 'keyword' },
          verified: { type: 'boolean' },
          source: { type: 'keyword' },
          sourceUrl: { type: 'keyword' },
          embedding: {
            type: 'dense_vector',
            dims: 384,
            index: true,
            similarity: 'cosine',
          },
          company: {
            type: 'object',
            properties: {
              name: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                  autocomplete: {
                    type: 'text',
                    analyzer: 'autocomplete_analyzer',
                    search_analyzer: 'autocomplete_search_analyzer',
                  },
                },
              },
              domain: { type: 'keyword' },
              industry: { type: 'keyword' },
              size: { type: 'integer' },
              revenue: { type: 'long' },
              location: { type: 'keyword' },
            },
          },
          crawledAt: { type: 'date' },
        },
      },
    },
  });

  console.log(`Index "${CONTACTS_INDEX}" created`);
}

async function createCompaniesIndex() {
  const exists = await client.indices.exists({ index: COMPANIES_INDEX });
  if (exists) {
    await client.indices.delete({ index: COMPANIES_INDEX });
  }

  await client.indices.create({
    index: COMPANIES_INDEX,
    body: {
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        properties: {
          name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          domain: { type: 'keyword' },
          industry: { type: 'keyword' },
          size: { type: 'integer' },
          revenue: { type: 'long' },
          location: { type: 'keyword' },
          website: { type: 'keyword' },
          description: { type: 'text' },
          techStack: { type: 'keyword' },
          crawledAt: { type: 'date' },
        },
      },
    },
  });

  console.log(`Index "${COMPANIES_INDEX}" created`);
}

async function deleteAllIndexes() {
  try {
    await client.indices.delete({ index: [CONTACTS_INDEX, COMPANIES_INDEX] });
    console.log('Deleted all indexes');
  } catch (err) {
    if (err.meta && err.meta.statusCode === 404) {
      console.log('Indexes not found');
    } else {
      throw err;
    }
  }
}

async function getClusterHealth() {
  return client.cluster.health();
}

module.exports = {
  client,
  CONTACTS_INDEX,
  COMPANIES_INDEX,
  createContactsIndex,
  createCompaniesIndex,
  deleteAllIndexes,
  getClusterHealth,
};