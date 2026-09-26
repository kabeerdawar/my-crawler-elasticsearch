const { extractFromText, detectSeniority, detectDepartment, normalizePhone } = require('./extract/multi-field-extractor');
const { resolveCompany, dedupeContacts, isSameCompany } = require('./extract/entity-resolver');
const { processCrawlResults } = require('./extract/pipeline');

async function main() {
  console.log('=== EXTRACTION + ENTITY RESOLUTION TEST ===\n');

  console.log('1. EXTRACT from raw HTML/text\n');
  const rawText = `
    Contact our team:
    John Smith, CEO at Microsoft Corporation
    Email: john.smith@microsoft.com
    Phone: (425) 555-1234
    LinkedIn: https://www.linkedin.com/in/johnsmith
    Also reach Sarah Johnson - VP of Engineering
    sarah.johnson@microsoft.com
    +1 425-555-9876
  `;
  const extracted = extractFromText(rawText);
  console.log('   Emails:     ', extracted.emails);
  console.log('   Phones:     ', extracted.phones);
  console.log('   LinkedIn:   ', extracted.linkedin);
  console.log('   Name:       ', extracted.name);
  console.log('   Title:      ', extracted.title);
  console.log('   Seniority:  ', extracted.seniority);
  console.log('   Department: ', extracted.department);
  console.log('');

  console.log('2. SENIORITY + DEPARTMENT detection\n');
  const titles = [
    'Chief Technology Officer',
    'VP of Sales',
    'Head of Design',
    'Senior Software Engineer',
    'Marketing Manager',
    'Director of Operations',
  ];
  titles.forEach((t) => {
    console.log(`   "${t}" -> ${detectSeniority(t) || 'Unknown'} / ${detectDepartment(t) || 'Unknown'}`);
  });
  console.log('');

  console.log('3. PHONE normalization\n');
  const phones = ['(425) 555-1234', '+1-425-555-9876', '425.555.1111', '91 98765 43210'];
  phones.forEach((p) => {
    console.log(`   "${p}" -> ${normalizePhone(p)}`);
  });
  console.log('');

  console.log('4. COMPANY resolution (aliases -> canonical)\n');
  const names = ['Microsoft', 'MSFT', 'Microsoft Corp', 'Microsoft Corporation', 'Google', 'Alphabet Inc', 'Stripe Inc'];
  names.forEach((n) => {
    console.log(`   "${n}" -> ${resolveCompany(n)}`);
  });
  console.log('');

  console.log('5. SAME COMPANY detection\n');
  console.log(`   Microsoft vs MSFT:   ${isSameCompany('Microsoft', 'MSFT', null, null)}`);
  console.log(`   Google vs Alphabet:  ${isSameCompany('Google', 'Alphabet', null, null)}`);
  console.log(`   Same domain:         ${isSameCompany('Foo', 'Bar', 'https://acme.com', 'https://www.acme.com/path')}`);
  console.log(`   Different:           ${isSameCompany('Apple', 'Microsoft', null, null)}`);
  console.log('');

  console.log('6. FULL PIPELINE - extraction + dedup\n');
  const rawResults = [
    { rawText: 'John Smith, CEO at Microsoft Corporation. john@microsoft.com', confidence: 95, grade: 'A+', verified: true, source: 'crawler', company: { name: 'Microsoft Corp', domain: 'microsoft.com', industry: 'Software' } },
    { rawText: 'Sarah Johnson, VP of Engineering at MSFT. sarah@microsoft.com', confidence: 92, grade: 'A+', verified: true, source: 'crawler', company: { name: 'MSFT', domain: 'microsoft.com', industry: 'Software' } },
    { email: 'john@microsoft.com', name: 'John Smith', confidence: 90, grade: 'A', verified: true, source: 'apify', company: { name: 'Microsoft', domain: 'microsoft.com', industry: 'Software' } },
    { rawText: 'Contact press@apple.com for media inquiries', confidence: 100, grade: 'A+', verified: true, source: 'crawler', company: { name: 'Apple Inc', domain: 'apple.com', industry: 'Hardware' } },
  ];

  const processed = processCrawlResults(rawResults);
  console.log(`   Input:  ${rawResults.length} raw records`);
  console.log(`   Output: ${processed.length} deduplicated contacts\n`);
  processed.forEach((c) => {
    console.log(`   ${c.email}`);
    console.log(`     Name:      ${c.name || '(none)'}`);
    console.log(`     Title:     ${c.title || '(none)'}`);
    console.log(`     Seniority: ${c.seniority || '(none)'} | Dept: ${c.department || '(none)'}`);
    console.log(`     Phone:     ${c.phone || '(none)'}`);
    console.log(`     Company:   ${c.company.name} (${c.company.industry})`);
    console.log(`     Verified:  ${c.verified} | Grade: ${c.grade}`);
    console.log('');
  });

  console.log('=== COMPLETE ===');
}

main().catch(console.error);