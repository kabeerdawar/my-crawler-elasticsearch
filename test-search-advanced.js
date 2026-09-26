const es = require('./search/es-client');
const indexer = require('./search/indexer');
const adv = require('./search/advanced-search');

const SAMPLE = [
  { email: 'satya@microsoft.com', name: 'Satya Nadella', title: 'CEO', seniority: 'C-Level', department: 'Executive', confidence: 95, grade: 'A+', verified: true, source: 'local + apify', company: { name: 'Microsoft', domain: 'microsoft.com', industry: 'Software', size: 220000, location: 'Redmond' } },
  { email: 'sundar@google.com', name: 'Sundar Pichai', title: 'CEO', seniority: 'C-Level', department: 'Executive', confidence: 95, grade: 'A+', verified: true, source: 'local + apify', company: { name: 'Google', domain: 'google.com', industry: 'Software', size: 180000, location: 'Mountain View' } },
  { email: 'support@github.com', name: null, title: 'Support Team', department: 'Customer Support', confidence: 95, grade: 'A+', verified: true, source: 'local + apify', company: { name: 'GitHub', domain: 'github.com', industry: 'Software', size: 3000, location: 'San Francisco' } },
  { email: 'hello@stripe.com', name: null, title: 'Sales', department: 'Sales', confidence: 95, grade: 'A+', verified: true, source: 'local + apify', company: { name: 'Stripe', domain: 'stripe.com', industry: 'Fintech', size: 8000, location: 'San Francisco' } },
  { email: 'press@apple.com', name: null, title: 'Press', department: 'Marketing', confidence: 100, grade: 'A+', verified: true, source: 'local', company: { name: 'Apple', domain: 'apple.com', industry: 'Hardware', size: 160000, location: 'Cupertino' } },
  { email: 'john@acme.com', name: 'John Smith', title: 'VP of Sales', seniority: 'VP', department: 'Sales', confidence: 95, grade: 'A+', verified: true, source: 'local + apify', company: { name: 'Acme Corp', domain: 'acme.com', industry: 'Software', size: 150, location: 'New York' } },
  { email: 'priya@startup.io', name: 'Priya Sharma', title: 'CTO', seniority: 'C-Level', department: 'Engineering', confidence: 95, grade: 'A+', verified: true, source: 'local + apify', company: { name: 'Startup.io', domain: 'startup.io', industry: 'SaaS', size: 75, location: 'Bangalore' } },
  { email: 'rahul@fintech.com', name: 'Rahul Verma', title: 'VP of Engineering', seniority: 'VP', department: 'Engineering', confidence: 92, grade: 'A+', verified: true, source: 'local + apify', company: { name: 'FinTech Co', domain: 'fintech.com', industry: 'Fintech', size: 300, location: 'Mumbai' } },
  { email: 'test@gmail.com', name: null, title: null, confidence: 45, grade: 'D', verified: false, source: 'local', company: {} },
];

async function main() {
  console.log('=== ADVANCED SEARCH TEST ===\n');

  await es.deleteAllIndexes();
  await es.createContactsIndex();
  await es.createCompaniesIndex();
  await indexer.bulkIndexContacts(SAMPLE);
  await new Promise((r) => setTimeout(r, 1000));

  console.log('1. RANKED SEARCH — "CEO"\n');
  const r1 = await adv.rankedSearch('CEO');
  r1.forEach((c) => console.log(`   Score: ${c.score.toFixed(2)} | ${c.name || c.email} | ${c.title} @ ${c.company.name}`));
  console.log('');

  console.log('2. FUZZY SEARCH — "Sathya" (typo)\n');
  const r2 = await adv.fuzzySearch('Sathya');
  r2.forEach((c) => console.log(`   Score: ${c.score.toFixed(2)} | ${c.name || c.email}`));
  console.log('');

  console.log('3. AUTOCOMPLETE — "Su"\n');
  const r3 = await adv.autocomplete('Su');
  r3.forEach((c) => console.log(`   → ${c.label}`));
  console.log('');

  console.log('4. AUTOCOMPLETE — "Sund"\n');
  const r4 = await adv.autocomplete('Sund');
  r4.forEach((c) => console.log(`   → ${c.label}`));
  console.log('');

  console.log('5. FACETS — Apollo-style sidebar\n');
  const f = await adv.getFacets();
  console.log(`   Total: ${f.total}`);
  console.log(`   By grade: ${JSON.stringify(f.grade)}`);
  console.log(`   By industry: ${JSON.stringify(f.industry)}`);
  console.log(`   By location: ${JSON.stringify(f.location)}`);
  console.log(`   By seniority: ${JSON.stringify(f.seniority)}`);
  console.log(`   Company size ranges: ${JSON.stringify(f.companySize)}`);
  console.log('');

  console.log('6. FILTERED SEARCH — C-Level in Software, 500+ employees\n');
  const r6 = await adv.filteredSearch({
    seniority: 'C-Level',
    industry: 'Software',
    minCompanySize: 500,
    onlyVerified: true,
  });
  console.log(`   Total: ${r6.total}`);
  r6.hits.forEach((c) => console.log(`   - ${c.name} | ${c.title} @ ${c.company.name} (${c.company.size})`));
  console.log('');

  console.log('7. FILTERED — VPs in Sales, 50-500 employees\n');
  const r7 = await adv.filteredSearch({
    department: 'Sales',
    seniority: 'VP',
    minCompanySize: 50,
    maxCompanySize: 500,
    onlyVerified: true,
  });
  console.log(`   Total: ${r7.total}`);
  r7.hits.forEach((c) => console.log(`   - ${c.name} | ${c.title} @ ${c.company.name}`));
  console.log('');

  console.log('=== COMPLETE ===');
}

main().catch(console.error);