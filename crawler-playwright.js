// crawler-playwright.js
// MyCrawler Browser Acquisition Engine
// Browser acquisition -> raw evidence -> clean extraction -> quality gate

"use strict";

const { chromium } = require("playwright");
const cheerio = require("cheerio");
const axios = require("axios");
const robotsParser = require("robots-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  extractInvestorData,
  extractMultipleInvestors,
  extractPortfolioCompanies,
  extractGenericEntity
} = require("./extractor");

// IMPORTANT:
// Load AI lazily so this crawler has no module-level async dependency.
let ai = null;

function getAIHelper() {
  if (!ai) {
    ai = require("./ai-helper");
  }

  return ai;
}

// ============================================================
// CONFIG
// ============================================================

const MAX_PAGES_PER_SITE = 30;
const NAVIGATION_TIMEOUT = 45000;
const NETWORK_IDLE_TIMEOUT = 8000;
const MAX_NETWORK_RESPONSES = 100;
const MAX_DISCOVERED_LINKS = 80;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

const ROBOTS_USER_AGENT = "InvestorCrawler/2.0";

const RAW_STORAGE_DIR = path.join(
  process.cwd(),
  "data",
  "crawl-raw"
);

// ============================================================
// BLACKLIST
// ============================================================

const DOMAIN_BLACKLIST = [
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "wikipedia.org",
  "reddit.com",
  "quora.com",
  "medium.com",
  "glassdoor.com",
  "indeed.com",

  "nasscom.in",
  "cii.in",
  "ficci.com",
  "inc42.com",
  "yourstory.com",
  "techcrunch.com",
  "entrackr.com",
  "economictimes.indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "moneycontrol.com",
  "vccircle.com",
  "medianama.com",
  "forbes.com",
  "bloomberg.com",
  "reuters.com",
  "cnbc.com",

  "justdial.com",
  "indiamart.com",
  "tradeindia.com",
  "sulekha.com",
  "practo.com",
  "urbancompany.com",
  "exportersindia.com"
];

// ============================================================
// BASIC HELPERS
// ============================================================

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value));

    url.hash = "";

    const removeParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid"
    ];

    for (const param of removeParams) {
      url.searchParams.delete(param);
    }

    return url.href;
  } catch {
    return null;
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

function isBlacklisted(url) {
  const host = getHostname(url);

  if (!host) {
    return false;
  }

  return DOMAIN_BLACKLIST.some(
    domain =>
      host === domain ||
      host.endsWith("." + domain)
  );
}

function sameDomain(a, b) {
  const hostA = getHostname(a);
  const hostB = getHostname(b);

  return Boolean(hostA && hostB && hostA === hostB);
}

function contentHash(content) {
  return crypto
    .createHash("sha256")
    .update(String(content || ""))
    .digest("hex");
}

function safeFilename(value) {
  return String(value || "")
    .replace(/[^a-z0-9._-]/gi, "_")
    .slice(0, 150);
}

function ensureRawStorage() {
  fs.mkdirSync(
    RAW_STORAGE_DIR,
    {
      recursive: true
    }
  );
}

// ============================================================
// RAW EVIDENCE
// ============================================================

function saveRawEvidence({
  url,
  html,
  networkResponses,
  metadata
}) {
  try {
    ensureRawStorage();

    const hash = contentHash(html);

    const timestamp =
      new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const hostname =
      safeFilename(
        getHostname(url)
      );

    const filename =
      `${timestamp}_${hostname}_${hash.slice(0, 12)}.json`;

    const outputPath =
      path.join(
        RAW_STORAGE_DIR,
        filename
      );

    const evidence = {
      url,
      crawled_at:
        new Date().toISOString(),

      content: {
        hash,
        size:
          Buffer.byteLength(
            String(html || ""),
            "utf8"
          ),
        html
      },

      network_responses:
        Array.isArray(networkResponses)
          ? networkResponses
          : [],

      metadata:
        metadata || {}
    };

    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        evidence,
        null,
        2
      ),
      "utf8"
    );

    return {
      path: outputPath,
      hash
    };
  } catch (error) {
    console.error(
      "Raw evidence storage failed:",
      error.message
    );

    return {
      path: null,
      hash: contentHash(html)
    };
  }
}

// ============================================================
// ROBOTS
// ============================================================

