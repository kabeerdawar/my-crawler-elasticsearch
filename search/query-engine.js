const { client, CONTACTS_INDEX } = require('./es-client');

async function findVerifiedContacts({ grade, minConfidence = 80, size = 20 } = {}) {
  const must = [
    { term: { verified: true } },
    { range: { confidence: { gte: minConfidence } } },
  ];
  if (grade) must.push({ term: { grade } });

  const result = await client.search({
    index: CONTACTS_INDEX,
    size,
    query: { bool: { must } },
    sort: [{ confidence: 'desc' }],
  });

  return result.hits.hits.map((h) => h._source);
}

async function findByCompanyDomain(domain, options = {}) {
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: options.size || 50,
    query: {
      bool: {
        must: [{ term: { 'company.domain': domain.toLowerCase().trim() } }],
      },
    },
    sort: [{ confidence: 'desc' }],
  });

  return result.hits.hits.map((h) => h._source);
}

async function searchByText(query, options = {}) {
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: options.size || 20,
    query: {
      bool: {
        should: [
          { match: { name: { query, boost: 3 } } },
          { match: { title: { query, boost: 2 } } },
          { match: { 'company.name': { query, boost: 2 } } },
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

async function powerQuery({
  title,
  seniority,
  department,
  industry,
  minCompanySize,
  maxCompanySize,
  location,
  minConfidence = 80,
  onlyVerified = true,
  size = 20,
} = {}) {
  const must = [];

  if (onlyVerified) must.push({ term: { verified: true } });
  must.push({ range: { confidence: { gte: minConfidence } } });

  if (title) must.push({ match: { title } });
  if (seniority) must.push({ term: { seniority } });
  if (department) must.push({ term: { department } });
  if (industry) must.push({ term: { 'company.industry': industry } });
  if (location) must.push({ term: { 'company.location': location } });

  if (minCompanySize || maxCompanySize) {
    const range = {};
    if (minCompanySize) range.gte = minCompanySize;
    if (maxCompanySize) range.lte = maxCompanySize;
    must.push({ range: { 'company.size': range } });
  }

  const result = await client.search({
    index: CONTACTS_INDEX,
    size,
    query: { bool: { must } },
    sort: [{ confidence: 'desc' }, { 'company.size': 'desc' }],
  });

  return {
    total: result.hits.total.value,
    took: result.took,
    hits: result.hits.hits.map((h) => h._source),
  };
}

async function statsByGrade() {
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: 0,
    aggs: {
      by_grade: { terms: { field: 'grade' } },
      avg_confidence: { avg: { field: 'confidence' } },
      total_verified: { filter: { term: { verified: true } } },
    },
  });

  return {
    total: result.hits.total.value,
    byGrade: result.aggregations.by_grade.buckets,
    avgConfidence: result.aggregations.avg_confidence.value,
    totalVerified: result.aggregations.total_verified.doc_count,
  };
}

module.exports = {
  findVerifiedContacts,
  findByCompanyDomain,
  searchByText,
  powerQuery,
  statsByGrade,
};