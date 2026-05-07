#!/usr/bin/env node
/**
 * apply.mjs — ATS form pre-filler
 *
 * Opens a visible browser, navigates to the job URL, and pre-fills
 * standard fields for Greenhouse, Ashby, Lever, and Workable.
 * NEVER submits — you review and submit manually.
 *
 * Usage: node apply.mjs <job-url> [--cv path/to/cv.pdf]
 */

import { chromium } from 'playwright';
import yaml from 'js-yaml';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadProfile() {
  const p = path.join(__dirname, 'config', 'profile.yml');
  if (!existsSync(p)) { console.error('❌ config/profile.yml not found.'); process.exit(1); }
  return yaml.load(readFileSync(p, 'utf-8'));
}

function detectATS(url) {
  if (/greenhouse\.io/.test(url))       return 'greenhouse';
  if (/ashbyhq\.com/.test(url))         return 'ashby';
  if (/lever\.co/.test(url))            return 'lever';
  if (/workable\.com/.test(url))        return 'workable';
  if (/smartrecruiters\.com/.test(url)) return 'smartrecruiters';
  if (/jobs\.linkedin\.com/.test(url))  return 'linkedin';
  return 'unknown';
}

async function tryFill(page, selectors, value) {
  if (!value) return false;
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.fill(value); return true; }
    } catch {}
  }
  return false;
}

async function tryUpload(page, selectors, filePath) {
  if (!filePath || !existsSync(filePath)) return false;
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.setInputFiles(filePath); console.log(`  📎 CV attached: ${filePath}`); return true; }
    } catch {}
  }
  return false;
}

async function fillGreenhouse(page, c, cvPath) {
  console.log('  Filling Greenhouse fields...');
  await page.waitForSelector('#first_name, [name="job_application[first_name]"], [id*="first"]', { timeout: 8000 }).catch(() => {});
  const [first, ...rest] = c.full_name.trim().split(' ');
  await tryFill(page, ['#first_name', '[name="job_application[first_name]"]'], first);
  await tryFill(page, ['#last_name',  '[name="job_application[last_name]"]'], rest.join(' '));
  await tryFill(page, ['#email',      '[name="job_application[email]"]'],     c.email);
  await tryFill(page, ['#phone',      '[name="job_application[phone]"]'],     c.phone || '');
  await tryFill(page, ['[name*="linkedin" i]', '[id*="linkedin" i]', '[placeholder*="linkedin" i]'], `https://${c.linkedin}`);
  if (c.location) await tryFill(page, ['[name*="location" i]', '[id*="location" i]', '[placeholder*="location" i]'], c.location);
  await tryUpload(page, ['input[type="file"]', '#resume', '[name*="resume"]'], cvPath);
}

async function fillAshby(page, c, cvPath) {
  console.log('  Filling Ashby fields...');
  await page.waitForSelector('[name="name"], [placeholder*="name" i], [placeholder*="full" i]', { timeout: 8000 }).catch(() => {});
  await tryFill(page, ['[name="name"]', '[placeholder*="full name" i]', '[placeholder*="your name" i]'], c.full_name);
  await tryFill(page, ['[name="email"]', '[type="email"]'],  c.email);
  await tryFill(page, ['[name="phone"]', '[placeholder*="phone" i]'], c.phone || '');
  await tryFill(page, ['[name*="linkedin" i]', '[placeholder*="linkedin" i]'], `https://${c.linkedin}`);
  if (c.location) await tryFill(page, ['[name*="location" i]', '[placeholder*="location" i]', '[placeholder*="city" i]'], c.location);
  await tryUpload(page, ['input[type="file"]', '[name*="resume" i]', '[name*="cv" i]'], cvPath);
}

async function fillLever(page, c, cvPath) {
  console.log('  Filling Lever fields...');
  await page.waitForSelector('[name="name"], #name', { timeout: 8000 }).catch(() => {});
  await tryFill(page, ['[name="name"]', '#name'], c.full_name);
  await tryFill(page, ['[name="email"]', '#email'], c.email);
  await tryFill(page, ['[name="phone"]', '#phone'], c.phone || '');
  await tryFill(page, ['[name="urls[LinkedIn]"]', '[name*="linkedin" i]', '#linkedin'], `https://${c.linkedin}`);
  if (c.location) await tryFill(page, ['[name*="location" i]', '[name="location"]'], c.location);
  await tryUpload(page, ['input[type="file"]', '[name*="resume" i]'], cvPath);
}

async function fillWorkable(page, c, cvPath) {
  console.log('  Filling Workable fields...');
  await page.waitForSelector('[name="firstname"], [placeholder*="first" i]', { timeout: 8000 }).catch(() => {});
  const [first, ...rest] = c.full_name.trim().split(' ');
  await tryFill(page, ['[name="firstname"]',  '[placeholder*="first name" i]'], first);
  await tryFill(page, ['[name="lastname"]',   '[placeholder*="last name" i]'],  rest.join(' '));
  await tryFill(page, ['[name="email"]',      '[type="email"]'],                c.email);
  await tryFill(page, ['[name="phone"]',      '[placeholder*="phone" i]'],      c.phone || '');
  await tryFill(page, ['[name*="linkedin" i]','[placeholder*="linkedin" i]'],   `https://${c.linkedin}`);
  await tryUpload(page, ['input[type="file"]'], cvPath);
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find(a => a.startsWith('http'));
  const cvIdx = args.indexOf('--cv');
  const cvPath = cvIdx !== -1 ? path.resolve(__dirname, args[cvIdx + 1]) : null;

  if (!url) {
    console.error('Usage: node apply.mjs <job-url> [--cv output/cv-*.pdf]');
    process.exit(1);
  }

  const profile = loadProfile();
  const c = profile.candidate;
  const ats = detectATS(url);

  console.log(`🎯 ATS: ${ats.toUpperCase()}`);
  console.log(`👤 Filling for: ${c.full_name} <${c.email}>`);
  if (cvPath) console.log(`📎 CV: ${cvPath}`);
  console.log(`🌐 ${url}\n`);
  console.log('⚠️  Pre-fill only — YOU review and submit. Never auto-submits.\n');

  const browser = await chromium.launch({ headless: false, slowMo: 250, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page    = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    switch (ats) {
      case 'greenhouse':   await fillGreenhouse(page, c, cvPath);  break;
      case 'ashby':        await fillAshby(page, c, cvPath);        break;
      case 'lever':        await fillLever(page, c, cvPath);         break;
      case 'workable':     await fillWorkable(page, c, cvPath);      break;
      default:
        console.log('⚠️  ATS not in supported list (Greenhouse/Ashby/Lever/Workable).');
        console.log('   Browser is open — fill manually with the data in the Apply panel.');
    }

    console.log('\n✅ Done pre-filling. Review all fields in the browser.');
    console.log('📌 Attach your CV PDF if the upload field is empty.');
    console.log('🔒 Close the browser window when finished.');
  } catch (err) {
    console.error(`\n⚠️  Auto-fill error: ${err.message}`);
    console.log('   Browser is open — fill manually.');
  }

  await new Promise(resolve => browser.on('disconnected', resolve));
  console.log('\n✔️  Browser closed. Update status to Applied in the Dashboard!');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
