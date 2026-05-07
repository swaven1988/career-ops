import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseApplications, parsePipeline, getProfile, getPortals, updateApplicationStatus, saveProfile } from './utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const app = express();
app.use(cors());
app.use(express.json());

// API Endpoints
app.get('/api/applications', (req, res) => {
  res.json(parseApplications(ROOT));
});

app.get('/api/pipeline', (req, res) => {
  res.json(parsePipeline(ROOT));
});

app.get('/api/profile', (req, res) => {
  res.json(getProfile(ROOT));
});

app.get('/api/portals', (req, res) => {
  res.json(getPortals(ROOT));
});

app.get('/api/output-files', (req, res) => {
  const outputDir = path.join(ROOT, 'output');
  if (!fs.existsSync(outputDir)) return res.json([]);
  const files = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.pdf'))
    .sort()
    .reverse();
  res.json(files);
});

app.get('/api/scratch-files', (req, res) => {
  const scratchDir = path.join(ROOT, 'scratch');
  if (!fs.existsSync(scratchDir)) return res.json([]);
  const files = fs.readdirSync(scratchDir)
    .filter(f => f.startsWith('cv-') && f.endsWith('.html'))
    .sort();
  res.json(files);
});

app.post('/api/status', (req, res) => {
  const { number, status } = req.body;
  updateApplicationStatus(ROOT, number, status);
  res.json({ success: true });
});

app.post('/api/profile', (req, res) => {
  const { data } = req.body;
  saveProfile(ROOT, data);
  res.json({ success: true });
});

// Report viewer — serves markdown files from reports/ and interview-prep/
app.get('/api/report', (req, res) => {
  const reportPath = req.query.path;
  if (!reportPath) return res.status(400).json({ error: 'Missing path parameter' });

  const fullPath = path.resolve(ROOT, reportPath);
  // Security: only allow files inside ROOT, within reports/ or interview-prep/
  if (!fullPath.startsWith(ROOT)) return res.status(403).json({ error: 'Access denied' });
  const rel = path.relative(ROOT, fullPath);
  const allowed = rel.startsWith('reports') || rel.startsWith('interview-prep');
  if (!allowed) return res.status(403).json({ error: 'Access denied' });
  if (!['.md', '.txt'].includes(path.extname(fullPath))) return res.status(403).json({ error: 'File type not allowed' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Report not found' });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(fs.readFileSync(fullPath, 'utf-8'));
});

// Command Execution
app.post('/api/run', async (req, res) => {
  const { command, args } = req.body;

  const allowedScripts = ['gemini-eval.mjs', 'scan.mjs', 'generate-pdf.mjs', 'merge-tracker.mjs', 'deep-scan.mjs', 'generate-cv-fixed.mjs', 'linkedin-scan.mjs', 'naukri-scan.mjs', 'apply.mjs'];
  if (!allowedScripts.includes(command)) {
    return res.status(400).json({ error: `Command not allowed: ${command}` });
  }

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');

  const isEvaluation = command === 'gemini-eval.mjs';

  if (isEvaluation && args[0] && args[0].startsWith('http')) {
    res.write('🤖 Pre-fetching job description to bypass CLI browser issues...\n');
    try {
      const jdResponse = await fetch(args[0]);
      const jdHtml = await jdResponse.text();
      const jdText = jdHtml
        .replace(/<[^>]*>/g, ' ')
        .slice(0, 5000)
        .replace(/["`\\$;|&(){}\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const spawnArgs = ['@google/gemini-cli', '--model', 'flash', '-p', `Evaluate this job, SAVE THE REPORT to reports/, and UPDATE data/applications.md: ${jdText}`];
      const child = spawn('npx', spawnArgs, { cwd: ROOT, shell: true, env: process.env });

      child.stdout.on('data', (data) => res.write(data));
      child.stderr.on('data', (data) => res.write(`ERROR: ${data}`));
      child.on('close', (code) => {
        res.write(`\n--- FINISHED (Exit code: ${code}) ---`);
        res.end();
      });
      return;
    } catch (err) {
      res.write(`⚠️ Pre-fetch failed, falling back to direct CLI: ${err.message}\n`);
    }
  }

  const spawnCmd = isEvaluation ? 'npx' : 'node';
  const spawnArgs = isEvaluation
    ? ['@google/gemini-cli', '--model', 'flash', '-p', `"/career-ops evaluate ${args[0]}"`]
    : [path.join(ROOT, command), ...(args || [])];

  const child = spawn(spawnCmd, spawnArgs, {
    cwd: ROOT,
    shell: true,
    env: process.env
  });

  child.stdout.on('data', (data) => res.write(data));
  child.stderr.on('data', (data) => res.write(`ERROR: ${data}`));
  child.on('close', (code) => {
    res.write(`\n--- FINISHED (Exit code: ${code}) ---`);
    res.end();
  });
});

const PORT = 3010;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Career-Ops Backend running at http://localhost:${PORT}`);
});
