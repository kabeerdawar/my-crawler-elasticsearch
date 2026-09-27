require('dotenv').config();
const { client, CONTACTS_INDEX } = require('./search/es-client');

// ==================== VALIDATORS ====================

function isRealEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();

  // Must match strict email regex
  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,6}$/.test(lower)) return false;

  // Reject image/video filenames
  if (/\.(mp|webm|mp4|mov|png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|ttf)$/i.test(lower)) return false;

  // Reject image size markers
  if (/@2x|@3x|\d+x\.|_x\d+|x\d+_/i.test(lower)) return false;

  // Reject logo/favicon patterns
  if (/\b(logo|favicon|sprite|icon|banner|hero|image)\b/i.test(lower)) return false;

  // Reject hex-like strings (random IDs)
  if (/[a-f0-9]{8,}/i.test(lower.split('@')[0])) return false;

  // Reject placeholder domains
  const domain = lower.split('@')[1];
  const badDomains = [
    'example.com', 'example.org', 'yourdomain.com', 'domain.com',
    'email.com', 'company.com', 'yourcompany.com', 'test.com',
    'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com',
  ];
  if (badDomains.includes(domain)) return false;

  // Reject HTML entities and unicode
  if (lower.includes('u00') || lower.includes('&#')) return false;

  // Reject too long
  if (lower.length > 60) return false;

  // Reject local part that's just random-looking
  const local = lower.split('@')[0];
  if (local.length > 40) return false;
  if (!/[aeiou]/i.test(local)) return false; // no vowels = random
  if (/\d{4,}/.test(local)) return false; // 4+ consecutive digits

  return true;
}

function isRealPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const str = phone.trim();

  // Reject if ends with separator (incomplete)
  if (/[-\s.()]$/.test(str)) return false;

  // Reject if too short
  const digits = str.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return false;

  // Must have formatting OR country code
  const hasFormat = /[\+\(\)\-\.\s]/.test(str);
  if (!hasFormat && digits.length !== 10 && digits.length !== 11) return false;

  // Reject if starts with 0 followed by separators (like 022-)
  if (/^0\d{1,3}[-\s]/.test(str)) return false;

  // Reject random digit strings (no spaces/separators at all + weird length)
  if (!hasFormat && digits.length > 11) return false;

  return true;
}

function isRealName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();

  // Length checks
  if (trimmed.length < 2 || trimmed.length > 50) return false;

  // Must not contain sentence-like patterns
  if (/[.!?]$/.test(trimmed)) return false;
  if (/&/.test(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;

  // Reject common junk starts
  const junkStarts = [
    'welcome', 'invest', 'build', 'how', 'what', 'why', 'when', 'where',
    'the ', 'a ', 'an ', 'and ', 'or ', 'but ', 'if ', 'our ', 'your ',
    'this ', 'that ', 'these ', 'those ', 'click', 'read', 'learn', 'get ',
    'contact', 'about', 'home', 'news', 'blog', 'sector', 'up of', 'login',
    'sign ', 'register', 'discover', 'explore', 'find ', 'start ',
  ];
  const lower = trimmed.toLowerCase();
  if (junkStarts.some((j) => lower.startsWith(j))) return false;

  // Reject if too many words (names usually 2-4 words)
  const words = trimmed.split(/\s+/);
  if (words.length > 5) return false;

  // Reject if contains common sentence words
  const sentenceWords = [' the ', ' and ', ' with ', ' for ', ' from ', ' of ', ' to ', ' in ', ' on ', ' at '];
  const lowerPadded = ' ' + lower + ' ';
  if (sentenceWords.some((sw) => lowerPadded.includes(sw))) return false;

  // Must have at least one capital letter (real names are capitalized)
  if (!/[A-Z]/.test(trimmed)) return false;

  return true;
}

function isRealTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.length < 3 || trimmed.length > 80) return false;

  // Reject garbled titles
  if (/\d{3,}/.test(trimmed)) return false;
  if (/[.]{2,}/.test(trimmed)) return false;

  // Reject if starts with pronoun/adjective
  const junkStarts = ['they ', 'he ', 'she ', 'it ', 'we ', 'i ', 'you ', 'us '];
  if (junkStarts.some((j) => lower.startsWith(j))) return false;

  // Should contain common job title keywords OR be short
  const jobKeywords = [
    'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'ciso', 'chief',
    'president', 'founder', 'co-founder', 'partner', 'managing',
    'director', 'vp', 'vice president', 'head', 'manager', 'lead',
    'principal', 'associate', 'analyst', 'engineer', 'developer',
    'designer', 'consultant', 'advisor', 'specialist', 'officer',
    'investor', 'executive', 'administrator', 'coordinator',
  ];

  return jobKeywords.some((k) => lower.includes(k));
}

function isRealCompany(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();

  if (trimmed.length < 2 || trimmed.length > 60) return false;

  // Reject weird concatenations (no spaces + lowercase + > 15 chars)
  if (!/\s/.test(trimmed) && trimmed.length > 15 && trimmed === trimmed.toLowerCase()) return false;

  // Reject if it's just a URL/domain
  if (/^https?:/.test(trimmed)) return false;
  if (/\.(com|io|vc|ai|co|net|org)$/i.test(trimmed) && !/\s/.test(trimmed)) return false;

  // Reject sentence-like
  if (/[.!?]$/.test(trimmed)) return false;

  return true;
}

// ==================== MAIN CLEANUP ====================

async function main() {
  console.log('=== CLEANING EXISTING CONTACTS ===\n');

  // Fetch all contacts
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: 1000,
    body: { query: { match_all: {} } },
  });

  const contacts = result.hits.hits;
  console.log(`Total contacts: ${contacts.length}\n`);

  let updated = 0;
  let deleted = 0;
  let unchanged = 0;

  for (const hit of contacts) {
    const c = hit._source;
    const cleaned = { ...c };
    let changed = false;

    // 1. Email validation
    if (!isRealEmail(c.email)) {
      // Delete this contact — email is core
      await client.delete({ index: CONTACTS_INDEX, id: hit._id });
      deleted++;
      console.log(`  🗑️  Deleted: ${c.email}`);
      continue;
    }

    // 2. Clean name
    if (c.name && !isRealName(c.name)) {
      cleaned.name = null;
      changed = true;
    }

    // 3. Clean title
    if (c.title && !isRealTitle(c.title)) {
      cleaned.title = null;
      changed = true;
    }

    // 4. Clean phone
    if (c.phone && !isRealPhone(c.phone)) {
      cleaned.phone = null;
      changed = true;
    }

    // 5. Clean company name
    if (c.company && c.company.name && !isRealCompany(c.company.name)) {
      cleaned.company = { ...c.company, name: c.company.domain || null };
      changed = true;
    }

    if (changed) {
      await client.update({
        index: CONTACTS_INDEX,
        id: hit._id,
        body: { doc: cleaned },
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  // Refresh index
  await client.indices.refresh({ index: CONTACTS_INDEX });

  console.log(`\n=== DONE ===`);
  console.log(`Updated:   ${updated}`);
  console.log(`Deleted:   ${deleted}  (fake emails)`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`\nTotal remaining: ${contacts.length - deleted}`);
  console.log(`\n✅ Refresh dashboard: http://localhost:3000`);
}

main().catch(console.error);