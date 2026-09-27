require('dotenv').config();
const { client, CONTACTS_INDEX } = require('./search/es-client');

// ===== STRICT VALIDATORS =====

function isRealEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9._%+-]{0,30}@[a-z0-9][a-z0-9.-]*\.[a-z]{2,6}$/.test(lower)) return false;
  if (/\.(mp|webm|mp4|mov|png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|ttf)$/i.test(lower)) return false;
  if (/@2x|@3x|\d+x\.|_x\d+|x\d+_/i.test(lower)) return false;
  if (/\b(logo|favicon|sprite|icon|banner|hero|image|photo)\b/i.test(lower)) return false;
  const local = lower.split('@')[0];
  if (local.length > 30) return false;
  if (/\d{4,}/.test(local)) return false;
  if (!/[aeiou]/i.test(local)) return false;
  const domain = lower.split('@')[1];
  const badDomains = ['example.com', 'yourdomain.com', 'email.com', 'company.com', 'test.com', 'sentry.io', 'wixpress.com'];
  if (badDomains.includes(domain)) return false;
  return true;
}

function isRealName(name) {
  if (!name || typeof name !== 'string') return false;
  const t = name.trim();
  if (t.length < 3 || t.length > 40) return false;
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // Each word: capitalized, 2-20 chars, only letters/hyphen/apostrophe
  for (const w of words) {
    if (!/^[A-Z][a-zA-Z'\-]{1,19}$/.test(w)) return false;
  }
  // No banned words
  const banned = new Set(['Financial','Advisor','Institutional','Individual','Investor','Chief','Officer','Partner','Managing','Team','About','Contact','Welcome','Invest','Build','Portfolio','Sector','Insights','Executive','Director','Founder','President','Company','Business','Services','Solutions','Global','Group','Capital','Ventures','Fund','Holdings']);
  if (words.some(w => banned.has(w))) return false;
  return true;
}

function isRealTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const t = title.trim();
  if (t.length < 2 || t.length > 50) return false;
  const words = t.split(/\s+/);
  if (words.length > 5) return false;
  // Must match recognized patterns
  const patterns = [
    /^(ceo|cto|cfo|coo|cmo|cpo|ciso|vp|svp|evp)$/i,
    /^chief\s+\w+\s+officer$/i,
    /^(managing|general|senior|executive|founding)\s+partner$/i,
    /^partner$/i,
    /^(vice\s+president|vp)\s+(of\s+)?\w+$/i,
    /^director(\s+of\s+\w+)?$/i,
    /^head\s+of\s+\w+$/i,
    /^(principal|associate|analyst|engineer|developer|designer|manager)$/i,
    /^(founder|co-founder|cofounder)$/i,
    /^(president|chairman|chairwoman)$/i,
    /^managing\s+director$/i,
    /^(senior|lead|staff|principal)\s+(engineer|developer|designer|manager|analyst)$/i,
    /^(product|marketing|sales|engineering)\s+(manager|lead|director)$/i,
  ];
  return patterns.some(p => p.test(t));
}

function isRealPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const s = phone.trim();
  // Must have + country code OR (xxx) xxx-xxxx pattern
  if (/^\+\d{10,15}$/.test(s.replace(/[\s\-()]/g, ''))) return true;
  if (/^\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}$/.test(s)) {
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return true;
  }
  return false;
}

function isRealCompany(name, domain) {
  if (!name || typeof name !== 'string') return false;
  const t = name.trim();
  if (t.length < 2 || t.length > 60) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/^https?:/.test(t)) return false;
  if (!/[aeiou]/i.test(t)) return false;
  // If it's just domain without TLD, ok
  if (/\.(com|io|vc|ai|co|net|org|in|br|de|fr|uk)$/i.test(t)) return false;
  // No space + all lowercase + long = likely garbage
  if (!/\s/.test(t) && t.length > 20 && t === t.toLowerCase()) return false;
  return true;
}

async function main() {
  console.log('=== AGGRESSIVE CLEANUP ===\n');

  const result = await client.search({
    index: CONTACTS_INDEX,
    size: 1000,
    body: { query: { match_all: {} } },
  });

  const contacts = result.hits.hits;
  console.log(`Total: ${contacts.length}\n`);

  let deleted = 0, updated = 0, unchanged = 0;

  for (const hit of contacts) {
    const c = hit._source;
    const updates = {};
    let shouldDelete = false;

    // Email must be real — otherwise delete
    if (!isRealEmail(c.email)) {
      shouldDelete = true;
    } else {
      // Clear name if not strict
      if (c.name && !isRealName(c.name)) updates.name = null;
      // Clear title if not strict  
      if (c.title && !isRealTitle(c.title)) updates.title = null;
      // Clear phone if not strict
      if (c.phone && !isRealPhone(c.phone)) updates.phone = null;
      // Clear company name if not strict
      if (c.company && c.company.name) {
        if (!isRealCompany(c.company.name, c.company.domain)) {
          updates['company.name'] = null;
        }
      }
    }

    if (shouldDelete) {
      await client.delete({ index: CONTACTS_INDEX, id: hit._id });
      deleted++;
      console.log(`  🗑️  ${c.email}`);
    } else if (Object.keys(updates).length > 0) {
      await client.update({
        index: CONTACTS_INDEX,
        id: hit._id,
        body: { doc: updates },
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  await client.indices.refresh({ index: CONTACTS_INDEX });

  console.log(`\n=== DONE ===`);
  console.log(`Deleted:   ${deleted} (fake emails)`);
  console.log(`Updated:   ${updated} (garbage fields cleared)`);
  console.log(`Unchanged: ${unchanged} (already clean)`);
  console.log(`\nTotal remaining: ${contacts.length - deleted}`);
}

main().catch(console.error);