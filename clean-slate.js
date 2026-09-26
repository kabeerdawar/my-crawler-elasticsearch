// clean-slate.js
// 🎯 Complete reset + extractor test — ek command mein sab
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');
const { extractInvestorData } = require('./extractor');
const { validateRecord } = require('./schema');

(async () => {
  console.log('\n═══════════════════════════════════════════');
  console.log('  🧹 CLEAN SLATE');
  console.log('═══════════════════════════════════════════\n');

  // 1. Supabase connect
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY
           || process.env.SUPABASE_PUBLISHABLE_KEY
           || process.env.SUPABASE_PUBLISHABLE;

  if (!url || !key) {
    console.error('❌ Supabase keys missing');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws }
  });

  // 2. Count first
  const { count: before1 } = await supabase
    .from('investors')
    .select('*', { count: 'exact', head: true });
  const { count: before2 } = await supabase
    .from('review_queue')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 BEFORE: investors=${before1}, review=${before2}\n`);

  // 3. Delete
  console.log('🗑️  Deleting ALL records...');
  const { error: e1 } = await supabase
    .from('investors')
    .delete()
    .gte('id', 0);
  const { error: e2 } = await supabase
    .from('review_queue')
    .delete()
    .gte('id', 0);

  if (e1) console.error('  Investors:', e1.message);
  if (e2) console.error('  Review:', e2.message);

  // 4. Verify
  const { count: after1 } = await supabase
    .from('investors')
    .select('*', { count: 'exact', head: true });
  const { count: after2 } = await supabase
    .from('review_queue')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 AFTER:  investors=${after1}, review=${after2}\n`);

  if (after1 === 0 && after2 === 0) {
    console.log('✅ DB CLEARED SUCCESSFULLY\n');
  } else {
    console.log('⚠️  DB NOT FULLY CLEARED — check permissions\n');
  }

  // 5. Test extractor on real URL
  const testUrl = process.argv[2] || 'https://signal.nfx.com';
  console.log('═══════════════════════════════════════════');
  console.log(`🧪 TEST EXTRACTOR: ${testUrl}`);
  console.log('═══════════════════════════════════════════\n');

  try {
    const res = await axios.get(testUrl, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log(`📄 HTML: ${res.data.length} bytes`);
    const $ = cheerio.load(res.data);
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    console.log(`📝 Text: ${text.length} chars\n`);

    const raw = extractInvestorData($, testUrl);
    const v = validateRecord(raw);
    const r = v.record || {};

    console.log('─── EXTRACTED ───');
    console.log('Company Name:', JSON.stringify(r.company_name || 'NONE'));
    console.log('Person Name:', JSON.stringify(r.name || 'NONE'));
    console.log('Emails:', JSON.stringify(r.emails || []));
    console.log('Phones:', JSON.stringify(r.phones || []));
    console.log('LinkedIn:', JSON.stringify((r.linkedin || []).slice(0, 3)));
    console.log('Confidence:', r.confidence, `(${r.confidence_score || 0}/100)`);
    console.log('─────────────────\n');

    console.log('✅ Test complete\n');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
})();