async function getRobots(startUrl) {
  try {
    const parsed =
      new URL(startUrl);

    const robotsUrl =
      `${parsed.protocol}//${parsed.hostname}/robots.txt`;

    const response =
      await axios.get(
        robotsUrl,
        {
          timeout: 10000,
          headers: {
            "User-Agent":
              ROBOTS_USER_AGENT
          },
          validateStatus:
            () => true
        }
      );

    if (response.status >= 400) {
      return null;
    }

    return robotsParser(
      robotsUrl,
      response.data
    );
  } catch {
    return null;
  }
}

async function canCrawl(
  robots,
  url
) {
  if (!robots) {
    return true;
  }

  try {
    return robots.isAllowed(
      url,
      ROBOTS_USER_AGENT
    ) !== false;
  } catch {
    return true;
  }
}

// ============================================================
// PAGE CLASSIFICATION
// ============================================================

function isTeamPage(url) {
  return /\/(team|people|leadership|partners|management|founders|about|investors|advisors|staff|directors|our-team|our-people)(\/|$)/i
    .test(String(url || ""));
}

function isContactPage(url) {
  return /\/(contact|contact-us|get-in-touch|reach-us|impressum)(\/|$)/i
    .test(String(url || ""));
}

function isPortfolioPage(url) {
  return /\/(portfolio|companies|investments|backed|our-companies|funded|startups)(\/|$)/i
    .test(String(url || ""));
}

function isStrategyPage(url) {
  return /\/(thesis|strategy|focus|what-we-invest-in|investment-strategy)(\/|$)/i
    .test(String(url || ""));
}

function classifyPage(
  url,
  text
) {
  const u =
    String(url || "")
      .toLowerCase();

  const t =
    String(text || "")
      .toLowerCase();

  if (isTeamPage(u)) {
    return "team";
  }

  if (isContactPage(u)) {
    return "contact";
  }

  if (isPortfolioPage(u)) {
    return "portfolio";
  }

  if (isStrategyPage(u)) {
    return "strategy";
  }

  if (
    /\/(fund|funds|fund-i|fund-ii|fund-iii)(\/|$)/i
      .test(u) ||
    t.includes("fund size")
  ) {
    return "fund";
  }

  if (
    /\/(news|press|announcements|insights)(\/|$)/i
      .test(u)
  ) {
    return "news";
  }

  if (
    t.includes("venture capital") ||
    t.includes("private equity") ||
    t.includes("investment firm") ||
    t.includes("angel investor") ||
    t.includes("family office") ||
    t.includes("portfolio companies")
  ) {
    return "investor";
  }

  return "general";
}

// ============================================================
// CLEAN EXTRACTION DOM
// ============================================================

function buildCleanPage($) {
  const html = $.html();

  const clean =
    cheerio.load(
      html,
      {
        decodeEntities: true
      }
    );

  clean(
    [
      "script",
      "style",
      "noscript",
      "template",
      "svg",
      "iframe",
      "canvas",

      "nav",
      "footer",
      "header",
      "aside",

      "[role='navigation']",
      "[role='banner']",
      "[role='contentinfo']",

      ".cookie",
      ".cookies",
      ".cookie-banner",
      ".cookie-consent",

      ".popup",
      ".modal",
      ".newsletter",

      ".social",
      ".share",
      ".social-links",

      ".navbar",
      ".nav",
      ".menu",
      ".mobile-menu",

      ".breadcrumb",
      ".breadcrumbs",

      ".advertisement",
      ".advertisements",
      ".ads",
      ".ad"
    ].join(",")
  ).remove();

  return clean;
}

function getSemanticText($) {
  const clean =
    buildCleanPage($);

  const selectors = [
    "main",
    "[role='main']",
    "article",
    ".main-content",
    ".page-content",
    ".entry-content",
    ".content"
  ];

  for (const selector of selectors) {
    const node =
      clean(selector).first();

    if (!node.length) {
      continue;
    }

    const text =
      cleanText(
        node.text()
      );

    if (text.length >= 200) {
      return text;
    }
  }

  return cleanText(
    clean("body").text()
  );
}

// ============================================================
// CONTAMINATION DETECTION
// ============================================================

const NAVIGATION_WORDS = [
  "open menu",
  "log in",
  "sign in",
  "sign up",
  "facebook",
  "instagram",
  "twitter",
  "youtube",
  "linkedin",
  "newsletter",
  "startup directory",
  "founder directory",
  "resources",
  "apply"
];

