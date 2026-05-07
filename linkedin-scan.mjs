#!/usr/bin/env node

/**
 * linkedin-scan.mjs — LinkedIn remote job search
 *
 * Uses LinkedIn's guest search API (no auth required for basic results).
 * Falls back gracefully if LinkedIn rate-limits.
 * Results deduped against data/scan-history.tsv.
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.join(__dirname, 'data', 'pipeline.md');
const HISTORY_PATH  = path.join(__dirname, 'data', 'scan-history.tsv');

const SEARCHES = [
  { keywords: 'AI Engineering Manager',    location: 'Worldwide' },
  { keywords: 'Head of AI',                location: 'Worldwide' },
  { keywords: 'Applied AI Engineer',       location: 'Worldwide' },
  { keywords: 'Solutions Architect AI',    location: 'Worldwide' },
  { keywords: 'LLM Engineer',              location: 'Worldwide' },
  { keywords: 'Forward Deployed Engineer', location: 'Worldwide' },
  { keywords: 'AI Product Manager',        location: 'Worldwide' },
  { keywords: 'AI Engineer',              location: 'India'     },
  { keywords: 'AI Solutions Architect',    location: 'India'     },
  { keywords: 'Head of AI',               location: 'United Arab Emirates' },
];

function loadSeenUrls() {
  if (!existsSync(HISTORY_PATH)) return new Set();
  return new Set(
    readFileSync(HISTORY_PATH, 'utf-8')
      .split('\n').map(l => l.split('\t')[0].trim()).filter(Boolean)
  );
}

function appendHistory(url, title) {
  appendFileSync(HISTORY_PATH,
    `${url}\t${title}\t${new Date().toISOString().slice(0, 10)}\tlinkedin-scan\n`,
    'utf-8'
  );
}

async function searchLinkedIn({ keywords, location }) {
  const params = new URLSearchParams({
    keywords,
    location,
    f_WT: '2', // 2 = remote
    start: '0',
    count: '25',
  });

  const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.linkedin.com/jobs/search/',
    }
  });

  if (res.status === 429 || res.status === 999) throw new Error(`rate-limited (${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();

  // LinkedIn only puts href on 1 card; use data-entity-urn to get all job IDs
  const urls      = [...html.matchAll(/data-entity-urn="urn:li:jobPosting:(\d+)"/g)]
                      .map(m => `https://www.linkedin.com/jobs/view/${m[1]}/`);
  const titles    = [...html.matchAll(/class="base-search-card__title">\s*\n\s*([^\n<]+)/g)]
                      .map(m => m[1].trim());
  const companies = [...html.matchAll(/subtitle"[^>]*>\s*\n\s*<a[^>]*>\s*\n\s*([^\n<]+)/g)]
                      .map(m => m[1].trim());

  return urls.map((url, i) => ({
    url,
    title:   titles[i]    || keywords,
    company: companies[i] || 'Unknown',
  }));
}

async function main() {
  console.log('🔗 LinkedIn Remote Job Scanner');
  console.log('━'.repeat(44));
  console.log('Scanning for remote AI roles across LinkedIn...\n');

  const seenUrls = loadSeenUrls();
  let totalNew = 0;
  let newJobsText = '';
  let blocked = false;

  for (const search of SEARCHES) {
    if (blocked) break;
    console.log(`📡 ${search.keywords} — ${search.location}`);

    try {
      const jobs = await searchLinkedIn(search);
      let found = 0;

      for (const job of jobs) {
        if (seenUrls.has(job.url)) continue;
        newJobsText += `- [ ] ${job.url} | ${job.company} | ${job.title}\n`;
        appendHistory(job.url, job.title);
        seenUrls.add(job.url);
        found++;
        totalNew++;
      }

      console.log(`  ✅ ${found} new leads`);
    } catch (err) {
      if (err.message.includes('rate-limited')) {
        console.warn(`  ⚠️  LinkedIn rate-limited this session. Stopping early.`);
        console.log('  💡 Tip: wait 15 min and run again, or use the LinkedIn job alert emails.');
        blocked = true;
      } else {
        console.error(`  ❌ ${err.message}`);
      }
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  if (newJobsText) {
    let pipeline = readFileSync(PIPELINE_PATH, 'utf-8');
    const marker = '## Pendientes';
    const idx = pipeline.indexOf(marker);
    if (idx !== -1) {
      pipeline = pipeline.slice(0, idx + marker.length) + '\n\n' + newJobsText.trim() + pipeline.slice(idx + marker.length);
    } else {
      pipeline += `\n\n${marker}\n\n${newJobsText.trim()}\n`;
    }
    writeFileSync(PIPELINE_PATH, pipeline, 'utf-8');
  }

  console.log('\n━'.repeat(44));
  console.log(`✨ Done. ${totalNew} new LinkedIn leads added to Pipeline.`);

  if (blocked) {
    console.log('\n💡 LinkedIn Premium tip: set up job alerts at linkedin.com/jobs/search,');
    console.log('   then paste alert email URLs directly into the Pipeline tab.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
