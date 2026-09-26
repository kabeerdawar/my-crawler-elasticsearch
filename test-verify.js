const { verifyEmail, verifyBatch } = require('./verify/email-verifier');

async function main() {
  console.log('=== Email Verification Engine Test ===\n');

  console.log('TEST 1: Real emails (should mostly PASS)\n');
  const realEmails = [
    'support@github.com',
    'hello@stripe.com',
    'press@apple.com',
    'info@cloudflare.com',
    'careers@shopify.com',
    'noreply@openai.com',
  ];

  for (const email of realEmails) {
    console.log(`Verifying: ${email}`);
    const result = await verifyEmail(email, {
      sourceType: 'company_website',
      hasSourceUrl: true,
      smtpTimeout: 15000,
    });
    console.log(`  Domain:        ${result.domain || 'N/A'}`);
    console.log(`  MX exists:     ${result.mxExists}`);
    console.log(`  MX records:    ${(result.mxRecords || []).join(', ') || 'N/A'}`);
    console.log(`  SMTP status:   ${result.smtpStatus}`);
    console.log(`  SMTP message:  ${result.smtpMessage || 'N/A'}`);
    console.log(`  Catch-all:     ${result.isCatchAll}`);
    console.log(`  Confidence:    ${result.confidence} (${result.grade})`);
    console.log(`  Verified:      ${result.verified}`);
    console.log(`  Duration:      ${result.durationMs}ms`);
    if (result.error) console.log(`  Error:         ${result.error}`);
    console.log('');
  }

  console.log('\nTEST 2: Fake emails (should FAIL)\n');
  const fakeEmails = [
    'test@gmail.com',
    'zzz-no-such-user-xyz@github.com',
    'fake-user@nonexistentdomain-abc123.com',
    'not-an-email',
  ];

  for (const email of fakeEmails) {
    console.log(`Verifying: ${email}`);
    const result = await verifyEmail(email, {
      sourceType: 'company_website',
      hasSourceUrl: true,
      smtpTimeout: 15000,
    });
    console.log(`  SMTP status:   ${result.smtpStatus}`);
    console.log(`  Confidence:    ${result.confidence} (${result.grade})`);
    console.log(`  Verified:      ${result.verified}`);
    console.log('');
  }

  console.log('\nTEST 3: Batch verification (parallel)\n');
  const batch = [
    'support@github.com',
    'hello@stripe.com',
    'test@gmail.com',
    'not-an-email',
  ];
  const batchResults = await verifyBatch(batch, {
    concurrency: 3,
    sourceType: 'api',
    hasSourceUrl: true,
    smtpTimeout: 15000,
  });
  console.log('  Email                          Score  Grade  Status');
  console.log('  ' + '-'.repeat(60));
  for (const r of batchResults) {
    console.log(`  ${r.email.padEnd(30)} ${String(r.confidence).padStart(5)}  ${r.grade.padEnd(5)}  ${r.smtpStatus}`);
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);