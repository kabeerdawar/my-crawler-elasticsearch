// api-sources.js
// Free public APIs for investor discovery.

const axios = require("axios");

// ---------- TECH.EU (EU funding — free, no auth) ----------
async function fetchTechEu({ limit = 50 } = {}) {
  try {
    const res = await axios.get("https://funding.tech.eu/api/v1/rounds", {
      params: { limit },
      timeout: 15000,
      headers: { "User-Agent": "InvestorCrawler/1.0" }
    });
    return normalizeTechEu(res.data);
  } catch (err) {
    console.error("Tech.eu error:", err.message);
    return [];
  }
}

function normalizeTechEu(data) {
  const rounds = Array.isArray(data) ? data : (data.rounds || data.data || []);
  const records = [];

  for (const r of rounds) {
    const investors = r.investors || r.investor_list || [];
    for (const inv of investors) {
      const name = inv.name || inv.investor_name || "";
      if (!name) continue;
      const year = r.date ? new Date(r.date).getFullYear() : null;
      records.push({
        name: "",
        company_name: name,
        investor_type: "Venture Capital",
        region: "Europe",
        sectors: [r.sector, r.industry].filter(Boolean),
        tags: ["Funding Round"],
        emails: [],
        email_details: [],
        email_score: 0,
        linkedin: inv.linkedin ? [inv.linkedin] : [],
        linkedin_details: [],
        linkedin_score: 0,
        phones: [],
        latest_year: year,
        is_fresh: year && year >= 2024,
        website: inv.website || "",
        source_url: r.url || inv.url || "https://funding.tech.eu",
        investor_score: 8,
        crawl_type: "tech_eu_api"
      });
    }
  }
  return records;
}

// ---------- GITDEALFLOW (free Crunchbase alternative) ----------
async function fetchGitDealFlow() {
  try {
    const res = await axios.get("https://signals.gitdealflow.com/api/signals.json", {
      timeout: 15000,
      headers: { "User-Agent": "InvestorCrawler/1.0" }
    });
    return normalizeGitDealFlow(res.data);
  } catch (err) {
    console.error("GitDealFlow error:", err.message);
    return [];
  }
}

function normalizeGitDealFlow(data) {
  const signals = Array.isArray(data) ? data : (data.signals || []);
  const records = [];

  for (const s of signals) {
    const name = s.company || s.name || "";
    if (!name) continue;
    const year = s.date ? new Date(s.date).getFullYear() : null;
    records.push({
      name: "",
      company_name: name,
      investor_type: "Venture Capital",
      region: s.country || "",
      sectors: s.sector ? [s.sector] : [],
      tags: s.stage ? [s.stage] : [],
      emails: [],
      email_details: [],
      email_score: 0,
      linkedin: [],
      linkedin_details: [],
      linkedin_score: 0,
      phones: [],
      latest_year: year,
      is_fresh: year && year >= 2024,
      website: s.website || "",
      source_url: s.url || "https://gitdealflow.com",
      investor_score: 7,
      crawl_type: "gitdealflow_api"
    });
  }
  return records;
}

// ---------- SEC EDGAR FORM D (US govt data) ----------
async function fetchSecEdgarFormD({ limit = 20 } = {}) {
  try {
    const res = await axios.get(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=D&dateb=&owner=include&count=${limit}&output=atom`,
      {
        timeout: 15000,
        headers: {
          "User-Agent": "InvestorCrawler/1.0 (your-email@example.com)",
          "Accept-Encoding": "gzip, deflate"
        }
      }
    );
    return normalizeSecEdgar(res.data);
  } catch (err) {
    console.error("SEC EDGAR error:", err.message);
    return [];
  }
}

function normalizeSecEdgar(xml) {
  const records = [];
  const entries = String(xml).split("<entry>").slice(1);

  for (const entry of entries) {
    const companyMatch = entry.match(/<title>([^<]+)<\/title>/);
    const urlMatch = entry.match(/<link[^>]+href="([^"]+)"/);
    const dateMatch = entry.match(/<updated>([^<]+)<\/updated>/);

    if (companyMatch) {
      const year = dateMatch ? new Date(dateMatch[1]).getFullYear() : null;
      records.push({
        name: "",
        company_name: companyMatch[1].trim(),
        investor_type: "Venture Capital",
        region: "USA",
        sectors: [],
        tags: ["Form D"],
        emails: [],
        email_details: [],
        email_score: 0,
        linkedin: [],
        linkedin_details: [],
        linkedin_score: 0,
        phones: [],
        latest_year: year,
        is_fresh: year && year >= 2024,
        website: "",
        source_url: urlMatch ? urlMatch[1] : "https://www.sec.gov/edgar",
        investor_score: 9,
        crawl_type: "sec_edgar"
      });
    }
  }
  return records;
}

// ---------- SBIR.GOV (US deep-tech grants) ----------
async function fetchSbir({ keyword = "", limit = 20 } = {}) {
  try {
    const params = { rows: limit };
    if (keyword) params.keyword = keyword;

    const res = await axios.get("https://api.www.sbir.gov/public/api/awards", {
      params,
      timeout: 15000,
      headers: { "User-Agent": "InvestorCrawler/1.0" }
    });
    return normalizeSbir(res.data);
  } catch (err) {
    console.error("SBIR error:", err.message);
    return [];
  }
}

function normalizeSbir(data) {
  const awards = Array.isArray(data) ? data : [];
  const records = [];

  for (const a of awards) {
    const name = a.firm || a.company || "";
    if (!name) continue;
    const year = a.award_year ? parseInt(a.award_year) : null;
    records.push({
      name: "",
      company_name: name,
      investor_type: "Venture Capital",
      region: "USA",
      sectors: a.topic ? [a.topic] : [],
      tags: ["SBIR Grant"],
      emails: [],
      email_details: [],
      email_score: 0,
      linkedin: [],
      linkedin_details: [],
      linkedin_score: 0,
      phones: [],
      latest_year: year,
      is_fresh: year && year >= 2024,
      website: a.firm_url || "",
      source_url: "https://www.sbir.gov",
      investor_score: 7,
      crawl_type: "sbir_api"
    });
  }
  return records;
}

module.exports = {
  fetchTechEu,
  fetchGitDealFlow,
  fetchSecEdgarFormD,
  fetchSbir
};