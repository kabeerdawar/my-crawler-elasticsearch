# Multi-Entity Discovery Crawler
## Complete Methodology Guide

**Author:** Kabeer Dawar
**Date:** September 23, 2026
**Version:** 1.0

---

## Table of Contents

1. How Your Crawler Works (Simple Guide)
2. Main Files and What They Do
3. Anti-Bot Features
4. Detailed Working (Technical)
5. File-by-File Breakdown
6. Error Handling & Recovery
7. Performance Optimizations
8. Limitations & Future Scope

---

# PART 1: HOW YOUR CRAWLER WORKS (Simple Guide)

## What Happens When You Search

Imagine you want to find something on the internet. You type a question like **"investors in Delhi"** into a box and click a button. Your crawler then goes on a journey to find that information for you.

### Step 1: Understanding Your Question

The crawler first reads your question. It uses a small helper called **queryParser.js** to figure out what you are looking for.

It tries to understand:
- **What** you want (investors, wholesalers, doctors)
- **Where** you want it (Delhi, Mumbai, Punjab)
- **How many** you want (20, 100)

If your question is simple, this helper can figure it out. If your question is complicated, it asks a smart AI (Groq) for help.

### Step 2: Finding Places to Look

Now the crawler needs to know which websites to visit. It uses two helpers:

1. **discovery.js** – This helper has a big list of known investor websites (like a phonebook). It picks out the ones that match your city or region.

2. **discovery-search.js** – This helper goes to DuckDuckGo (a search engine) and asks: "What are the top investors in Delhi?" It then collects the website links from the results.

Together, they give you a list of websites that might have the information you want. You see this list on your screen and can choose which ones to crawl.

### Step 3: Visiting the Websites

The crawler now visits the websites you selected. But websites are different. Some are simple, like a plain page. Others are complex, like a TV screen with moving parts.

So the crawler has two different tools:

- **crawler.js** – This is the fast tool for simple websites. It reads the page quickly and moves on.

- **crawler-playwright.js** – This is the careful tool for complex websites. It opens a real browser (like Chrome), waits for the page to load, and then reads it.

Both tools follow the same rules: they respect the website's rules (robots.txt), they don't knock too often (rate limiting), and they skip websites that are known to block crawlers.

### Step 4: Pulling Out the Information

Once the crawler is on a page, it looks for useful details:
- Email addresses
- Phone numbers
- LinkedIn profiles
- Company names
- Addresses

This is done by **extractor.js**. It looks for patterns (like an email always has an "@" sign). If the page is too messy or in another language, the crawler asks **Gemini AI** to read it and pull out the information.

### Step 5: Cleaning and Checking

The information collected might have duplicates or mistakes. So two more helpers step in:

- **schema.js** – This checks each record. If an email doesn't look right, it throws it out.

- **deduplicator.js** – This looks for repeated records. If the same investor appears three times, it merges them into one.

### Step 6: Saving the Data

The clean information is now saved in two places:
- **In the cloud** using Supabase (an online database) – handled by **db.js**.
- **On your computer** as a JSON file, as a backup.

### Step 7: Showing You the Results

Finally, the results appear on your screen. The page you see is **public/index.html**. It shows a table with all the records. You can filter them, sort them, and download them as a CSV file.

---

# PART 2: THE MAIN FILES AND WHAT THEY DO

Your crawler is made of many small programs. Each one has a special job.

| File Name | What It Does (In Simple Words) |
|-----------|-------------------------------|
| server.js | The boss. Listens to your requests, tells everyone what to do, and keeps everything running. |
| crawler.js | The fast reader. Visits simple websites and reads them quickly. |
| crawler-playwright.js | The careful reader. Opens a real browser to read complex websites. |
| extractor.js | The detective. Finds emails, phone numbers, and other details on a page. |
| discovery.js | The scout. Uses a pre-made list to suggest websites. |
| discovery-search.js | The internet searcher. Uses DuckDuckGo to find new websites. |
| ai-helper.js | The smart assistant. Asks Gemini AI for help when things get tough. |
| db.js | The record keeper. Saves everything to the cloud database. |
| deduplicator.js | The cleaner. Removes repeated records. |
| schema.js | The quality checker. Makes sure each record is complete and correct. |
| queryParser.js | The translator. Turns your words into instructions the computer understands. |
| scheduler.js | The alarm clock. Can start crawls automatically at set times. |
| public/index.html | The screen. Shows you the results and lets you interact. |
| data/seed-domains.json | The phonebook. Holds a list of known investor websites. |

