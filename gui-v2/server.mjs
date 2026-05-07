import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseApplications, parsePipeline, getProfile } from './utils.mjs';

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
  import('./utils.mjs').then(utils => {
    res.json(utils.getPortals(ROOT));
  });
});

app.post('/api/status', (req, res) => {
  const { number, status } = req.body;
  import('./utils.mjs').then(utils => {
    utils.updateApplicationStatus(ROOT, number, status);
    res.json({ success: true });
  });
});

app.post('/api/profile', (req, res) => {
  const { data } = req.body;
  import('./utils.mjs').then(utils => {
    utils.saveProfile(ROOT, data);
    res.json({ success: true });
  });
});

// Command Execution
app.post('/api/run', async (req, res) => {
  const { command, args } = req.body;
  
  // Security check: only allow known scripts
  const allowedScripts = ['gemini-eval.mjs', 'scan.mjs', 'generate-pdf.mjs', 'merge-tracker.mjs', 'deep-scan.mjs'];
  if (!allowedScripts.includes(command)) {
    return res.status(400).json({ error: 'Invalid command' });
  }

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');

  const isEvaluation = command === 'gemini-eval.mjs';
  
  if (isEvaluation && args[0].startsWith('http')) {
    res.write('🤖 Pre-fetching job description to bypass CLI browser issues...\n');
    try {
      // Use a simple fetch to get the JD text
      const jdResponse = await fetch(args[0]);
      const jdHtml = await jdResponse.text();
      // Basic extraction of text to avoid overwhelming the prompt
      // Slice to 5000 chars to stay under the Windows 8192 CMD limit
      const jdText = jdHtml.replace(/<[^>]*>/g, ' ').slice(0, 5000).replace(/"/g, "'"); 
      
      const spawnArgs = ['@google/gemini-cli', '--model', 'flash', '-p', `"Evaluate this job, SAVE THE REPORT to reports/, and UPDATE data/applications.md: ${jdText}"`];
      const child = spawn('npx', spawnArgs, { cwd: ROOT, shell: true, env: process.env });
      
      child.stdout.on('data', (data) => res.write(data));
      child.stderr.on('data', (data) => res.write(`ERROR: ${data}`));
      child.on('close', (code) => {
        res.write(`\n--- FINISHED (Exit code: ${code}) ---`);
        res.end();
      });
      return; // Handled
    } catch (err) {
      res.write(`⚠️ Pre-fetch failed, falling back to direct CLI: ${err.message}\n`);
    }
  }

  const spawnCmd = isEvaluation ? 'npx' : 'node';
  const spawnArgs = isEvaluation 
    ? ['@google/gemini-cli', '--model', 'flash', '-p', `"/career-ops evaluate ${args[0]}"`]
    : [path.join(ROOT, command), ...args];

  const child = spawn(spawnCmd, spawnArgs, {
    cwd: ROOT,
    shell: true,
    env: process.env
  });

  child.stdout.on('data', (data) => {
    res.write(data);
  });

  child.stderr.on('data', (data) => {
    res.write(`ERROR: ${data}`);
  });

  child.on('close', (code) => {
    res.write(`\n--- FINISHED (Exit code: ${code}) ---`);
    res.end();
  });
});

const PORT = 3010;
app.listen(PORT, () => {
  console.log(`🚀 Career-Ops Backend running at http://localhost:${PORT}`);
});
