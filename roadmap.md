# Universal Investor Crawler — Roadmap

## 🌍 1. Discovery (Sources Dhundhna)
- Multiple Search Engines (DDG + Bing + Google + SerpApi)
- Google Custom Search API (100 free/day)
- Bing Search API (1000 free/month)
- SerpApi (Real Google results)
- Region-Specific Search (google.co.jp, google.de)
- Wikipedia Scraper (List of VCs by country)
- Crunchbase Free Tier
- Sitemap.xml Parser

## 🌐 2. Language (Multilingual)
- Language Detection (franc package)
- Gemini Primary Extraction (Non-English pages)
- Multilingual Regex (10 languages)
- Translation Layer
- Locale Detection

## 📄 3. Content Types
- PDF Parser (pdf-parse)
- DOCX Parser (mammoth)
- Excel/CSV Parser (xlsx)
- PowerPoint Parser
- YouTube Transcript
- Image OCR (tesseract)

## 🧠 4. Intelligence (AI)
- AI Page Classifier (Investor page? Yes/No)
- AI Query Parser (Structured JSON)
- AI Email Verifier (Personal vs Generic)
- AI Entity Resolution (Same person merge)
- AI Deduplication (Fuzzy matching)
- AI Summary Generator
- AI Sentiment Analysis
- AI Sector Classifier

## ⚡ 5. Performance (Speed)
- Concurrent Crawling (p-limit) — 10 sites parallel
- Redis Caching — Same page dobara fetch nahi
- Conditional Requests — If-Modified-Since
- Redis Queue (BullMQ) — Job queue
- Worker Processes — Multiple workers
- Database Indexing — Fast queries
- CDN for Static

## 🛡️ 6. Robustness (Anti-Blocking)
- User-Agent Rotation
- Proxy Rotation (Bright Data, ScraperAPI)
- Retry Logic (3 baar + exponential backoff)
- Playwright Stealth (Fingerprint randomization)
- CAPTCHA Solver (2Captcha)
- Cloudflare Bypass (cloudscraper)
- Rate Limiting
- Robots.txt Respect (Already done ✅)

## 🗄️ 7. Storage (Database)
- Supabase (Already done ✅)
- Proper Indexes
- Full-Text Search (Postgres FTS)
- Backup Automation
- Archive Old Records
- Vector Embeddings
- Data Export API

## 📊 8. Monitoring (Observability)
- Winston Logging
- Error Tracking (Sentry)
- Metrics Dashboard
- Email Alerts
- Slack Integration
- WebSocket Live Updates
- Health Check Endpoint (Already done ✅)

## 🎨 9. Frontend (UI)
- Search History UI
- Saved Searches
- Advanced Filters
- Bulk Actions
- Chart/Graphs
- Dark Mode
- Mobile Responsive

## 🔧 10. DevOps (Deployment)
- .env Safety (Already done ✅)
- GitHub Actions CI/CD
- Deploy on Railway/Render
- Docker Container
- Unit Tests (Jest)
- Integration Tests

---

## 📊 Priority Summary

### 🔴 Phase 2 (Week 1) — Universal Foundation
1. Language Detection (franc)
2. Gemini Primary Extraction
3. PDF Parser
4. AI Page Classifier
5. Concurrent Crawling
6. User-Agent Rotation

### 🟡 Phase 3 (Week 2) — Scale
7. Multiple Search Engines
8. Global Seed Domains (500+)
9. Redis Caching
10. Proper DB Indexes
11. AI Email Verifier
12. Proxy Rotation

### 🟢 Phase 4 (Week 3) — Production
13. Deploy on Railway/Render
14. Winston Logging
15. Sentry Error Tracking
16. Docker Container
17. Advanced Frontend Filters
18. Search History UI

### ⚪ Phase 5 (Week 4) — Nice to Have
19. CAPTCHA Solver
20. Vector Embeddings
21. YouTube Transcript
22. Slack Integration
23. Mobile Responsive
24. Dark Mode

---

Total Items: 69
Timeline: 4-6 Weeks
Priority: Language → PDF → AI → Speed → Scale