function navigationContaminationScore(
  value
) {
  const text =
    String(value || "")
      .toLowerCase();

  if (!text) {
    return 0;
  }

  let score = 0;

  for (const word of NAVIGATION_WORDS) {
    if (text.includes(word)) {
      score++;
    }
  }

  return score;
}

function isNavigationContaminated(
  record
) {
  if (!record) {
    return true;
  }

  const combined = [
    record.name,
    record.company_name,
    record.description
  ]
    .filter(Boolean)
    .join(" ");

  const score =
    navigationContaminationScore(
      combined
    );

  if (score >= 4) {
    return true;
  }

  const company =
    String(
      record.company_name || ""
    )
      .toLowerCase();

  if (
    /facebook.*instagram.*linkedin/i
      .test(company)
  ) {
    return true;
  }

  return false;
}

// ============================================================
// RECORD CLEANING
// ============================================================

function cleanName(value) {
  let text =
    cleanText(value);

  if (!text) {
    return "";
  }

  text =
    text
      .replace(
        /\b(open menu|log in|sign in|sign up|apply|newsletter)\b/gi,
        " "
      )
      .replace(
        /\b(facebook|instagram|twitter|youtube|linkedin)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

  if (
    /^(home|about|contact|portfolio|companies|team|people|resources|investors)$/i
      .test(text)
  ) {
    return "";
  }

  if (
    text.length > 120
  ) {
    return "";
  }

  return text;
}

function cleanCompanyName(value) {
  let text =
    cleanText(value);

  if (!text) {
    return "";
  }

  text =
    text
      .replace(
        /\b(open menu|log in|sign in|sign up|apply|newsletter)\b/gi,
        " "
      )
      .replace(
        /\b(facebook|instagram|twitter|youtube|linkedin)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

  if (
    navigationContaminationScore(
      text
    ) >= 3
  ) {
    return "";
  }

  if (
    text.length > 160
  ) {
    return "";
  }

  return text;
}

function cleanDescription(value) {
  let text =
    cleanText(value);

  if (!text) {
    return "";
  }

  text =
    text
      .replace(
        /\b(open menu|log in|sign in|sign up)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

  if (
    navigationContaminationScore(
      text
    ) >= 5
  ) {
    return "";
  }

  return text.slice(
    0,
    5000
  );
}

function uniqueStrings(
  values
) {
  if (!Array.isArray(values)) {
    return [];
  }

  const output = [];
  const seen = new Set();

  for (const value of values) {
    const text =
      cleanText(value);

    if (!text) {
      continue;
    }

    const key =
      text.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(text);
  }

  return output;
}

function normalizeRecord(
  record,
  url,
  entityType,
  metadata = {}
) {
  const r =
    record &&
    typeof record === "object"
      ? { ...record }
      : {};

  r.name =
    cleanName(r.name);

  r.company_name =
    cleanCompanyName(
      r.company_name
    );

  r.description =
    cleanDescription(
      r.description
    );

  r.sectors =
    uniqueStrings(
      r.sectors
    );

  r.tags =
    uniqueStrings(
      r.tags
    );

  r.stages =
    uniqueStrings(
      r.stages
    );

  r.portfolio =
    uniqueStrings(
      r.portfolio
    );

  r.emails =
    uniqueStrings(
      r.emails
    );

  r.linkedin =
    uniqueStrings(
      r.linkedin
    );

  r.phones =
    uniqueStrings(
      r.phones
    );

  r.source_urls =
    uniqueStrings([
      ...(Array.isArray(r.source_urls)
        ? r.source_urls
        : []),
      r.source_url,
      url
    ]);

  r.source_url =
    r.source_url ||
    url;

  r.website =
    r.website ||
    url;

  r.entity_type =
    r.entity_type ||
    entityType ||
    "investor";

  r.crawl_metadata = {
    ...(r.crawl_metadata || {}),
    ...metadata
  };

  r.extraction_version =
    "3.0";

  r.extracted_at =
    new Date().toISOString();

  if (
    !r.confidence
  ) {
    if (
      r.name &&
      r.company_name
    ) {
      r.confidence = "HIGH";
    } else if (
      r.company_name ||
      r.name
    ) {
      r.confidence = "MEDIUM";
    } else {
      r.confidence = "LOW";
    }
  }

  return r;
}

// ============================================================
// RECORD QUALITY
// ============================================================

function recordQuality(
  record
) {
  if (!record) {
    return {
      valid: false,
      score: 0
    };
  }

  let score = 0;

  if (
    cleanName(record.name)
  ) {
    score += 3;
  }

  if (
    cleanCompanyName(
      record.company_name
    )
  ) {
    score += 3;
  }

  if (
    Array.isArray(record.sectors) &&
    record.sectors.length
  ) {
    score += 1;
  }

  if (
    Array.isArray(record.stages) &&
    record.stages.length
  ) {
    score += 1;
  }

  if (
    Array.isArray(record.emails) &&
    record.emails.length
  ) {
    score += 2;
  }

  if (
    Array.isArray(record.linkedin) &&
    record.linkedin.length
  ) {
    score += 2;
  }

  if (
    cleanDescription(
      record.description
    )
  ) {
    score += 1;
  }

  if (
    isNavigationContaminated(
      record
    )
  ) {
    return {
      valid: false,
      score: 0,
      reason:
        "navigation_contamination"
    };
  }

  if (
    !record.source_url
  ) {
    return {
      valid: false,
      score,
      reason:
        "missing_source_url"
    };
  }

  if (
    !record.name &&
    !record.company_name
  ) {
    return {
      valid: false,
      score,
      reason:
        "no_identity"
    };
  }

  return {
    valid: score >= 3,
    score
  };
}

// ============================================================
// LINK DISCOVERY
// ============================================================

function linkPriority(
  url,
  anchorText
) {
  const value =
    `${url} ${anchorText}`
      .toLowerCase();

  let score = 0;

  const highValue = [
    "team",
    "people",
    "partners",
    "leadership",
    "portfolio",
    "companies",
    "investments",
    "thesis",
    "strategy",
    "about",
    "contact"
  ];

  for (const word of highValue) {
    if (value.includes(word)) {
      score += 10;
    }
  }

  const lowValue = [
    "privacy",
    "terms",
    "cookie",
    "login",
    "signup",
    "careers",
    "press"
  ];

  for (const word of lowValue) {
    if (value.includes(word)) {
      score -= 10;
    }
  }

  return score;
}

function discoverLinks(
  $,
  baseUrl
) {
  const results = [];
  const seen = new Set();

  $("a[href]").each(
    (_, element) => {
      if (
        results.length >=
        MAX_DISCOVERED_LINKS
      ) {
        return false;
      }

      const href =
        $(element).attr(
          "href"
        );

      const anchorText =
        cleanText(
          $(element).text()
        );

      if (!href) {
        return;
      }

      try {
        const absolute =
          new URL(
            href,
            baseUrl
          ).href;

        const normalized =
          normalizeUrl(
            absolute
          );

        if (!normalized) {
          return;
        }

        if (
          !sameDomain(
            normalized,
            baseUrl
          )
        ) {
          return;
        }

        if (
          isBlacklisted(
            normalized
          )
        ) {
          return;
        }

        if (
          !/^https?:\/\//i
            .test(normalized)
        ) {
          return;
        }

        if (
          seen.has(normalized)
        ) {
          return;
        }

        seen.add(normalized);

        results.push({
          url: normalized,
          score:
            linkPriority(
              normalized,
              anchorText
            )
        });
      } catch {}
    }
  );

  return results
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(
      0,
      MAX_DISCOVERED_LINKS
    )
    .map(
      item => item.url
    );
}

// ============================================================
// NETWORK CAPTURE
// ============================================================

function setupNetworkCapture(
  page
) {
  const responses = [];

  page.on(
    "response",
    async response => {
      try {
        if (
          responses.length >=
          MAX_NETWORK_RESPONSES
        ) {
          return;
        }

        const resourceType =
          response.request()
            .resourceType();

        if (
          ![
            "xhr",
            "fetch",
            "document"
          ].includes(
            resourceType
          )
        ) {
          return;
        }

        const status =
          response.status();

        if (
          status < 200 ||
          status >= 400
        ) {
          return;
        }

        let body = null;

        try {
          body =
            await response.text();
        } catch {
          body = null;
        }

        responses.push({
          url:
            response.url(),
          status,
          resource_type:
            resourceType,
          content_type:
            response.headers()[
              "content-type"
            ] || "",
          body:
            typeof body === "string"
              ? body.slice(
                  0,
                  500000
                )
              : null
        });
      } catch {}
    }
  );

  return responses;
}

// ============================================================
// PAGE WAIT
// ============================================================

async function waitForUsefulPage(
  page
) {
  try {
    await page.waitForLoadState(
      "domcontentloaded",
      {
        timeout:
          NAVIGATION_TIMEOUT
      }
    );
  } catch {}

  try {
    await page.waitForLoadState(
      "networkidle",
      {
        timeout:
          NETWORK_IDLE_TIMEOUT
      }
    );
  } catch {}

  try {
    await page.waitForTimeout(
      750
    );
  } catch {}
}

// ============================================================
// DYNAMIC CONTENT
// ============================================================

async function detectDynamicContent(
  page
) {
  try {
    return await page.evaluate(
      () => {
        const body =
          document.body;

        const text =
          body?.innerText ||
          "";

        return {
          textLength:
            text.length,

          hasReact:
            Boolean(
              document.querySelector(
                "[data-reactroot]"
              )
            ),

          hasNext:
            Boolean(
              document.querySelector(
                "#__next"
              )
            ),

          hasVue:
            Boolean(
              document.querySelector(
                "[data-v-app]"
              )
            )
        };
      }
    );
  } catch {
    return {
      textLength: 0,
      hasReact: false,
      hasNext: false,
      hasVue: false
    };
  }
}

// ============================================================
// EXTRACTION
// ============================================================

async function extractRecords(
  extraction$,
  url,
  entityType,
  pageClass
) {
  let records = [];

  try {
    if (
      pageClass ===
        "portfolio" &&
      !isTeamPage(url)
    ) {
      records =
        extractPortfolioCompanies(
          extraction$,
          url
        );

      if (
        !Array.isArray(records) ||
        records.length === 0
      ) {
        records = [
          extractInvestorData(
            extraction$,
            url
          )
        ];
      }
    } else if (
      pageClass === "team" ||
      pageClass === "contact"
    ) {
      records =
        extractMultipleInvestors(
          extraction$,
          url
        );
    } else if (
      entityType === "investor"
    ) {
      records = [
        extractInvestorData(
          extraction$,
          url
        )
      ];
    } else {
      records = [
        extractGenericEntity(
          extraction$,
          url,
          entityType
        )
      ];
    }
  } catch (error) {
    console.error(
      "Extraction error:",
      error.message
    );

    records = [];
  }

  if (
    !Array.isArray(records)
  ) {
    records = [
      records
    ];
  }

  return records;
}

// ============================================================
// AI FALLBACK
// ============================================================

async function tryAIExtraction(
  text,
  url,
  entityType
) {
  if (
    !text ||
    text.length < 150
  ) {
    return null;
  }

  try {
    const helper =
      getAIHelper();

    if (
      !helper ||
      typeof helper.aiExtractEntity !==
        "function"
    ) {
      return null;
    }

    const result =
      await helper.aiExtractEntity(
        text,
        url,
        entityType
      );

    if (
      !result ||
      typeof result !==
        "object"
    ) {
      return null;
    }

    return result;
  } catch (error) {
    console.log(
      "AI extraction skipped:",
      error.message
    );

    return null;
  }
}

// ============================================================
// SINGLE SITE CRAWL
// ============================================================

async function crawlSiteWithPlaywright(
  startUrl,
  entityType,
  browser
) {
  const normalizedStart =
    normalizeUrl(
      startUrl
    );

  if (
    !normalizedStart
  ) {
    return [];
  }

  if (
    isBlacklisted(
      normalizedStart
    )
  ) {
    return [];
  }

  const robots =
    await getRobots(
      normalizedStart
    );

  const context =
    await browser.newContext({
      userAgent: USER_AGENT,

      viewport: {
        width: 1440,
        height: 900
      },

      ignoreHTTPSErrors: true
    });

  const visited =
    new Set();

  const queue = [
    normalizedStart
  ];

  const allRecords = [];

  while (
    queue.length &&
    visited.size <
      MAX_PAGES_PER_SITE
  ) {
    const url =
      queue.shift();

    if (
      visited.has(url)
    ) {
      continue;
    }

    visited.add(url);

    if (
      !(await canCrawl(
        robots,
        url
      ))
    ) {
      continue;
    }

    let page = null;

    try {
      page =
        await context.newPage();

      const networkResponses =
        setupNetworkCapture(
          page
        );

      page.on(
        "dialog",
        async dialog => {
          try {
            await dialog.dismiss();
          } catch {}
        }
      );

      const response =
        await page.goto(
          url,
          {
            waitUntil:
              "domcontentloaded",
            timeout:
              NAVIGATION_TIMEOUT
          }
        );

      await waitForUsefulPage(
        page
      );

      const statusCode =
        response
          ? response.status()
          : null;

      if (
        statusCode &&
        statusCode >= 400
      ) {
        await page.close();
        continue;
      }

      // Small scroll to trigger lazy-loaded content.
      try {
        await page.evaluate(
          async () => {
            const height =
              Math.min(
                document.body?.scrollHeight ||
                  0,
                12000
              );

            window.scrollTo(
              0,
              height
            );

            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  500
                )
            );
          }
        );
      } catch {}

      const html =
        await page.content();

      // RAW DOM:
      // Used for link discovery.
      const $ =
        cheerio.load(
          html
        );

      // CLEAN DOM:
      // Used ONLY for extraction.
      const extraction$ =
        buildCleanPage(
          $
        );

      const text =
        getSemanticText(
          extraction$
        );

      const pageClass =
        classifyPage(
          url,
          text
        );

      const dynamicInfo =
        await detectDynamicContent(
          page
        );

      const evidence =
        saveRawEvidence({
          url,
          html,
          networkResponses,

          metadata: {
            status_code:
              statusCode,

            page_class:
              pageClass,

            entity_type:
              entityType,

            dynamic:
              dynamicInfo
          }
        });

      // ------------------------------------------------------
      // EXTRACT
      // ------------------------------------------------------

      let records =
        await extractRecords(
          extraction$,
          url,
          entityType,
          pageClass
        );

      // ------------------------------------------------------
      // NORMALIZE + QUALITY
      // ------------------------------------------------------

      const normalizedRecords =
        [];

      for (
        const rawRecord
        of records
      ) {
        const record =
          normalizeRecord(
            rawRecord,
            url,
            entityType,
            {
              page_class:
                pageClass,

              status_code:
                statusCode,

              raw_evidence:
                evidence.path,

              content_hash:
                evidence.hash
            }
          );

        const quality =
          recordQuality(
            record
          );

        record.quality_score =
          quality.score;

        record.quality_reason =
          quality.reason ||
          null;

        if (
          quality.valid
        ) {
          normalizedRecords.push(
            record
          );
        }
      }

      // ------------------------------------------------------
      // AI FALLBACK
      // ------------------------------------------------------

      if (
        normalizedRecords.length === 0 &&
        text.length >= 200
      ) {
        const aiRecord =
          await tryAIExtraction(
            text,
            url,
            entityType
          );

        if (
          aiRecord
        ) {
          const normalizedAI =
            normalizeRecord(
              aiRecord,
              url,
              entityType,
              {
                page_class:
                  pageClass,

                status_code:
                  statusCode,

                raw_evidence:
                  evidence.path,

                content_hash:
                  evidence.hash,

                extraction_method:
                  "ai_fallback"
              }
            );

          const quality =
            recordQuality(
              normalizedAI
            );

          normalizedAI.quality_score =
            quality.score;

          normalizedAI.quality_reason =
            quality.reason ||
            null;

          if (
            quality.valid
          ) {
            normalizedRecords.push(
              normalizedAI
            );
          }
        }
      }

      // ------------------------------------------------------
      // FINAL RECORD METADATA
      // ------------------------------------------------------

      for (
        const record
        of normalizedRecords
      ) {
        record.crawl_type =
          pageClass;

        record.crawl_query =
          record.crawl_query ||
          null;

        record.entity_type =
          entityType;

        record.status_code =
          statusCode;

        record.source_url =
          record.source_url ||
          url;

        record.source_urls =
          uniqueStrings([
            ...(Array.isArray(
              record.source_urls
            )
              ? record.source_urls
              : []),
            url
          ]);
      }

      allRecords.push(
        ...normalizedRecords
      );

      // ------------------------------------------------------
      // LINK DISCOVERY
      // ------------------------------------------------------

      const links =
        discoverLinks(
          $,
          url
        );

      for (
        const link of links
      ) {
        if (
          visited.has(link)
        ) {
          continue;
        }

        if (
          queue.length >=
          MAX_PAGES_PER_SITE
        ) {
          break;
        }

        queue.push(
          link
        );
      }

      await page.close();

      page = null;
    } catch (error) {
      console.error(
        `Playwright crawl failed for ${url}:`,
        error.message
      );

      if (page) {
        try {
          await page.close();
        } catch {}
      }
    }
  }

  try {
    await context.close();
  } catch {}

  return allRecords;
}

// ============================================================
// DEDUPLICATION
// ============================================================

function recordIdentity(
  record
) {
  if (
    record.linkedin &&
    Array.isArray(record.linkedin) &&
    record.linkedin[0]
  ) {
    return (
      "linkedin:" +
      record.linkedin[0]
        .toLowerCase()
    );
  }

  if (
    record.emails &&
    Array.isArray(record.emails) &&
    record.emails[0]
  ) {
    return (
      "email:" +
      record.emails[0]
        .toLowerCase()
    );
  }

  const company =
    cleanText(
      record.company_name
    )
      .toLowerCase();

  const name =
    cleanText(
      record.name
    )
      .toLowerCase();

  if (
    company &&
    name
  ) {
    return (
      `person:${name}:${company}`
    );
  }

  if (company) {
    return (
      `company:${company}`
    );
  }

  if (name) {
    return (
      `name:${name}`
    );
  }

  return (
    "source:" +
    String(
      record.source_url ||
      ""
    )
  );
}

function mergeRecords(
  existing,
  incoming
) {
  const merged = {
    ...existing
  };

  const arrayFields = [
    "sectors",
    "tags",
    "stages",
    "portfolio",
    "emails",
    "linkedin",
    "phones",
    "source_urls"
  ];

  for (
    const field
    of arrayFields
  ) {
    merged[field] =
      uniqueStrings([
        ...(Array.isArray(
          existing[field]
        )
          ? existing[field]
          : []),

        ...(Array.isArray(
          incoming[field]
        )
          ? incoming[field]
          : [])
      ]);
  }

  const scalarFields = [
    "name",
    "company_name",
    "description",
    "region",
    "hq_city",
    "investor_type",
    "thesis",
    "website",
    "source_url"
  ];

  for (
    const field
    of scalarFields
  ) {
    if (
      !merged[field] &&
      incoming[field]
    ) {
      merged[field] =
        incoming[field];
    }
  }

  if (
    Number(
      incoming.quality_score || 0
    ) >
    Number(
      merged.quality_score || 0
    )
  ) {
    merged.quality_score =
      incoming.quality_score;

    merged.quality_reason =
      incoming.quality_reason;
  }

  return merged;
}

function deduplicateRecords(
  records
) {
  const map =
    new Map();

  for (
    const record
    of records
  ) {
    const key =
      recordIdentity(
        record
      );

    if (
      !map.has(key)
    ) {
      map.set(
        key,
        record
      );
    } else {
      map.set(
        key,
        mergeRecords(
          map.get(key),
          record
        )
      );
    }
  }

  return Array.from(
    map.values()
  );
}

// ============================================================
// MAIN PUBLIC API
// ============================================================

async function crawlSitesWithPlaywright(
  urls,
  entityType = "investor"
) {
  const cleanUrls =
    Array.from(
      new Set(
        (Array.isArray(urls)
          ? urls
          : [urls]
        )
          .map(
            normalizeUrl
          )
          .filter(Boolean)
          .filter(
            url =>
              !isBlacklisted(
                url
              )
          )
      )
    );

  if (
    cleanUrls.length === 0
  ) {
    return [];
  }

  let browser = null;

  try {
    browser =
      await chromium.launch({
        headless: true
      });

    const allRecords =
      [];

    for (
      const url
      of cleanUrls
    ) {
      try {
        const records =
          await crawlSiteWithPlaywright(
            url,
            entityType,
            browser
          );

        allRecords.push(
          ...records
        );
      } catch (error) {
        console.error(
          `Site crawl failed for ${url}:`,
          error.message
        );
      }
    }

    return deduplicateRecords(
      allRecords
    );
  } catch (error) {
    console.error(
      "Browser launch failed:",
      error.message
    );

    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  crawlSitesWithPlaywright
};