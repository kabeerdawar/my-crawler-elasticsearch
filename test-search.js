const es = require('./search/es-client');
const indexer = require('./search/indexer');
const query = require('./search/query-engine');

const SAMPLE_CONTACTS = [
  {
    email: 'satya@microsoft.com', name: 'Satya Nadella', title: 'CEO',
    seniority: 'C-Level', department: 'Executive', confidence: 95, grade: 'A+',
    verified: true, source: 'local + apify',
    company: { name: 'Microsoft', domain: 'microsoft.com', industry: 'Software', size: 220000, location: 'Redmond' },
  },
  {
    email: 'support@github.com', name: null, title: 'Support Team',
    seniority: null, department: 'Customer Support', confidence: 95, grade: 'A+',
    verified: true, source: 'local + apify',
    company: { name: 'GitHub', domain: 'github.com', industry: 'Software', size: 3000, location: 'San Francisco' },
  },
  {
    email: 'hello@stripe.com', name: null, title: 'Sales',
    seniority: null, department: 'Sales', confidence: 95, grade: 'A+',
    verified: true, source: 'local + apify',
    company: { name: 'Stripe', domain: 'stripe.com', industry: 'Fintech', size: 8000, location: 'San Francisco' },
  },
  {
    email: 'press@apple.com', name: null, title: 'Press',
    seniority: null, department: 'Marketing', confidence: 100, grade: 'A+',
    verified: true, source: 'local',
    company: { name: 'Apple', domain: 'apple.com', industry: 'Hardware', size: 160000, location: 'Cupertino' },
  },
  {
    email: 'careers@shopify.com', name: null, title: 'Recruiting',
    seniority: null, department: 'HR', confidence: 95, grade: 'A+',
    verified: true, source: 'local + apify',
    company: { name: 'Shopify', domain: 'shopify.com', industry: 'E-commerce', size: 10000, location: 'Ottawa' },
  },
  {
    email: 'test@gmail.com', name: null, title: null,
    seniority: null, department: null, confidence: 45, grade: 'D',
    verified: false, source: 'local + apify',
    company: { name: 'Unknown', domain: 'gmail.com', industry: null, size: null, location: null },
  },
  {
    email: 'john@acme.com', name: 'John Smith', title: 'VP of Sales',
    seniority: 'VP', department: 'Sales', confidence: 95, grade: 'A+',
    verified: true, source: 'local + apify',
    company: { name: 'Acme Corp', domain: 'acme.com', industry: 'Software', size: 150, location: 'New York' },
  },
  {
    email: 'priya@startup.io', name: 'Priya Sharma', title: 'CTO',
    seniority: 'C-Level', department: 'Engineering', confidence: 95, grade: 'A+',
    verified: true, source: 'local + apify',
    company: { name: 'Startup.io', domain: 'startup.io', industry: 'SaaS', size: 75, location: 'Bangalore' },
  },
];

async function main() {
  console.log('=== Elasticsearch Search Engine Test ===\n');

  console.log('1. Cluster health:');
  const health = await es.getClusterHealth();
  console.log(`   Status: ${health.status}`);
  console.log(`   Nodes:  ${health.number_of_nodes}\n`);

  console.log('2. Creating indexes:');
  await es.deleteAllIndexes();
  await es.createContactsIndex();
  await es.createCompaniesIndex();
  console.log('');

  console.log('3. Bulk indexing contacts:');
  const result = await indexer.bulkIndexContacts(SAMPLE_CONTACTS);
  console.log(`   Indexed: ${result.indexed} contacts\n`);

  await new Promise((r) => setTimeout(r, 1000));

  const count = await indexer.countDocuments(es.CONTACTS_INDEX);
  console.log(`4. Total docs in index: ${count}\n`);

  console.log('5. Stats by grade:');
  const stats = await query.statsByGrade();
  console.log(`   Total: ${stats.total}`);
  console.log(`   Avg confidence: ${stats.avgConfidence.toFixed(1)}`);
  console.log(`   Verified: ${stats.totalVerified}`);
  console.log(`   By grade: ${JSON.stringify(stats.byGrade)}\n`);

  console.log('6. Find all verified A+ contacts:');
  const verified = await query.findVerifiedContacts({ grade: 'A+', minConfidence: 90 });
  console.log(`   Found: ${verified.length}`);
  verified.slice(0, 5).forEach((c) => {
    console.log(`   - ${c.email} (${c.grade}, ${c.confidence})`);
  });
  console.log('');

  console.log('7. Find contacts at microsoft.com:');
  const ms = await query.findByCompanyDomain('microsoft.com');
  console.log(`   Found: ${ms.length}`);
  ms.forEach((c) => console.log(`   - ${c.name || '(no name)'} | ${c.title}`));
  console.log('');

  console.log('8. Full-text search "CEO":');
  const ceo = await query.searchByText('CEO');
  console.log(`   Found: ${ceo.length}`);
  ceo.forEach((c) => console.log(`   - ${c.email} | ${c.title}`));
  console.log('');

  console.log('9. POWER QUERY — VPs in Sales at companies with 50-500 employees:\n');
  const pq = await query.powerQuery({
    department: 'Sales',
    minCompanySize: 50,
    maxCompanySize: 500,
    minConfidence: 90,
    onlyVerified: true,
  });
  console.log(`   Total matches: ${pq.total}`);
  console.log(`   Took: ${pq.took}ms`);
  pq.hits.forEach((c) => {
    console.log(`   - ${c.email}`);
    console.log(`     Name: ${c.name} | Title: ${c.title}`);
    console.log(`     Company: ${c.company.name} (${c.company.size} employees, ${c.company.industry})`);
    console.log(`     Confidence: ${c.confidence} (${c.grade})`);
  });

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);