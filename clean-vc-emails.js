require('dotenv').config();
const { client, CONTACTS_INDEX } = require('./search/es-client');

function isGoodEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();
  
  // Basic format
  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,6}$/.test(lower)) return false;
  
  const domain = lower.split('@')[1];
  const parts = domain.split('.');
  
  // Domain must be valid (2-3 parts, no weird TLDs)
  if (parts.length < 2 || parts.length > 3) return false;
  
  // Last part must be valid TLD
  const tld = parts[parts.length - 1];
  const validTLDs = ['com', 'org', 'net', 'io', 'co', 'ai', 'vc', 'in', 'uk', 'de', 'fr', 'br', 'us', 'eu', 'app', 'dev', 'xyz'];
  if (!validTLDs.includes(tld)) return false;
  
  // Reject if domain ends with common English word append (garbage)
  const garbageSuffixes = ['.for', '.we', '.ian', '.com.com', '.vc.vc', '.net.net'];
  if (garbageSuffixes.some(s => domain.endsWith(s))) return false;
  
  // Reject if domain has too many dots (garbage)
  if ((domain.match(/\./g) || []).length > 2) return false;
  
  // Reject common junk
  if (/\d{4,}/.test(lower)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico|woff|ttf|mp4|webm)$/i.test(lower)) return false;
  
  const local = lower.split('@')[0];
  if (local.length > 30) return false;
  if (!/[aeiou]/i.test(local)) return false;
  
  return true;
}

function isGoodName(name) {
  if (!name || typeof name !== 'string') return false;
  
  // No newlines
  if (name.includes('\n') || name.includes('\r')) return false;
  
  const t = name.trim();
  if (t.length < 3 || t.length > 40) return false;
  
  // No URLs
  if (/https?:|www\.|\.com|\.in|\.vc/.test(t)) return false;
  
  // No numbers
  if (/\d/.test(t)) return false;
  
  // Words check
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  
  // Must have capitals
  if (!/[A-Z]/.test(t)) return false;
  
  // Each word must be capitalized
  for (const w of words) {
    if (!/^[A-Z][a-z]{1,19}$/.test(w)) return false;
  }
  
  // Reject common garbage
  const banned = ['US', 'How', 'To', 'The', 'And', 'Welcome', 'About', 'Contact', 'Read', 'More', 'Click'];
  if (words.some(w => banned.includes(w))) return false;
  
  return true;
}

async function main() {
  console.log('=== CLEANING VC EMAILS ===\n');
  
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
    
    // Delete fake emails
    if (!isGoodEmail(c.email)) {
      shouldDelete = true;
    } else {
      // Clean name if garbage
      if (c.name && !isGoodName(c.name)) {
        updates.name = null;
      }
      
      // Clean company name
      if (c.company && c.company.name) {
        const comp = c.company.name;
        if (comp.includes('\n') || comp.includes(' ') && comp.split(' ').length > 4) {
          updates['company.name'] = c.company.domain || null;
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
  console.log(`Deleted:   ${deleted}`);
  console.log(`Updated:   ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Remaining: ${contacts.length - deleted}`);
}

main().catch(console.error);