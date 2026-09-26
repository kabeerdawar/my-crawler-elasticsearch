// discovery-search.js
// 🎯 Multi-entity DDG search — entity-aware queries

const axios = require("axios");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 🎯 Entity-specific query templates
function buildSearchQueries(parsed) {
  const queries = [];
  const entityType = parsed.entityType || "investor";
  const location = parsed.city || parsed.region || "India";
  const sectorStr = parsed.sectors.length ? parsed.sectors.join(" ") : "";
  
  const TEMPLATES = {
    investor: [
      `top VC investors ${sectorStr} ${location}`,
      `venture capital firms ${location} ${sectorStr}`,
      `angel investors ${location}`,
      `"investor" "${location}" portfolio team contact`
    ],
    wholesaler: [
      `wholesaler ${sectorStr} ${location}`,
      `wholesale suppliers ${location} ${sectorStr}`,
      `bulk supplier ${location} contact`,
      `"wholesaler" "${location}" contact email`,
      `wholesale market ${location} directory`
    ],
    supplier: [
      `supplier ${sectorStr} ${location}`,
      `suppliers in ${location} ${sectorStr}`,
      `"supplier" "${location}" contact email`,
      `verified suppliers ${location}`
    ],
    manufacturer: [
      `manufacturer ${sectorStr} ${location}`,
      `manufacturers in ${location}`,
      `"manufacturer" "${location}" contact`,
      `factory ${location} ${sectorStr}`
    ],
    exporter: [
      `exporter ${sectorStr} ${location}`,
      `export company ${location}`,
      `"exporter" "${location}" contact email`
    ],
    importer: [
      `importer ${sectorStr} ${location}`,
      `import company ${location}`,
      `"importer" "${location}" contact`
    ],
    dealer: [
      `dealer ${sectorStr} ${location}`,
      `dealers in ${location}`,
      `"dealer" "${location}" contact`,
      `retailer ${location} ${sectorStr}`
    ],
    service_provider: [
      `${sectorStr} ${location} contact`,
      `best ${sectorStr} in ${location}`,
      `"${sectorStr}" "${location}" email`
    ]
  };
  
  const templates = TEMPLATES[entityType] || TEMPLATES.investor;
  for (const t of templates) {
    const q = t.trim().replace(/\s+/g, " ");
    if (q.length > 5) queries.push(q);
  }
  
  // Directory-site specific queries
  if (entityType !== "investor") {
    const DIRECTORIES = {
      wholesaler: ["indiamart.com", "tradeindia.com", "exportersindia.com"],
      supplier: ["indiamart.com", "tradeindia.com", "globalsources.com"],
      manufacturer: ["indiamart.com", "tradeindia.com", "thomasnet.com"],
      exporter: ["exportersindia.com", "tradeindia.com"],
      importer: ["tradeindia.com", "indiamart.com"],
      dealer: ["justdial.com", "sulekha.com", "indiamart.com"],
      service_provider: ["justdial.com", "sulekha.com", "practo.com"]
    };
    
    const dirs = DIRECTORIES[entityType] || [];
    for (const d of dirs.slice(0, 2)) {
      queries.push(`site:${d} ${sectorStr} ${location}`.trim());
    }
  }
  
  return [...new Set(queries)];
}

async function ddgSearch(query, limit = 30) {
  try {
    const url = "https://html.duckduckgo.com/html/";
    const res = await axios.post(url,
      new URLSearchParams({ q: query }).toString(),
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9"
        },
        timeout: 20000,
        maxContentLength: 5 * 1024 * 1024,
        validateStatus: () => true
      }
    );

    if (res.status !== 200) return [];

    const html = String(res.data);
    const results = [];

    const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
      let link = match[1];
      const uddgMatch = link.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        try { link = decodeURIComponent(uddgMatch[1]); } catch {}
      }
      if (/^https?:\/\//i.test(link)) results.push(link);
    }

    if (results.length === 0) {
      const altRegex = /href="(https?:\/\/[^"]+)"/g;
      while ((match = altRegex.exec(html)) !== null && results.length < limit) {
        const link = match[1];
        if (!link.includes("duckduckgo.com")) results.push(link);
      }
    }

    return results;
  } catch (err) {
    console.error("DDG search failed:", err.message);
    return [];
  }
}

async function discoverSourcesFromQuery(parsed, limit = 30) {
  const queries = buildSearchQueries(parsed);
  const allResults = [];
  const seen = new Set();
  const entityType = parsed.entityType || "investor";

  console.log(`🔍 DDG search for entity: ${entityType}, queries: ${queries.length}`);

  for (const query of queries) {
    console.log(`  🔎 DDG: "${query}"`);
    const urls = await ddgSearch(query, Math.ceil(limit / queries.length) + 5);
    for (const url of urls) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (!seen.has(host)) {
          seen.add(host);
          allResults.push({ url, host });
        }
      } catch {}
    }
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`  ✅ DDG found ${allResults.length} unique domains`);
  return allResults.slice(0, limit);
}

module.exports = { discoverSourcesFromQuery };