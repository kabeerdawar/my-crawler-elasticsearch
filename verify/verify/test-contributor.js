const cn = require('./verify/contributor-network');

async function main() {
  console.log('=== Contributor Network Test ===\n');

  cn.resetAll();
  console.log('All corrections reset\n');

  // TEST 1: Submit first correction
  console.log('TEST 1: User 1 submits correction\n');
  const c1 = await cn.submitCorrection({
    email: 'john@acme.com',
    field: 'email',
    oldValue: 'john@old-acme.com',
    newValue: 'john@acme.com',
    submittedBy: 'user_kabee',
  });
  console.log(`  Correction ID:  ${c1.id}`);
  console.log(`  Agree count:    ${c1.agreeCount}`);
  console.log(`  Applied:        ${c1.applied}\n`);

  // TEST 2: Second user agrees
  console.log('TEST 2: User 2 agrees\n');
  const c2 = cn.agreeWithCorrection(c1.id, 'user_rahul');
  console.log(`  Agree count:    ${c2.agreeCount}`);
  console.log(`  Applied:        ${c2.applied}\n`);

  // TEST 3: Third user agrees — should auto-apply
  console.log('TEST 3: User 3 agrees (auto-apply threshold: 3)\n');
  const c3 = cn.agreeWithCorrection(c1.id, 'user_priya');
  console.log(`  Agree count:    ${c3.agreeCount}`);
  console.log(`  Applied:        ${c3.applied}`);
  console.log(`  Applied at:     ${c3.appliedAt}\n`);

  // TEST 4: Fetch the applied correction
  console.log('TEST 4: Fetch applied correction for john@acme.com\n');
  const applied = cn.getAppliedCorrection('john@acme.com', 'email');
  console.log(`  Found:          ${applied ? applied.newValue : 'None'}\n`);

  // TEST 5: Duplicate agreement prevention
  console.log('TEST 5: Duplicate agreement attempt\n');
  const c5 = cn.agreeWithCorrection(c1.id, 'user_rahul');
  console.log(`  Message:        ${c5.message}\n`);

  // TEST 6: Stats
  console.log('TEST 6: Network stats\n');
  console.log('  ', cn.getStats(), '\n');

  // TEST 7: Leaderboard
  console.log('TEST 7: Top contributors leaderboard\n');
  const lb = cn.getLeaderboard();
  lb.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.userId.padEnd(15)} Score: ${String(u.score).padStart(3)}  (${u.submissions} submissions, ${u.agreements} agreements)`);
  });

  // TEST 8: Submit a second correction (different email)
  console.log('\nTEST 8: Submit correction for different contact\n');
  const c8 = await cn.submitCorrection({
    email: 'priya@startup.io',
    field: 'phone',
    oldValue: '+91-9999-OLD',
    newValue: '+91-98765-43210',
    submittedBy: 'user_kabee',
  });
  console.log(`  New correction ID: ${c8.id}`);
  console.log(`  Pending:           ${!c8.applied}`);
  console.log(`  Total pending:     ${cn.getPendingCorrections().length}`);
  console.log(`  Total applied:     ${cn.getStats().applied}\n`);

  console.log('=== Test Complete ===');
}

main().catch(console.error);const cn = require('./verify/contributor-network');

async function main() {
  console.log('=== Contributor Network Test ===\n');

  cn.resetAll();
  console.log('All corrections reset\n');

  // TEST 1: Submit first correction
  console.log('TEST 1: User 1 submits correction\n');
  const c1 = await cn.submitCorrection({
    email: 'john@acme.com',
    field: 'email',
    oldValue: 'john@old-acme.com',
    newValue: 'john@acme.com',
    submittedBy: 'user_kabee',
  });
  console.log(`  Correction ID:  ${c1.id}`);
  console.log(`  Agree count:    ${c1.agreeCount}`);
  console.log(`  Applied:        ${c1.applied}\n`);

  // TEST 2: Second user agrees
  console.log('TEST 2: User 2 agrees\n');
  const c2 = cn.agreeWithCorrection(c1.id, 'user_rahul');
  console.log(`  Agree count:    ${c2.agreeCount}`);
  console.log(`  Applied:        ${c2.applied}\n`);

  // TEST 3: Third user agrees — should auto-apply
  console.log('TEST 3: User 3 agrees (auto-apply threshold: 3)\n');
  const c3 = cn.agreeWithCorrection(c1.id, 'user_priya');
  console.log(`  Agree count:    ${c3.agreeCount}`);
  console.log(`  Applied:        ${c3.applied}`);
  console.log(`  Applied at:     ${c3.appliedAt}\n`);

  // TEST 4: Fetch the applied correction
  console.log('TEST 4: Fetch applied correction for john@acme.com\n');
  const applied = cn.getAppliedCorrection('john@acme.com', 'email');
  console.log(`  Found:          ${applied ? applied.newValue : 'None'}\n`);

  // TEST 5: Duplicate agreement prevention
  console.log('TEST 5: Duplicate agreement attempt\n');
  const c5 = cn.agreeWithCorrection(c1.id, 'user_rahul');
  console.log(`  Message:        ${c5.message}\n`);

  // TEST 6: Stats
  console.log('TEST 6: Network stats\n');
  console.log('  ', cn.getStats(), '\n');

  // TEST 7: Leaderboard
  console.log('TEST 7: Top contributors leaderboard\n');
  const lb = cn.getLeaderboard();
  lb.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.userId.padEnd(15)} Score: ${String(u.score).padStart(3)}  (${u.submissions} submissions, ${u.agreements} agreements)`);
  });

  // TEST 8: Submit a second correction (different email)
  console.log('\nTEST 8: Submit correction for different contact\n');
  const c8 = await cn.submitCorrection({
    email: 'priya@startup.io',
    field: 'phone',
    oldValue: '+91-9999-OLD',
    newValue: '+91-98765-43210',
    submittedBy: 'user_kabee',
  });
  console.log(`  New correction ID: ${c8.id}`);
  console.log(`  Pending:           ${!c8.applied}`);
  console.log(`  Total pending:     ${cn.getPendingCorrections().length}`);
  console.log(`  Total applied:     ${cn.getStats().applied}\n`);

  console.log('=== Test Complete ===');
}

main().catch(console.error);