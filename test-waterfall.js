require('dotenv').config();
const { waterfallVerify, waterfallVerifyBatch, getCostStats, resetCostStats } = require('./verify/waterfall-verifier');

async function main() {
  console.log('=== Waterfall Email Verification Test ===\n');

  if (!process.env.APIFY_API_TOKEN) {
    console.error('APIFY_API_TOKEN not set in .env');
    process.exit(1);
  }
  console.log('APIFY_API_TOKEN loaded\n');

  resetCostStats();

  console.log('TEST 1: Single waterfall verification\n');
  const testEmails = ['press@apple.com', 'support@github.com', 'hello@stripe.com', 'test@gmail.com'];

  for (const email of testEmails) {
    console.log(`Verifying: ${email}`);
    const result = await waterfallVerify(email, {
      sourceType: 'company_website', hasSourceUrl: true, smtpTimeout: 15000, useApify: true,
    });
    console.log(`  Local status:      ${result.smtpStatus}`);
    console.log(`  Local confidence:  ${result.localConfidence || result.confidence} (${result.grade})`);
    if (result.apifyUsed) {
      console.log(`  Apify used:        YES`);
      console.log(`  Apify status:      ${result.apifyStatus}`);
      console.log(`  Apify reason:      ${result.apifyReason}`);
    } else {
      console.log(`  Apify used:        NO`);
    }
    console.log(`  FINAL confidence:  ${result.finalConfidence} (${result.finalGrade})`);
    console.log(`  FINAL verified:    ${result.finalVerified}`);
    console.log(`  Source:            ${result.verificationSource}`);
    console.log('');
  }

  console.log('\nTEST 2: Batch waterfall verification\n');
  const batch = ['support@github.com', 'press@apple.com', 'careers@shopify.com', 'hello@stripe.com', 'test@gmail.com'];

  const batchResults = await waterfallVerifyBatch(batch, {
    concurrency: 3, sourceType: 'api', hasSourceUrl: true, useApify: true,
  });

  console.log('  Email                          Local  Final  Grade  Apify  Source');
  console.log('  ' + '-'.repeat(78));
  for (const r of batchResults) {
    console.log(
      `  ${r.email.padEnd(30)} ${String(r.localConfidence || 0).padStart(4)}   ` +
      `${String(r.finalConfidence).padStart(4)}   ${r.finalGrade.padEnd(4)}   ` +
      `${r.apifyUsed ? 'YES' : 'no '}    ${r.verificationSource}`
    );
  }

  console.log('\n=== Cost Report ===');
  const stats = getCostStats();
  console.log(`  Apify calls:    ${stats.apifyCallCount}`);
  console.log(`  Total cost:     $${stats.totalCost.toFixed(4)}`);

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);