#!/usr/bin/env node

/**
 * naukri-scan.mjs — Naukri job search (unauthenticated API)
 *
 * Uses Naukri's public search API. Results deduped against scan-history.tsv.
 * Note: Naukri Premium features (profile boost, InMail) are manual — this
 * only automates job discovery.
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
  { keyword: 'AI Engineering Manager',      location: 'bengaluru' },
  { keyword: 'Head of AI',                  location: 'bengaluru' },
  { keyword: 'Applied AI Engineer',          location: 'bengaluru' },
  { keyword: 'AI Solutions Architect',       location: 'bengaluru' },
  { keyword: 'LLM Engineer',                 location: 'bengaluru' },
  { keyword: 'GenAI Engineer',               location: 'bengaluru' },
  { keyword: 'AI Product Manager',           location: 'bengaluru' },
  { keyword: 'Automation Architect',         location: 'bengaluru' },
  { keyword: 'AI Engineering Manager',      location: '' },  // pan-India + remote
  { keyword: 'AI Solutions Architect',       location: '' },
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
    `${url}\t${title}\t${new Date().toISOString().slice(0, 10)}\tnaukri-scan\n`,
    'utf-8'
  );
}

async function searchNaukri({ keyword, location }) {
  const params = new URLSearchParams({
    noOfResults: '20',
    urlType: 'search_by_keyword',
    searchType: 'adv',
    keyword,
    location,
    pageNo: '1',
    k: keyword,
    l: location,
    seoKey: `${keyword.toLowerCase().replace(/\s+/g, '-')}-jobs`,
    src: 'jobsearchDesk',
  });

  const url = `https://www.naukri.com/jobapi/v3/search?${params}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.naukri.com/',
      'appid': '109',
      'systemid': 'Naukri',
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const jobs = data?.jobDetails || [];

  return jobs.map(job => ({
    url: job.jdURL || `https://www.naukri.com${job.jobId}`,
    title: job.title || keyword,
    company: job.companyName || 'Unknown',
  })).filter(j => j.url.startsWith('http'));
}

async function main() {
  console.log('🏢 Naukri Job Scanner');
  console.log('━'.repeat(44));
  console.log('Scanning Naukri for AI roles in India...\n');

  const seenUrls = loadSeenUrls();
  let totalNew = 0;
  let newJobsText = '';

  for (const search of SEARCHES) {
    const label = search.location ? `${search.keyword} — ${search.location}` : `${search.keyword} — India (all)`;
    console.log(`📡 ${label}`);

    try {
      const jobs = await searchNaukri(search);
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
      console.error(`  ❌ ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1500));
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
  console.log(`✨ Done. ${totalNew} new Naukri leads added to Pipeline.`);
  console.log('\n💡 Naukri Premium tip: go to naukri.com → My Jobs → Resume services');
  console.log('   Your Premium profile is already shown to recruiters — check "Who viewed your profile"');
  console.log('   for companies actively looking. Add those companies to portals.yml.');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
