// db.js
// Supabase integration with confidence scoring + evidence URLs

const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

let supabase = null;
let configured = false;

function init() {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY
             || process.env.SUPABASE_ANON
             || process.env.SUPABASE_PUBLISHABLE_KEY
             || process.env.SUPABASE_PUBLISHABLE
             || process.env.SUPABASE_KEY;

    if (!url || !key) {
      console.log("⚠️  Supabase not configured");
      configured = false;
      return;
    }

    supabase = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { transport: ws }
    });
    configured = true;
    console.log("✅ Supabase client initialized");
  } catch (err) {
    console.error("❌ Supabase init failed:", err.message);
    configured = false;
  }
}

init();

function isConfigured() {
  return configured && supabase !== null;
}

// 🎯 mapRecord with confidence + freshness + evidence URLs
function mapRecord(r) {
  return {
    name: r.name || "",
    company_name: r.company_name || "",
    investor_type: r.investor_type || "",
    region: r.region || "",
    hq_city: r.hq_city || null,
    sectors: r.sectors || [],
    tags: r.tags || [],
    portfolio: r.portfolio || [],
    thesis: r.thesis || "",
    emails: r.emails || [],
    email_details: r.email_details || [],
    email_score: r.email_score ?? 0,
    linkedin: r.linkedin || [],
    linkedin_details: r.linkedin_details || [],
    linkedin_score: r.linkedin_score ?? 0,
    phones: r.phones || [],
    latest_year: r.latest_year ?? null,
    is_fresh: r.is_fresh ?? false,
    description: r.description || "",
    website: r.website || "",
    source_url: r.source_url || "",
    investor_score: r.investor_score ?? 0,
    confidence: r.confidence || "",
    status_code: r.status_code ?? null,
    crawl_type: r.crawl_type || "",
    crawl_query: r.crawl_query || "",
    entity_type: r.entity_type || "investor",
    // 🎯 NEW FIELDS
    source_urls: r.source_urls || [],
    confidence_score: r.confidence_score ?? 0,
    confidence_breakdown: r.confidence_breakdown || [],
    freshness_score: r.freshness_score ?? 100,
    freshness_label: r.freshness_label || "FRESH",
    days_since_verified: r.days_since_verified ?? 0,
    discovery_date: r.discovery_date || new Date().toISOString(),
    last_verified_date: r.last_verified_date || new Date().toISOString()
  };
}

async function saveInvestors(investors) {
  if (!isConfigured()) {
    return { saved: 0, skipped: investors.length, error: "Supabase not configured" };
  }
  if (!Array.isArray(investors) || investors.length === 0) {
    return { saved: 0, skipped: 0 };
  }

  const rows = investors.map(mapRecord);

  try {
    const CHUNK_SIZE = 100;
    let saved = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("investors")
        .insert(chunk)
        .select("id");
      if (error) {
        console.error("  Insert failed:", error.message);
        continue;
      }
      saved += data?.length || 0;
    }
    return { saved, skipped: rows.length - saved };
  } catch (err) {
    console.error("saveInvestors error:", err.message);
    return { saved: 0, skipped: rows.length, error: err.message };
  }
}

async function saveReviewQueue(reviewQueue) {
  if (!isConfigured()) {
    return { saved: 0, skipped: reviewQueue.length, error: "Supabase not configured" };
  }
  if (!Array.isArray(reviewQueue) || reviewQueue.length === 0) {
    return { saved: 0, skipped: 0 };
  }

  const rows = reviewQueue.map(r => ({
    ...mapRecord(r),
    review_reason: r.review_reason || ""
  }));

  try {
    const CHUNK_SIZE = 100;
    let saved = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("review_queue")
        .insert(chunk)
        .select("id");
      if (error) {
        console.error("  review_queue insert failed:", error.message);
        continue;
      }
      saved += data?.length || 0;
    }
    return { saved, skipped: rows.length - saved };
  } catch (err) {
    console.error("saveReviewQueue error:", err.message);
    return { saved: 0, skipped: rows.length, error: err.message };
  }
}

async function getAllInvestors() {
  if (!isConfigured()) return [];
  try {
    const { data, error } = await supabase
      .from("investors")
      .select("*")
      .order("confidence_score", { ascending: false })
      .limit(10000);
    if (error) {
      console.error("getAllInvestors error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("getAllInvestors error:", err.message);
    return [];
  }
}

async function getInvestorsByQuery(query) {
  if (!isConfigured()) return [];
  try {
    const { data, error } = await supabase
      .from("investors")
      .select("*")
      .eq("crawl_query", query)
      .order("confidence_score", { ascending: false })
      .limit(1000);
    if (error) {
      console.error("getInvestorsByQuery error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("getInvestorsByQuery error:", err.message);
    return [];
  }
}

async function deleteAllInvestors() {
  if (!isConfigured()) return { deleted: 0 };
  try {
    const { data, error } = await supabase
      .from("investors")
      .delete()
      .neq("id", 0)
      .select("id");
    if (error) {
      console.error("deleteAllInvestors error:", error.message);
      return { deleted: 0, error: error.message };
    }
    return { deleted: data?.length || 0 };
  } catch (err) {
    console.error("deleteAllInvestors error:", err.message);
    return { deleted: 0, error: err.message };
  }
}

module.exports = {
  saveInvestors,
  saveReviewQueue,
  getAllInvestors,
  getInvestorsByQuery,
  deleteAllInvestors,
  isConfigured
};