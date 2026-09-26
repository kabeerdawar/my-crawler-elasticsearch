const { client, CONTACTS_INDEX } = require('./es-client');

/**
 * WEIGHTED MULTI-MATCH SEARCH
 * Apollo-style ranking — name > title > company
 */
async function rankedSearch(query, options = {}) {
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: options.size || 20,
    query: {
      bool: {
        should: [
          {
            multi_match: {
              query,
              fields: ['name^5', 'title^3', 'company.name^2', 'company.industry^1.5'],
              type: 'best_fields',
              fuzziness: 'AUTO',
              prefix_length: 1,
            },
          },
        ],
        minimum_should_match: 1,
        filter: options.onlyVerified ? [{ term: { verified: true } }] : [],
      },
    },
    highlight: {
      fields: {
        name: {},
        title: {},
        'company.name': {},
      },
    },
  });

  return result.hits.hits.map((h) => ({
    score: h._score,
    highlights: h.highlight,
    ...h._source,
  }));
}

/**
 * FUZZY SEARCH — typo tolerance
 * "Sathya" → "Satya"
 */
async function fuzzySearch(query, options = {}) {
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: options.size || 20,
    query: {
      bool: {
        should: [
          {
            multi_match: {
              query,
              fields: ['name', 'title', 'company.name'],
              fuzziness: 2,
              prefix_length: 1,
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  });

  return result.hits.hits.map((h) => ({
    score: h._score,
    ...h._source,
  }));
}

/**
 * AUTOCOMPLETE — suggestions as user types
 */
async function autocomplete(prefix, options = {}) {
  const field = options.field || 'name.autocomplete';
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: options.size || 10,
    _source: ['name', 'email', 'title', 'company.name'],
    query: {
      match: {
        [field]: {
          query: prefix.toLowerCase(),
        },
      },
    },
  });

  return result.hits.hits.map((h) => ({
    value: h._source.name || h._source['company.name'] || h._source.email,
    label: h._source.name
      ? `${h._source.name} — ${h._source.title || ''} @ ${h._source.company?.name || ''}`
      : h._source['company.name'] || h._source.email,
    ...h._source,
  }));
}

/**
 * FACETS / AGGREGATIONS — Apollo-style sidebar filters
 */
async function getFacets(query = null) {
  const body = {
    size: 0,
    aggs: {
      by_grade: { terms: { field: 'grade', size: 10 } },
      by_industry: { terms: { field: 'company.industry', size: 20 } },
      by_location: { terms: { field: 'company.location', size: 20 } },
      by_seniority: { terms: { field: 'seniority', size: 10 } },
      by_department: { terms: { field: 'department', size: 10 } },
      company_size_ranges: {
        range: {
          field: 'company.size',
          ranges: [
            { key: '1-50', to: 50 },
            { key: '50-500', from: 50, to: 500 },
            { key: '500-5000', from: 500, to: 5000 },
            { key: '5000+', from: 5000 },
          ],
        },
      },
      verified_count: { filter: { term: { verified: true } } },
      avg_confidence: { avg: { field: 'confidence' } },
    },
  };

  if (query) {
    body.query = {
      multi_match: {
        query,
        fields: ['name', 'title', 'company.name'],
        fuzziness: 'AUTO',
      },
    };
  }

  const result = await client.search({
    index: CONTACTS_INDEX,
    body,
  });

  return {
    total: result.hits.total.value,
    grade: result.aggregations.by_grade.buckets,
    industry: result.aggregations.by_industry.buckets,
    location: result.aggregations.by_location.buckets,
    seniority: result.aggregations.by_seniority.buckets,
    department: result.aggregations.by_department.buckets,
    companySize: result.aggregations.company_size_ranges.buckets,
    verifiedCount: result.aggregations.verified_count.doc_count,
    avgConfidence: result.aggregations.avg_confidence.value,
  };
}

/**
 * FILTERED SEARCH — combine text + filters
 */
async function filteredSearch({ query, industry, location, seniority, department, minCompanySize, maxCompanySize, minConfidence = 0, onlyVerified = false, size = 20 } = {}) {
  const must = [];
  const filter = [];

  if (query) {
    must.push({
      multi_match: {
        query,
        fields: ['name^5', 'title^3', 'company.name^2'],
        fuzziness: 'AUTO',
      },
    });
  }

  if (industry) filter.push({ term: { 'company.industry': industry } });
  if (location) filter.push({ term: { 'company.location': location } });
  if (seniority) filter.push({ term: { seniority } });
  if (department) filter.push({ term: { department } });
  if (onlyVerified) filter.push({ term: { verified: true } });
  if (minConfidence > 0) filter.push({ range: { confidence: { gte: minConfidence } } });

  if (minCompanySize || maxCompanySize) {
    const range = {};
    if (minCompanySize) range.gte = minCompanySize;
    if (maxCompanySize) range.lte = maxCompanySize;
    filter.push({ range: { 'company.size': range } });
  }

  const result = await client.search({
    index: CONTACTS_INDEX,
    size,
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    sort: must.length > 0 ? [{ _score: 'desc' }] : [{ confidence: 'desc' }],
  });

  return {
    total: result.hits.total.value,
    took: result.took,
    hits: result.hits.hits.map((h) => ({ score: h._score, ...h._source })),
  };
}

module.exports = {
  rankedSearch,
  fuzzySearch,
  autocomplete,
  getFacets,
  filteredSearch,
};