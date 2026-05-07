#!/usr/bin/env node

/**
 * deep-scan.mjs — AI-powered web discovery
 * 
 * Uses Gemini's Search Grounding to find job openings across the web
 * based on the queries defined in portals.yml.
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import yaml from 'js-yaml';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTALS_PATH = path.join(__dirname, 'portals.yml');
const PIPELINE_PATH = path.join(__dirname, 'data', 'pipeline.md');
const HISTORY_PATH = path.join(__dirname, 'data', 'scan-history.tsv');

function loadSeenUrls() {
  if (!existsSync(HISTORY_PATH)) return new Set();
  return new Set(
    readFileSync(HISTORY_PATH, 'utf-8')
      .split('\n')
      .map(l => l.split('\t')[0].trim())
      .filter(Boolean)
  );
}

function appendHistory(url, title) {
  const line = `${url}\t${title}\t${new Date().toISOString().slice(0, 10)}\tdeep-scan\n`;
  appendFileSync(HISTORY_PATH, line, 'utf-8');
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env or environment.');
    console.log('💡 Please add your API key to a .env file: GEMINI_API_KEY=your_key_here');
    process.exit(1);
  }

  if (!existsSync(PORTALS_PATH)) {
    console.error('❌ portals.yml not found.');
    process.exit(1);
  }

  const cliArgs = process.argv.slice(2);
  const remoteOnly = cliArgs.includes('--remote');

  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  let queries = (config.search_queries || []).filter(q => q.enabled !== false);
  if (remoteOnly) queries = queries.filter(q => q.remote === true);

  if (queries.length === 0) {
    console.log(remoteOnly
      ? 'No remote-tagged queries found. Add remote: true to queries in portals.yml.'
      : 'No enabled search queries found in portals.yml');
    return;
  }

  console.log(`🔍 Starting Deep Search across ${queries.length} query templates${remoteOnly ? ' (remote only)' : ''}...`);
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash', // Flash is faster/cheaper for grounding
    tools: [{ googleSearch: {} }]
  });

  const delay = ms => new Promise(res => setTimeout(res, ms));

  for (const q of queries) {
    console.log(`\n📡 Query: ${q.name}...`);
    
    let attempt = 0;
    const maxRetries = 3;
    let success = false;

    while (attempt < maxRetries && !success) {
      try {
        const prompt = `Find the latest job postings for this search query: "${q.query}". 
        Return a list of URLs and job titles. 
        Focus on official career pages or direct job board links (Greenhouse, Ashby, Lever).
        Format the output as a simple list: URL | Company | Title`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // Extract matches: [URL] | [Company] | [Title]
        const matches = text.matchAll(/(https?:\/\/\S+)\s*\|\s*([^|]+)\s*\|\s*([^|\n]+)/g);
        let found = 0;
        
        const seenUrls = loadSeenUrls();
        let newJobsText = '';
        for (const match of matches) {
          const url = match[1];
          if (seenUrls.has(url)) continue;
          const title = match[3].trim();
          newJobsText += `- [ ] ${url} | ${match[2].trim()} | ${title}\n`;
          appendHistory(url, title);
          found++;
        }
        
        if (found > 0) {
          let pipelineText = readFileSync(PIPELINE_PATH, 'utf-8');
          const marker = '## Pendientes';
          const idx = pipelineText.indexOf(marker);
          
          if (idx !== -1) {
            const insertAt = idx + marker.length;
            pipelineText = pipelineText.slice(0, insertAt) + '\n\n' + newJobsText.trim() + pipelineText.slice(insertAt);
          } else {
            pipelineText += `\n\n${marker}\n\n${newJobsText.trim()}\n`;
          }
          writeFileSync(PIPELINE_PATH, pipelineText, 'utf-8');
        }
        
        console.log(`✅ Found ${found} new potential leads.`);
        success = true;
      } catch (err) {
        attempt++;
        const isTransientError = err.message.includes('503') || err.message.includes('429');
        if (isTransientError && attempt < maxRetries) {
          const retryDelay = 15000 * attempt; // Exponential backoff: 15s, 30s
          console.warn(`⚠️ Temporary API issue (${err.message.substring(0, 50)}...). Retrying in ${retryDelay/1000}s (Attempt ${attempt}/${maxRetries})...`);
          await delay(retryDelay);
        } else {
          console.error(`❌ Error searching for "${q.name}":`, err.message);
          break; // Stop retrying on non-transient or if out of retries
        }
      }
    }
    
    // Delay to avoid hitting the 5 RPM free tier limit
    console.log('⏳ Waiting 15s to respect rate limits before next query...');
    await delay(15000);
  }

  console.log('\n✨ Deep Search completed. Check your Pipeline for new leads!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