---

# PART 3: ANTI-BOT FEATURES

Many websites don't like robots reading them. They try to block crawlers. Your crawler uses several tricks to avoid getting blocked.

### 1. Blacklist

We keep a list of websites that are known to block robots (like JustDial, IndiaMART). We simply don't visit them.

### 2. Rate Limiting

We don't knock on a website's door too many times in a row. We wait at least half a second between visits.

### 3. User-Agent

We pretend to be a normal web browser (like Chrome) so the website thinks a real person is visiting.

### 4. Robots.txt

Every website has a file that says which pages robots should not read. We always follow those rules.

### 5. Playwright Browser

For complex websites, we use a real browser. This makes the website think a human is browsing.

### 6. Popup Handling

If a website shows a popup or alert, we close it immediately so it doesn't stop us.

### 7. Crash Protection

If one page causes a problem, we catch the error and keep going. The whole system doesn't crash.

### 8. Safe Fetch

When your browser talks to the server, we check that the reply is correct. If something goes wrong, we show a clear error instead of breaking.

### 9. AI Extraction

When normal reading fails, we ask Gemini AI to read the page and find the information.

### 10. Snippet Extraction

DuckDuckGo search results often include a short summary with phone numbers or emails. We grab those without even visiting the page.

### Planned Features

- **Proxy Rotation** – Using different IP addresses so websites can't track us.
- **CAPTCHA Solving** – Automatically solving those "I'm not a robot" puzzles.

---

# PART 4: DETAILED WORKING (Technical)

## System Architecture

The crawler follows a modular pipeline architecture with clear separation of concerns.

### Architecture Layers

1. **Presentation Layer** – public/index.html (UI, Filters, CSV Export)
2. **API Layer** – server.js (Express Routes)
3. **Orchestration Layer** – crawlUrls() (Coordinates all modules)
4. **Core Modules** – Discovery, Crawling, Extraction, Storage
5. **External Services** – Supabase, Gemini AI, Groq AI, DuckDuckGo

## Data Flow

### Phase 1: Query Input and Parsing
- User enters natural language query
- queryParser.js extracts entity type, region, city, sectors
- If rule-based parsing fails, Groq AI is used as fallback

### Phase 2: Source Discovery
- Seed-based: discovery.js loads data/seed-domains.json (90+ VCs)
- Search-based: discovery-search.js builds entity-aware DDG queries
- Snippet extraction captures emails/phones from search results

### Phase 3: Crawl Orchestration
- crawlUrls() coordinates the entire process
- Snippet records retrieved from global storage
- Static URLs go to crawler.js
- JS-heavy URLs go to crawler-playwright.js
- All records combined into rawRecords

### Phase 4: Validation and Deduplication
- schema.js cleans and validates each record
- ai-helper.js cleans first 10 records with Gemini
- deduplicator.js merges duplicates

### Phase 5: Storage
- Local JSON files written
- Supabase saved in chunks of 100
- Search history saved

### Phase 6: Frontend Display
- Results displayed in table
- Filter by type, region, email, confidence
- Export to CSV

## Entity Types and Their Handling

| Entity Type | Discovery Sources | Crawl Priority |
|-------------|-------------------|----------------|
| Investor | Seed domains + DDG | Team, Portfolio, Contact |
| Wholesaler | IndiaMART, TradeIndia, DDG | Contact, About, Products |
| Supplier | IndiaMART, TradeIndia, DDG | Contact, Products |
| Manufacturer | IndiaMART, ThomasNet, DDG | Contact, Products |
| Exporter | ExportersIndia, DDG | Contact, Products |
| Importer | TradeIndia, DDG | Contact |
| Dealer | JustDial, DDG | Contact |
| Service Provider | JustDial, Sulekha, Practo, DDG | Contact, About |

## Crawl Priority Logic

For each site, pages are crawled in this order:

1. **Contact pages** (/contact, /contact-us) – highest priority
2. **Team pages** (/team, /people, /partners, /about)
3. **Portfolio/Product pages** (/portfolio, /companies, /products)
4. **Other pages** (from internal links)

## AI Fallback Logic

Regex extraction is fast but brittle. When it fails:
        