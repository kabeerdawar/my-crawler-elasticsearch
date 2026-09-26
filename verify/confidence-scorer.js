// Common role-based prefixes (these are REAL emails — high confidence)
const ROLE_PREFIXES = [
  'support', 'info', 'sales', 'contact', 'hello', 'team', 'hr',
  'careers', 'jobs', 'press', 'media', 'marketing', 'admin',
  'billing', 'help', 'feedback', 'partners', 'business', 'legal',
  'noreply', 'no-reply', 'donotreply', 'inquiries', 'enquiries',
  'customerservice', 'service', 'office', 'mail', 'general',
];

// Suspicious prefixes (likely FAKE emails — low confidence)
const SUSPICIOUS_PREFIXES = [
  'test', 'demo', 'sample', 'fake', 'dummy', 'temp', 'trial',
  'abc', 'xyz', 'qwerty', 'asdf', 'foo', 'bar', 'baz',
  'noreply-test', 'throwaway', 'spam',
];

/**
 * Analyze email local-part (before @) and return pattern score
 * Returns: { isRoleBased, isSuspicious, isRandom, patternScore }
 */
function analyzePattern(localPart) {
  const lower = localPart.toLowerCase();

  // Check for role-based prefix
  const isRoleBased = ROLE_PREFIXES.some(role => 
    lower === role || lower.startsWith(role + '.') || lower.startsWith(role + '-')
  );

  // Check for suspicious prefix
  const isSuspicious = SUSPICIOUS_PREFIXES.some(s => 
    lower === s || lower.startsWith(s + '.') || lower.startsWith(s + '-')
  );

  // Check if it looks random (long, has digits, no vowels)
  const hasVowels = /[aeiou]/i.test(lower);
  const hasDigits = /\d/.test(lower);
  const tooLong = lower.length > 20;
  const allConsonants = !hasVowels && lower.length > 4;
  const randomLooking = hasDigits && !hasVowels && lower.length > 6;
  const isRandom = allConsonants || randomLooking || tooLong;

  // Score
  let patternScore = 0;
  if (isSuspicious) patternScore -= 25;
  else if (isRandom) patternScore -= 20;
  else if (isRoleBased) patternScore += 15;
  else if (hasVowels && !hasDigits && lower.length >= 3 && lower.length <= 15) {
    patternScore += 5; // Looks like a normal first name
  }

  return { isRoleBased, isSuspicious, isRandom, patternScore };
}

function computeConfidence({
  email,
  syntaxValid,
  mxExists,
  smtpStatus,
  isCatchAll,
  isProtectedProvider,
  sourceType,
  patternMatched,
  hasSourceUrl,
}) {
  let score = 0;

  // STAGE 1: Syntax (max 10)
  if (syntaxValid) score += 10;
  else return 0;

  // STAGE 2: MX (max 20)
  if (mxExists) score += 20;

  // STAGE 3: SMTP (max 30)
  if (smtpStatus === 'valid') score += 30;
  else if (smtpStatus === 'protected_provider') score += 15;
  else if (smtpStatus === 'unknown') score += 10;
  else if (smtpStatus === 'invalid') {
    if (isProtectedProvider) score += 10;
    else return Math.max(score - 20, 0);
  }

  // STAGE 4: Catch-all (max 15)
  if (isCatchAll === false) score += 15;
  else if (isCatchAll === true) score -= 10;

  // STAGE 5: Source quality (max 15)
  if (sourceType === 'company_website') score += 15;
  else if (sourceType === 'directory') score += 10;
  else if (sourceType === 'api') score += 8;
  else if (sourceType === 'guessed_pattern') score += 3;

  // STAGE 6: Pattern match (max 5)
  if (patternMatched) score += 5;

  // STAGE 7: Source URL (max 5)
  if (hasSourceUrl) score += 5;

  // STAGE 8: Local-part pattern analysis (NEW — max +15 / -25)
  if (email && email.includes('@')) {
    const localPart = email.split('@')[0];
    const pattern = analyzePattern(localPart);
    score += pattern.patternScore;
  }

  return Math.max(0, Math.min(score, 100));
}

function gradeLabel(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

module.exports = { computeConfidence, gradeLabel, analyzePattern };