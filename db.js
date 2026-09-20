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
  console.log("⚠️  Supabase keys missing — JSON only");
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

async function saveInvestors(records) {
  if (!supabase || !records || records.length === 0) return { saved: 0 };
  try {
    const urls = records.map(r => r.source_url).filter(Boolean);
    if (urls.length) await supabase.from("investors").delete().in("source_url", urls);

    const cleaned = records.map(cleanForDB).filter(r => r.source_url);
    if (cleaned.length === 0) return { saved: 0 };

    const { data, error } = await supabase.from("investors").insert(cleaned).select();
    if (error) { console.error("Supabase save error:", error.message); return { saved: 0, error: error.message }; }
    return { saved: data.length };
  } catch (err) {
    console.error("Save exception:", err.message);
    return { saved: 0, error: err.message };
  }
}

async function saveReviewQueue(records) {
  if (!supabase || !records || records.length === 0) return { saved: 0 };
  try {
    const urls = records.map(r => r.source_url).filter(Boolean);
    if (urls.length) await supabase.from("review_queue").delete().in("source_url", urls);

    const cleaned = records.map(r => ({ ...cleanForDB(r), quarantine_reason: r.quarantine_reason || "unknown" })).filter(r => r.source_url);
    if (cleaned.length === 0) return { saved: 0 };

    const { data, error } = await supabase.from("review_queue").insert(cleaned).select();
    if (error) { console.error("Review save error:", error.message); return { saved: 0 }; }
    return { saved: data.length };
  } catch { return { saved: 0 }; }
}

async function getAllInvestors() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("investors")
      .select("*")
      .order("confidence_score", { ascending: false })
      .limit(5000);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

module.exports = { supabase, saveInvestors, saveReviewQueue, getAllInvestors, isConfigured: () => !!supabase };