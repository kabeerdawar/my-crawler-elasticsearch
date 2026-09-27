require('dotenv').config();
const { processDomains } = require('./crawler/pipeline');
const query = require('./search/query-engine');

// Small business / agency sites — inme emails publicly hoti hain
const TEST_DOMAINS = [
  'https://www.shopify.com',
  'https://vercel.com',
  'https://www.hubspot.com',
  'https://slack.com',
];

async function main() {
  console.log('=== CRAWLER END-TO-END TEST ===\n');
  console.log(`Crawling ${TEST_DOMAINS.length} domains...\n`);

  const results = await processDomains(TEST_DOMAINS, { useApify: true, index: true });

  console.log('\n=== CRAWL RESULTS ===\n');
  let totalContacts = 0;
  let totalVerified = 0;
  let totalIndexed = 0;

  for (const r of results) {
    console.log(`Domain: ${r.domain}`);
    console.log(`  Found:    ${r.contacts.length} contacts`);
    console.log(`  Indexed:  ${r.indexed}`);
    console.log(`  Duration: ${r.durationMs}ms`);

    r.contacts.forEach((c) => {
      totalContacts++;
      if (c.verified) totalVerified++;
      const mark = c.verified ? '✓' : '✗';
      console.log(`    ${mark} ${c.email.padEnd(40)} ${c.grade} (${c.confidence})`);
    });
    console.log('');
    totalIndexed += r.indexed;
  }

  console.log('2. Elasticsearch stats:');
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const stats = await query.statsByGrade();
    console.log(`   Total docs:  ${stats.total}`);
    console.log(`   Verified:    ${stats.totalVerified}`);
    console.log(`   By grade:    ${JSON.stringify(stats.byGrade)}`);
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Domains:          ${TEST_DOMAINS.length}`);
  console.log(`Contacts found:   ${totalContacts}`);
  console.log(`Verified:         ${totalVerified}`);
  console.log(`Indexed:          ${totalIndexed}`);

  console.log('\n=== COMPLETE ===');
}

main().catch(console.error);