const { client, CONTACTS_INDEX } = require('./es-client');
const { embed } = require('./embeddings');

/**
 * Pure semantic search (kNN only)
 * Best for natural language queries
 */
async function semanticSearch(queryText, options = {}) {
  const queryVector = await embed(queryText);

  const knn = {
    field: 'embedding',
    query_vector: queryVector,
    k: options.size || 10,
    num_candidates: options.numCandidates || 100,
  };

  const body = {
    size: options.size || 10,
    knn,
    _source: { excludes: ['embedding'] },
  };

  if (options.onlyVerified) {
    knn.filter = { term: { verified: true } };
  }

  const result = await client.search({
    index: CONTACTS_INDEX,
    body,
  });

  return result.hits.hits.map((h) => ({
    score: h._score,
    ...h._source,
  }));
}

/**
 * HYBRID search — combines keyword + semantic
 * Best for production — Apollo uses this
 */
async function hybridSearch(queryText, options = {}) {
  const queryVector = await embed(queryText);
  const minConfidence = options.minConfidence || 0;

  const filters = [];
  if (options.onlyVerified) filters.push({ term: { verified: true } });
  if (minConfidence > 0) filters.push({ range: { confidence: { gte: minConfidence } } });

  const result = await client.search({
    index: CONTACTS_INDEX,
    size: options.size || 10,
    query: {
      bool: {
        should: [
          {
            multi_match: {
              query: queryText,
              fields: ['name^5', 'title^3', 'company.name^2', 'company.industry'],
              fuzziness: 'AUTO',
            },
          },
        ],
        filter: filters,
      },
    },
    knn: {
      field: 'embedding',
      query_vector: queryVector,
      k: options.knnK || 50,
      num_candidates: 100,
      boost: options.semanticBoost || 0.5,
      filter: filters.length > 0 ? { bool: { filter: filters } } : undefined,
    },
    _source: { excludes: ['embedding'] },
  });

  return {
    total: result.hits.total.value,
    took: result.took,
    hits: result.hits.hits.map((h) => ({
      score: h._score,
      ...h._source,
    })),
  };
}

/**
 * Find similar contacts — "more like this"
 */
async function findSimilar(email, options = {}) {
  // Get the source contact's embedding
  const source = await client.get({
    index: CONTACTS_INDEX,
    id: email.toLowerCase().trim(),
    _source: ['embedding'],
  });

  const embedding = source._source.embedding;
  if (!embedding) throw new Error('Contact has no embedding');

  const result = await client.search({
    index: CONTACTS_INDEX,
    size: options.size || 5,
    knn: {
      field: 'embedding',
      query_vector: embedding,
      k: (options.size || 5) + 1,
      num_candidates: 100,
    },
    _source: { excludes: ['embedding'] },
  });

  return result.hits.hits
    .filter((h) => h._id !== email.toLowerCase().trim())
    .slice(0, options.size || 5)
    .map((h) => ({
      score: h._score,
      ...h._source,
    }));
}

module.exports = {
  semanticSearch,
  hybridSearch,
  findSimilar,
};