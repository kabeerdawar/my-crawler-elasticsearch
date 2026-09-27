require('dotenv').config();
const { chromium } = require('playwright');
const { llmExtract, mergeExtractions } = require('./extract/llm-extractor');
const { extractFromText } = require('./extract/multi-field-extractor');

async function main() {
  console.log('=== LLM EXTRACTION TEST ===\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set in .env');
    process.exit(1);
  }

  const testUrls = [
    'https://vercel.com/contact',
    'https://www.hubspot.com/company/contact',
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  });

  let totalCost = 0;

  for (const url of testUrls) {
    console.log(`\nURL: ${url}`);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);

      const text = await page.evaluate(() => document.body.innerText);

      // Regex extraction
      const regexResult = extractFromText(text);
      console.log(`  Regex: ${regexResult.emails.length} emails`);

      // LLM extraction
      console.log('  Calling GPT-4o-mini...');
      const llmResult = await llmExtract(text);

      if (llmResult.error) {
        console.log(`  LLM error: ${llmResult.error}`);
      } else {
        console.log(`  LLM: ${llmResult.emails.length} emails, ${llmResult.phones.length} phones, ${llmResult.names.length} names`);
        console.log(`  Cost: $${llmResult.cost.toFixed(6)} (${llmResult.inputTokens} in / ${llmResult.outputTokens} out tokens)`);
        totalCost += llmResult.cost;
      }

      // Merged
      const merged = mergeExtractions(regexResult, llmResult);
      console.log(`  MERGED: ${merged.emails.length} emails, ${merged.phones.length} phones`);

      if (merged.emails.length > 0) {
        console.log('  Emails found:');
        merged.emails.slice(0, 5).forEach((e) => console.log(`    - ${e}`));
      }

      if (llmResult.names && llmResult.names.length > 0) {
        console.log('  Names found:', llmResult.names.slice(0, 3).join(', '));
      }
      if (llmResult.titles && llmResult.titles.length > 0) {
        console.log('  Titles found:', llmResult.titles.slice(0, 3).join(', '));
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\n=== TOTAL COST: $${totalCost.toFixed(6)} ===`);
  console.log(`=== COMPLETE ===`);
}

main().catch(console.error);