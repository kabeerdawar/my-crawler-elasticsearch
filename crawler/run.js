require('dotenv').config();
const { processUrls } = require('./pipeline');

const DEFAULT_URLS = [
  'https://stripe.com/contact',
  'https://github.com/about',
  'https://www.shopify.com/contact',
];

async function main() {
  const args = process.argv.slice(2);
  const urls = args.length > 0 ? args : DEFAULT_URLS;

  console.log('=== CRAWLER PIPELINE ===');
  console.log(`Processing ${urls.length} URLs\n`);

  const startTime = Date.now();
  const results = await processUrls(urls, { useApify: true, index: true });
  const totalTime = Date.now() - startTime;

  console.log('\n=== SUMMARY ===');
  let totalContacts = 0;
  let totalIndexed = 0;
  let totalVerified = 0;

  results.forEach((r) => {
    console.log(`\n${r.url}`);
    console.log(`  Contacts:  ${r.contacts.length}`);
    console.log(`  Indexed:   ${r.indexed}`);
    console.log(`  Duration:  ${r.durationMs}ms`);
    if (r.error) console.log(`  Error:     ${r.error}`);

    r.contacts.forEach((c) => {
      totalContacts++;
      if (c.verified) totalVerified++;
      console.log(`    - ${c.email.padEnd(35)} ${c.grade} ${c.confidence} ${c.verified ? '✓' : ''}`);
    });

    totalIndexed += r.indexed;
  });

  console.log(`\n=== TOTALS ===`);
  console.log(`Contacts found:  ${totalContacts}`);
  console.log(`Verified:        ${totalVerified}`);
  console.log(`Indexed to ES:   ${totalIndexed}`);
  console.log(`Total time:      ${totalTime}ms`);
}

main().catch(console.error);