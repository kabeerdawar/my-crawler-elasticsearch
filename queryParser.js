// queryParser.js

const REGION_ALIASES = {
  "usa":"USA","us":"USA","u.s.":"USA","america":"USA","united states":"USA","american":"USA",
  "india":"India","indian":"India","bharat":"India",
  "uk":"UK","u.k.":"UK","united kingdom":"UK","britain":"UK","british":"UK","england":"UK",
  "europe":"Europe","european":"Europe","eu":"Europe","germany":"Europe",
  "france":"Europe","netherlands":"Europe","spain":"Europe","italy":"Europe",
  "sweden":"Europe","ireland":"Europe","switzerland":"Europe","denmark":"Europe",
  "middle east":"Middle_East","uae":"Middle_East",
  "saudi":"Middle_East","israel":"Middle_East","qatar":"Middle_East",
  "southeast asia":"Southeast_Asia",
  "singapore":"Southeast_Asia","indonesia":"Southeast_Asia","malaysia":"Southeast_Asia",
  "thailand":"Southeast_Asia","vietnam":"Southeast_Asia","philippines":"Southeast_Asia",
  "japan":"East_Asia","china":"East_Asia","korea":"East_Asia","south korea":"East_Asia",
  "latin america":"Latin_America","latam":"Latin_America","brazil":"Latin_America",
  "mexico":"Latin_America","argentina":"Latin_America","chile":"Latin_America",
  "africa":"Africa","nigeria":"Africa","kenya":"Africa","south africa":"Africa","egypt":"Africa"
};

const SECTOR_ALIASES = {
  "ai":"AI","artificial intelligence":"AI","machine learning":"AI",
  "generative ai":"AI","genai":"AI",
  "saas":"SaaS","software":"SaaS","software as a service":"SaaS",
  "fintech":"FinTech","fin tech":"FinTech","payments":"FinTech",
  "healthcare":"Healthcare","health tech":"Healthcare","healthtech":"Healthcare","biotech":"Healthcare",
  "edtech":"EdTech","education":"EdTech",
  "climate":"ClimateTech","climate tech":"ClimateTech","climatetech":"ClimateTech","cleantech":"ClimateTech",
  "cybersecurity":"Cybersecurity","cyber security":"Cybersecurity","security":"Cybersecurity",
  "ecommerce":"ECommerce","e-commerce":"ECommerce","marketplace":"ECommerce",
  "consumer":"Consumer",
  "deep tech":"DeepTech","deeptech":"DeepTech",
  "agritech":"AgriTech","agriculture":"AgriTech",
  "mobility":"Mobility","ev":"Mobility",
  "space":"SpaceTech","spacetech":"SpaceTech",
  "msme":"MSME","small business":"MSME","sme":"MSME"
};

const STAGE_ALIASES = {
  "pre-seed":"Pre-Seed","preseed":"Pre-Seed","pre seed":"Pre-Seed",
  "seed":"Seed",
  "early stage":"Early Stage","early-stage":"Early Stage",
  "series a":"Series A","series-a":"Series A",
  "series b":"Series B","series-b":"Series B"
};

const TYPE_ALIASES = {
  "vc":"Venture Capital","venture capital":"Venture Capital",
  "angel":"Angel Investor","angel investor":"Angel Investor","angels":"Angel Investor",
  "family office":"Family Fund","family fund":"Family Fund",
  "private equity":"Private Equity","pe":"Private Equity",
  "hni":"HNI","high net worth":"HNI"
};

const CITY_ALIASES = {
  // USA
  "san francisco":"San Francisco","sf":"San Francisco","bay area":"San Francisco","silicon valley":"San Francisco",
  "new york":"New York","nyc":"New York",
  "boston":"Boston","los angeles":"Los Angeles","austin":"Austin",
  "seattle":"Seattle","chicago":"Chicago","denver":"Denver","miami":"Miami",
  "atlanta":"Atlanta","dallas":"Dallas","portland":"Portland","san diego":"San Diego",
  "washington dc":"Washington DC","washington":"Washington DC",

  // India
  "delhi":"Delhi","new delhi":"Delhi","ncr":"Delhi","noida":"Delhi","gurgaon":"Delhi","gurugram":"Delhi",
  "mumbai":"Mumbai","bombay":"Mumbai",
  "bangalore":"Bangalore","bengaluru":"Bangalore",
  "hyderabad":"Hyderabad","chennai":"Chennai","madras":"Chennai","pune":"Pune",
  "ahmedabad":"Ahmedabad","kolkata":"Kolkata","calcutta":"Kolkata","jaipur":"Jaipur",
  "chandigarh":"Chandigarh","kochi":"Kochi",

  // UK
  "london":"London","manchester":"Manchester","edinburgh":"Edinburgh","bristol":"Bristol",

  // Europe
  "berlin":"Berlin","munich":"Munich","paris":"Paris","amsterdam":"Amsterdam",
  "stockholm":"Stockholm","copenhagen":"Copenhagen","dublin":"Dublin",
  "madrid":"Madrid","barcelona":"Barcelona","milan":"Milan","rome":"Rome",
  "zurich":"Zurich","oslo":"Oslo","helsinki":"Helsinki",

  // Middle East
  "dubai":"Dubai","abu dhabi":"Abu Dhabi","riyadh":"Riyadh",
  "tel aviv":"Tel Aviv","doha":"Doha",

  // SEA
  "singapore":"Singapore","jakarta":"Jakarta","kuala lumpur":"Kuala Lumpur",
  "bangkok":"Bangkok","ho chi minh":"Ho Chi Minh","manila":"Manila",

  // East Asia
  "tokyo":"Tokyo","osaka":"Osaka","hong kong":"Hong Kong",
  "shanghai":"Shanghai","beijing":"Beijing","seoul":"Seoul",

  // LatAm
  "sao paulo":"Sao Paulo","rio de janeiro":"Rio de Janeiro","mexico city":"Mexico City",
  "buenos aires":"Buenos Aires","santiago":"Santiago","bogota":"Bogota",

  // Africa
  "lagos":"Lagos","nairobi":"Nairobi","cape town":"Cape Town","cairo":"Cairo"
};

