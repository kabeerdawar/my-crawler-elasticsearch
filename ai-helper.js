// ai-helper.js
require("dotenv").config();
const axios = require("axios");

const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// ---------- GROQ (Fast — Query Parsing) ----------
async function groqQuery(prompt, systemPrompt = "You are a helpful assistant.") {
  if (!GROQ_KEY) return null;
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      },
      {
        headers: {
          "Authorization": `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("Groq error:", err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ---------- GEMINI Core ----------
async function geminiExtract(prompt) {
  if (!GEMINI_KEY) return null;
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
          responseMimeType: "application/json"
        }
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000
      }
    );
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    try { return JSON.parse(text); }
    catch { return text; }
  } catch (err) {
    console.error("Gemini error:", err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ---------- 1. AI QUERY PARSING (Groq) ----------
async function aiParseQuery(rawQuery) {
  const prompt = `Parse this investor search query into structured JSON.

Query: "${rawQuery}"

Return ONLY valid JSON:
{
  "region": "USA"|"India"|"UK"|"Europe"|"Middle_East"|"Southeast_Asia"|"East_Asia"|"Africa"|"Latin_America"|null,
  "city": "Delhi"|"Mumbai"|"Bangalore"|"San Francisco"|"New York"|"London"|null,
  "sectors": ["AI","SaaS","FinTech","Healthcare","Consumer"],
  "stages": ["Pre-Seed","Seed","Series A","Series B"],
  "investorTypes": ["Venture Capital","Angel Investor","Private Equity","Family Fund","HNI"]
}

Only return JSON, nothing else.`;

  const result = await groqQuery(prompt, "You are a precise JSON parser. Return only valid JSON.");
  if (!result) return null;
  try {
    return JSON.parse(result.replace(/```json|```/g, "").trim());
  } catch { return null; }
}

// ---------- 2. AI EXTRACTION (Gemini) ----------
// Use when regex-based extractor fails
async function aiExtractInvestor(htmlText, url) {
  const trimmed = htmlText.slice(0, 15000);

  const prompt = `Extract investor information from this webpage text.

URL: ${url}

Page text:
${trimmed}

Return ONLY valid JSON with these fields:
{
  "name": "person name or empty string",
  "company_name": "firm name or empty string",
  "investor_type": "Venture Capital"|"Angel Investor"|"Family Fund"|"Private Equity"|"HNI"|"",
  "region": "India"|"USA"|"UK"|"Europe"|"Middle_East"|"Southeast_Asia"|"",
  "hq_city": "city name or null",
  "sectors": ["AI", "SaaS", "FinTech", "Healthcare", "Consumer"],
  "tags": ["Pre-Seed", "Seed", "Series A", "Series B", "B2B", "B2C"],
  "portfolio": ["Company1", "Company2"],
  "thesis": "investment focus text",
  "emails": ["email1@domain.com"],
  "linkedin": ["https://linkedin.com/in/..."],
  "description": "brief description"
}

Rules:
- Only extract info ACTUALLY present on the page
- If field not found → empty string or empty array
- NEVER invent emails, names, or companies
- Only return valid JSON, nothing else`;

  const result = await geminiExtract(prompt);
  if (!result) return null;
  if (typeof result === "string") {
    try { return JSON.parse(result.replace(/```json|```/g, "").trim()); }
    catch { return null; }
  }
  return result;
}

// ---------- 3. AI CLEANING (Gemini) ----------
async function aiCleanRecord(record) {
  const prompt = `Clean and normalize this investor record.

Input:
${JSON.stringify(record, null, 2)}

Return ONLY valid JSON with SAME fields but cleaned:
{
  "name": "Properly Capitalized Name",
  "company_name": "Normalized Company Name",
  "investor_type": "Standardized Type",
  "region": "Standardized Region",
  "hq_city": "Standardized City",
  "sectors": ["Standardized Sectors"],
  "tags": ["Standardized Tags"],
  "thesis": "cleaned text",
  "description": "cleaned text"
}

Rules:
- Fix: "srikanth velamakanni" → "Srikanth Velamakanni"
- Fix: "VC" → "Venture Capital"
- Fix: "Bangalore" and "Bengaluru" → "Bangalore"
- Do NOT invent emails, names, or companies
- Do NOT add info that wasn't there
- Only return valid JSON`;

  const result = await geminiExtract(prompt);
  if (!result) return record;
  if (typeof result === "string") {
    try { return JSON.parse(result.replace(/```json|```/g, "").trim()); }
    catch { return record; }
  }
  return result;
}

// ---------- STATUS ----------
function aiStatus() {
  return { groq: !!GROQ_KEY, gemini: !!GEMINI_KEY };
}

module.exports = {
  groqQuery,
  geminiExtract,
  aiParseQuery,
  aiExtractInvestor,
  aiCleanRecord,
  aiStatus
};