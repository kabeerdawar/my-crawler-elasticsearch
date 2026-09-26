const es = require('./search/es-client');
const indexer = require('./search/indexer');
const sem = require('./search/semantic-search');

const SAMPLE = [
  { email: 'satya@microsoft.com', name: 'Satya Nadella', title: 'CEO', seniority: 'C-Level', department: 'Executive', confidence: 95, grade: 'A+', verified: true, source: 'apify', company: { name: 'Microsoft', domain: 'microsoft.com', industry: 'Software', size: 220000, location: 'Redmond' } },
  { email: 'sundar@google.com', name: 'Sundar Pichai', title: 'CEO', seniority: 'C-Level', department: 'Executive', confidence: 95, grade: 'A+', verified: true, source: 'apify', company: { name: 'Google', domain: 'google.com', industry: 'Software', size: 180000, location: 'Mountain View' } },
  { email: 'hello@stripe.com', name: null, title: 'Sales', department: 'Sales', confidence: 95, grade: 'A+', verified: true, source: 'apify', company: { name: 'Stripe', domain: 'stripe.com', industry: 'Fintech', size: 8000, location: 'San Francisco' } },
  { email: 'press@apple.com', name: null, title: 'Press', department: 'Marketing', confidence: 100, grade: 'A+', verified: true, source: 'local', company: { name: 'Apple', domain: 'apple.com', industry: 'Hardware', size: 160000, location: 'Cupertino' } },
  { email: 'john@acme.com', name: 'John Smith', title: 'VP of Sales', seniority: 'VP', department: 'Sales', confidence: 95, grade: 'A+', verified: true, source: 'apify', company: { name: 'Acme Corp', domain: 'acme.com', industry: 'Software', size: 150, location: 'New York' } },
  { email: 'priya@startup.io', name: 'Priya Sharma', title: 'CTO', seniority: 'C-Level', department: 'Engineering', confidence: 95, grade: 'A+', verified: true, source: 'apify', company: { name: 'Startup.io', domain: 'startup.io', industry: 'SaaS', size: 75, location: 'Bangalore' } },
  { email: 'rahul@fintech.com', name: 'Rahul Verma', title: 'VP of Engineering', seniority: 'VP', department: 'Engineering', confidence: 92, grade: 'A+', verified: true, source: 'apify', company: { name: 'FinTech Co', domain: 'fintech.com', industry: 'Fintech', size: 300, location: 'Mumbai' } },
  { email: 'emily@designco.com', name: 'Emily Chen', title: 'Head of Design', seniority: 'Head', department: 'Design', confidence: 90, grade: 'A+', verified: true, source: 'apify', company: { name: 'DesignCo', domain: 'designco.com', industry: 'Design', size: 40, location: 'Berlin' } },
];

async function main() {
  console.log('=== SEMANTIC SEARCH TEST ===\n');

  await es.deleteAllIndexes();
  await es.createContactsIndex();
  await es.createCompaniesIndex();

  console.log('--- Indexing with embeddings ---');
  const result = await indexer.bulkIndexContacts(SAMPLE);
  console.log(`Indexed: ${result.indexed} contacts (embeddings generated: ${result.embeddingsGenerated})\n`);

  await new Promise((r) => setTimeout(r, 1500));

  console.log('1. SEMANTIC — "fintech leaders"\n');
  const r1 = await sem.semanticSearch('fintech leaders', { onlyVerified: true });
  r1.forEach((c) => console.log(`   Score: ${c.score.toFixed(3)} | ${c.name || c.email} | ${c.title || ''} @ ${c.company.name || ''} (${c.company.industry || ''})`));
  console.log('');

  console.log('2. SEMANTIC — "engineering executive in India"\n');
  const r2 = await sem.semanticSearch('engineering executive in India', { onlyVerified: true });
  r2.forEach((c) => console.log(`   Score: ${c.score.toFixed(3)} | ${c.name || c.email} | ${c.title || ''} @ ${c.company.name || ''} (${c.company.location || ''})`));
  console.log('');

  console.log('3. SEMANTIC — "creative design lead at small startup"\n');
  const r3 = await sem.semanticSearch('creative design lead at small startup', { onlyVerified: true });
  r3.forEach((c) => console.log(`   Score: ${c.score.toFixed(3)} | ${c.name || c.email} | ${c.title || ''} @ ${c.company.name || ''}`));
  console.log('');

  console.log('4. SEMANTIC — "big tech CEO"\n');
  const r4 = await sem.semanticSearch('big tech CEO', { onlyVerified: true });
  r4.forEach((c) => console.log(`   Score: ${c.score.toFixed(3)} | ${c.name || c.email} | ${c.title || ''} @ ${c.company.name || ''}`));
  console.log('');

  console.log('5. HYBRID — "CEO software"\n');
  const r5 = await sem.hybridSearch('CEO software', { onlyVerified: true, size: 5 });
  console.log(`   Total: ${r5.total}, Took: ${r5.took}ms`);
  r5.hits.forEach((c) => console.log(`   Score: ${c.score.toFixed(3)} | ${c.name || c.email} | ${c.title} @ ${c.company.name}`));
  console.log('');

  console.log('6. SIMILAR TO satya@microsoft.com\n');
  const r6 = await sem.findSimilar('satya@microsoft.com', { size: 3 });
  r6.forEach((c) => console.log(`   Score: ${c.score.toFixed(3)} | ${c.name || c.email} | ${c.title} @ ${c.company.name}`));
  console.log('');

  console.log('=== COMPLETE ===');
}

main().catch(console.error);