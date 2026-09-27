require('dotenv').config();
const { chromium } = require('playwright');
const enricher = require('./extract/enricher');

async function main() {
  console.log('=== ENRICHMENT TEST ===\n');

  const testUrls = [
    'https://www.shopify.com',
    'https://stripe.com',
    'https://vercel.com',
    'https://www.hubspot.com',
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  });

  for (const url of testUrls) {
    console.log(`\nURL: ${url}`);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);

      const html = await page.content();
      const text = await page.evaluate(() => document.body.innerText);

      const technologies = enricher.detectTechnologies(html);
      const industry = enricher.detectIndustry(text);
      const size = enricher.detectCompanySize(text);
      const signals = enricher.detectIntentSignals(text);

      console.log(`  Technologies: ${technologies.length > 0 ? technologies.join(', ') : '(none detected)'}`);
      console.log(`  Industry:     ${industry || '(unknown)'}`);
      console.log(`  Company size: ${size ? size + ' employees' : '(unknown)'}`);
      console.log(`  Intent signals: ${signals.length > 0 ? signals.join(', ') : '(none)'}`);
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Test with sample text
  console.log('\n=== SAMPLE TEXT TEST ===\n');
  const sampleText = `
    We're a fast-growing SaaS startup with a team of 150 people.
    Backed by top investors after our Series B round.
    We're actively hiring across engineering and sales.
    Our platform helps e-commerce businesses scale.
  `;
  const sampleHtml = `<script src="https://cdn.shopify.com/s/files/x.js"></script>
                     <script>gtag('config', 'G-123');</script>
                     <script src="https://js.stripe.com/v3/"></script>`;

  console.log('Text analysis:');
  console.log(`  Industry:       ${enricher.detectIndustry(sampleText)}`);
  console.log(`  Size:           ${enricher.detectCompanySize(sampleText)}`);
  console.log(`  Signals:        ${enricher.detectIntentSignals(sampleText).join(', ')}`);
  console.log('HTML analysis:');
  console.log(`  Technologies:   ${enricher.detectTechnologies(sampleHtml).join(', ')}`);

  console.log('\n=== COMPLETE ===');
}

main().catch(console.error);