const CITY_TO_REGION = {
  // USA
  "San Francisco":"USA","New York":"USA","Boston":"USA","Los Angeles":"USA",
  "Austin":"USA","Seattle":"USA","Chicago":"USA","Denver":"USA","Miami":"USA",
  "Atlanta":"USA","Dallas":"USA","Portland":"USA","San Diego":"USA",
  "Washington DC":"USA",
  // India
  "Delhi":"India","Mumbai":"India","Bangalore":"India","Hyderabad":"India",
  "Chennai":"India","Pune":"India","Ahmedabad":"India","Kolkata":"India",
  "Jaipur":"India","Chandigarh":"India","Kochi":"India",
  // UK
  "London":"UK","Manchester":"UK","Edinburgh":"UK","Bristol":"UK",
  // Europe
  "Berlin":"Europe","Munich":"Europe","Paris":"Europe","Amsterdam":"Europe",
  "Stockholm":"Europe","Copenhagen":"Europe","Dublin":"Europe","Madrid":"Europe",
  "Barcelona":"Europe","Milan":"Europe","Rome":"Europe","Zurich":"Europe",
  "Oslo":"Europe","Helsinki":"Europe",
  // Middle East
  "Dubai":"Middle_East","Abu Dhabi":"Middle_East","Riyadh":"Middle_East",
  "Tel Aviv":"Middle_East","Doha":"Middle_East",
  // SEA
  "Singapore":"Southeast_Asia","Jakarta":"Southeast_Asia","Kuala Lumpur":"Southeast_Asia",
  "Bangkok":"Southeast_Asia","Ho Chi Minh":"Southeast_Asia","Manila":"Southeast_Asia",
  // East Asia
  "Tokyo":"East_Asia","Osaka":"East_Asia","Hong Kong":"East_Asia",
  "Shanghai":"East_Asia","Beijing":"East_Asia","Seoul":"East_Asia",
  // LatAm
  "Sao Paulo":"Latin_America","Rio de Janeiro":"Latin_America","Mexico City":"Latin_America",
  "Buenos Aires":"Latin_America","Santiago":"Latin_America","Bogota":"Latin_America",
  // Africa
  "Lagos":"Africa","Nairobi":"Africa","Cape Town":"Africa","Cairo":"Africa"
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s\-\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findAliases(text, map) {
  const hits = new Set();
  for (const [alias, canonical] of Object.entries(map)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
    if (pattern.test(text)) hits.add(canonical);
  }
  return [...hits];
}

function findCity(text) {
  // Sort aliases by length (longest first) so "new york" wins over "york"
  const aliases = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);

  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
    if (pattern.test(text)) {
      return CITY_ALIASES[alias];
    }
  }
  return null;
}

function parseQuery(raw) {
  const query = String(raw || "").trim();
  const n = normalize(query);

  const regions = findAliases(n, REGION_ALIASES);
  const sectors = findAliases(n, SECTOR_ALIASES);
  const stages = findAliases(n, STAGE_ALIASES);
  const types = findAliases(n, TYPE_ALIASES);
  const city = findCity(n);

  let cityRegion = null;
  if (city && CITY_TO_REGION[city]) {
    cityRegion = CITY_TO_REGION[city];
    if (!regions.includes(cityRegion)) {
      regions.unshift(cityRegion);
    }
  }

  const hasInvestorWord = /\binvestor|\bvc\b|\bangel\b|\bfund\b/i.test(query);
  const understood = regions.length + sectors.length + stages.length + types.length > 0;

  if (!understood && hasInvestorWord) {
    types.push("Venture Capital");
    types.push("Angel Investor");
  }

  return {
    raw: query,
    region: regions[0] || null,
    city: city,
    cityRegion: cityRegion,
    allRegions: regions,
    sectors,
    stages,
    investorTypes: types,
    understood: understood || hasInvestorWord
  };
}

module.exports = { parseQuery };