// db.js
require("dotenv").config();
const ws = require("ws");
global.WebSocket = ws;

const { createClient } = require("@supabase/supabase-js");

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (URL && KEY) {
  supabase = createClient(URL, KEY);
  console.log("✅ Supabase initialized");
} else {
  console.log("⚠️  Supabase keys missing");
}

function cleanForDB(r) {
  return {
    name: r.name || null,
    company_name: r.company_name || null,
    investor_type: r.investor_type || null,
    region: r.region || null,
    hq_city: r.hq_city || null,
    sectors: r.sectors || [],
    tags: r.tags || [],
    portfolio: r.portfolio || [],
    thesis: r.thesis || null,
    emails: r.emails || [],
    email_details: r.email_details || [],
    email_score: r.email_score || 0,
    linkedin: r.linkedin || [],
    linkedin_details: r.linkedin_details || [],
    linkedin_score: r.linkedin_score || 0,
    phones: r.phones || [],
    latest_year: r.latest_year || null,
    is_fresh: r.is_fresh || false,
    description: r.description || null,
    website: r.website || null,
    source_url: r.source_url || null,
    investor_score: r.investor_score || 0,
    confidence: r.confidence || null,
    confidence_score: r.confidence_score || 0,
    source_count: r.source_count || 1,
    all_sources: r.all_sources || [],
    last_verified_at: r.last_verified_at || new Date().toISOString()
  };
}

// 🎯 INTELLIGENT SAVE: Insert new + update existing (session-based)
async function saveInvestors(records, sessionId) {
  if (!supabase || !records || records.length === 0) {
    return { saved: 0, newCount: 0, updatedCount: 0, newRecords: [] };
  }

  try {
    const urls = records.map(r => r.source_url).filter(Boolean);
    if (urls.length === 0) return { saved: 0, newCount: 0, updatedCount: 0, newRecords: [] };

    // 1. Find which source_urls already exist in DB
    const { data: existing, error: fetchErr } = await supabase
      .from("investors")
      .select("source_url")
      .in("source_url", urls);

    if (fetchErr) console.error("Fetch existing error:", fetchErr.message);

    const existingUrls = new Set((existing || []).map(e => e.source_url));

    // 2. Split records
    const newRecords = records.filter(r => r.source_url && !existingUrls.has(r.source_url));
    const existingRecords = records.filter(r => r.source_url && existingUrls.has(r.source_url));

    console.log(`📊 Save split: ${newRecords.length} new, ${existingRecords.length} existing`);

    // 3. Insert NEW records with session ID
    if (newRecords.length > 0) {
      const toInsert = newRecords.map(r => ({
        ...cleanForDB(r),
        crawl_session: sessionId,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      }));

      const { error } = await supabase.from("investors").insert(toInsert);
      if (error) console.error("Insert new error:", error.message);
    }

    // 4. Update EXISTING records
    if (existingRecords.length > 0) {
      for (const r of existingRecords) {
        const updated = {
          ...cleanForDB(r),
          last_seen_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from("investors")
          .update(updated)
          .eq("source_url", r.source_url);

        if (error) console.error("Update error:", error.message);
      }
    }

    return {
      saved: records.length,
      newCount: newRecords.length,
      updatedCount: existingRecords.length,
      newRecords,
      allRecords: records
    };
  } catch (err) {
    console.error("Save exception:", err.message);
    return { saved: 0, newCount: 0, updatedCount: 0, newRecords: [], error: err.message };
  }
}

async function saveReviewQueue(records, sessionId) {
  if (!supabase || !records || records.length === 0) {
    return { saved: 0, newCount: 0 };
  }

  try {
    const urls = records.map(r => r.source_url).filter(Boolean);
    if (urls.length === 0) return { saved: 0, newCount: 0 };

    const { data: existing } = await supabase
      .from("review_queue")
      .select("source_url")
      .in("source_url", urls);

    const existingUrls = new Set((existing || []).map(e => e.source_url));
    const newRecords = records.filter(r => r.source_url && !existingUrls.has(r.source_url));

    if (newRecords.length > 0) {
      const toInsert = newRecords.map(r => ({
        ...cleanForDB(r),
        quarantine_reason: r.quarantine_reason || "unknown",
        crawl_session: sessionId,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      }));

      const { error } = await supabase.from("review_queue").insert(toInsert);
      if (error) console.error("Review insert error:", error.message);
    }

    return { saved: newRecords.length, newCount: newRecords.length };
  } catch (err) {
    return { saved: 0, newCount: 0 };
  }
}

// 🎯 Get NEW records from latest session
async function getLatestSessionRecords() {
  if (!supabase) return [];
  try {
    const { data: latestSession } = await supabase
      .from("investors")
      .select("crawl_session")
      .order("first_seen_at", { ascending: false })
      .limit(1);

    if (!latestSession || latestSession.length === 0) return [];

    const sessionId = latestSession[0].crawl_session;
    if (!sessionId) return [];

    const { data, error } = await supabase
      .from("investors")
      .select("*")
      .eq("crawl_session", sessionId)
      .order("confidence_score", { ascending: false });

    if (error) return [];
    return data || [];
  } catch { return []; }
}

// Get ALL records
async function getAllInvestors() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("investors")
      .select("*")
      .order("first_seen_at", { ascending: false })
      .limit(5000);

    if (error) return [];
    return data || [];
  } catch { return []; }
}

function generateSessionId() {
  return `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 🎯 RESET EVERYTHING (use carefully)
async function resetAll() {
  if (!supabase) return { investors: 0, review: 0, error: "Supabase not configured" };
  try {
    const { count: invCount } = await supabase.from("investors").select("*", { count: "exact", head: true });
    const { count: revCount } = await supabase.from("review_queue").select("*", { count: "exact", head: true });

    await supabase.from("investors").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("review_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    return { investors: invCount || 0, review: revCount || 0 };
  } catch (err) {
    return { investors: 0, review: 0, error: err.message };
  }
}

module.exports = {
  supabase,
  saveInvestors,
  saveReviewQueue,
  getAllInvestors,
  getLatestSessionRecords,
  generateSessionId,
  resetAll,
  isConfigured: () => !!supabase
};