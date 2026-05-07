const API_URL = 'http://localhost:3010/api';

const CANONICAL_STATUSES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];

const state = {
  view: 'dashboard',
  applications: [],
  pipeline: [],
  profile: {},
  portals: {}
};

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupActionButtons();
  setupApplyModal();
  await refreshData();
  renderView();
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.view = btn.dataset.view;
      document.getElementById('view-title').innerText = btn.dataset.title || 'Dashboard';
      renderView();
    });
  });
}

function setupActionButtons() {
  document.getElementById('btn-scan').addEventListener('click', () => {
    const regions = Array.from(document.getElementById('scan-regions').selectedOptions).map(o => o.value);
    const custom = document.getElementById('custom-region').value.trim();
    if (custom) regions.push(custom);
    const companies = Array.from(document.getElementById('scan-companies').selectedOptions).map(o => o.value);
    const args = [];
    if (regions.length > 0) args.push('--location', regions.join(','));
    if (companies.length > 0) args.push('--company', companies.join(','));
    runCommand('scan.mjs', args);
  });

  document.getElementById('btn-deep-scan').addEventListener('click', () => {
    runCommand('deep-scan.mjs');
  });

  document.getElementById('btn-sync').addEventListener('click', () => runCommand('merge-tracker.mjs'));

  document.getElementById('close-terminal').addEventListener('click', closeTerminal);

  document.getElementById('terminal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('terminal-overlay')) closeTerminal();
  });

  const reportOverlay = document.getElementById('report-overlay');
  document.getElementById('close-report').addEventListener('click', () => reportOverlay.classList.add('hidden'));
  reportOverlay.addEventListener('click', (e) => {
    if (e.target === reportOverlay) reportOverlay.classList.add('hidden');
  });
}

function closeTerminal() {
  document.getElementById('terminal-overlay').classList.add('hidden');
}

function setupApplyModal() {
  const modal = document.getElementById('apply-modal');

  document.getElementById('close-apply-modal').addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  document.getElementById('apply-open-url').addEventListener('click', () => {
    const url = document.getElementById('apply-url-input').value.trim();
    if (url) window.open(url);
    else alert('Enter a job URL first.');
  });

  document.getElementById('btn-autofill').addEventListener('click', () => {
    const url = document.getElementById('apply-url-input').value.trim();
    if (!url) { alert('Paste the job URL into the URL field first.'); return; }
    const cvFile = document.getElementById('apply-cv-select').value;
    const args = cvFile ? [url, '--cv', `output/${cvFile}`] : [url];
    modal.classList.add('hidden');
    runCommand('apply.mjs', args);
  });

  document.getElementById('btn-mark-applied').addEventListener('click', async () => {
    const number = modal.dataset.appNumber;
    if (!number) {
      alert('This job is not in your tracker yet.\nEvaluate it first (click "Evaluate" in Pipeline), then update its status here.');
      return;
    }
    await window.updateStatus(number, 'Applied');
    modal.classList.add('hidden');
  });
}

async function refreshData() {
  try {
    const [apps, pipe, prof, port] = await Promise.all([
      fetch(`${API_URL}/applications`).then(r => r.json()),
      fetch(`${API_URL}/pipeline`).then(r => r.json()),
      fetch(`${API_URL}/profile`).then(r => r.json()),
      fetch(`${API_URL}/portals`).then(r => r.json())
    ]);
    state.applications = apps;
    state.pipeline = pipe;
    state.profile = prof;
    state.portals = port;
    populateCompanySelector();
    const nameEl = document.getElementById('user-name');
    if (nameEl && prof.candidate?.full_name) nameEl.innerText = prof.candidate.full_name.split(' ')[0];
  } catch (err) {
    console.error('Failed to fetch data:', err);
  }
}

function populateCompanySelector() {
  const select = document.getElementById('scan-companies');
  if (!select) return;
  const companies = (state.portals.tracked_companies || [])
    .filter(c => c.enabled !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
  const currentSelections = Array.from(select.selectedOptions).map(o => o.value);
  select.innerHTML = companies.map(c =>
    `<option value="${c.name}" ${currentSelections.includes(c.name) ? 'selected' : ''}>${c.name}</option>`
  ).join('');
}

function renderView() {
  const container = document.getElementById('view-container');
  container.innerHTML = '';
  switch (state.view) {
    case 'dashboard': renderDashboard(container); break;
    case 'pipeline':  renderPipeline(container);  break;
    case 'evaluator': renderEvaluator(container); break;
    case 'profile':   renderProfile(container);   break;
    case 'cv':        renderCvGenerator(container); break;
    case 'remote':    renderRemote(container);      break;
  }
}

function statusOptions(current) {
  return CANONICAL_STATUSES.map(s =>
    `<option value="${s}" ${current === s ? 'selected' : ''}>${s}</option>`
  ).join('');
}

function renderDashboard(container) {
  const stats = computeStats();
  const funnel = computeFunnel();

  container.innerHTML = `
    <div class="stats-grid">
      <div class="card">
        <div class="stat-label">Total Applications</div>
        <div class="stat-value">${stats.total}</div>
      </div>
      <div class="card">
        <div class="stat-label">Average Score</div>
        <div class="stat-value">${stats.avgScore.toFixed(1)}/5</div>
      </div>
      <div class="card">
        <div class="stat-label">Active Roles</div>
        <div class="stat-value">${stats.active}</div>
      </div>
      <div class="card">
        <div class="stat-label">Pending Pipeline</div>
        <div class="stat-value">${state.pipeline.length}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 300px; gap: 24px; margin-bottom: 40px;">
      <div class="card">
        <h2 style="margin-bottom: 20px">Applications (${state.applications.length})</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Role</th>
                <th>Score</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.applications.map(app => `
                <tr>
                  <td>${app.date}</td>
                  <td style="font-weight: 600">${app.company}</td>
                  <td>${app.role}</td>
                  <td><span style="color: ${getScoreColor(app.score)}">${app.score}/5</span></td>
                  <td>
                    <select class="status-select" onchange="updateStatus('${app.number}', this.value)">
                      ${statusOptions(app.status)}
                    </select>
                  </td>
                  <td>
                    <button class="btn-icon" onclick="generatePdf('${app.report}')" title="Generate PDF">📄</button>
                    ${app.report ? `<button class="btn-icon" onclick="viewReport('${app.report}')" title="View Report">🔍</button>` : ''}
                    <button class="btn-icon" onclick="applyFromApp('${app.number}', ${JSON.stringify(app.company)}, ${JSON.stringify(app.role)}, '${app.report || ''}')" title="Apply for this job">✍️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-bottom: 20px">Funnel</h2>
        <div class="funnel">
          ${funnel.map(stage => `
            <div class="funnel-stage" style="width: ${stage.pct}%">
              <span class="stage-label">${stage.label}</span>
              <span class="stage-count">${stage.count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderEvaluator(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto">
      <h2 style="margin-bottom: 12px">AI Job Evaluator</h2>
      <p style="color: var(--text-muted); margin-bottom: 24px">Paste a Job Description below to evaluate it against your profile using Gemini.</p>

      <textarea id="jd-input" placeholder="Paste full JD text here..."
        style="width: 100%; height: 300px; background: var(--bg-dark); border: 1px solid var(--glass-border); border-radius: 8px; color: white; padding: 16px; margin-bottom: 20px; font-family: inherit; resize: none;"></textarea>

      <div style="display: flex; gap: 12px">
        <button id="btn-evaluate" class="btn-primary" style="flex: 1">Run AI Evaluation</button>
        <button id="btn-paste" class="btn-secondary">Paste from Clipboard</button>
      </div>
    </div>
  `;

  document.getElementById('btn-evaluate').addEventListener('click', () => {
    const jd = document.getElementById('jd-input').value.trim();
    if (jd) runCommand('gemini-eval.mjs', [jd]);
    else alert('Please paste a job description first.');
  });

  // Bug fix: btn-paste was missing its listener
  document.getElementById('btn-paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById('jd-input').value = text;
    } catch {
      alert('Clipboard access denied — please paste manually with Ctrl+V.');
    }
  });
}

function renderPipeline(container) {
  const rows = state.pipeline.length
    ? state.pipeline.map(item => `
        <tr>
          <td style="font-weight: 600">${item.company}</td>
          <td>${item.role}</td>
          <td>
            <button class="btn-secondary" onclick="window.open('${item.url}')">View JD</button>
            <button class="btn-primary" onclick="runCommand('gemini-eval.mjs', ['${item.url}'])">Evaluate</button>
            <button class="btn-secondary" style="border-color:#10b981;color:#10b981" onclick="showApplyModal(${JSON.stringify(item.url)}, ${JSON.stringify(item.company)}, ${JSON.stringify(item.role || '')}, '')">✍️ Apply</button>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:32px">Pipeline is empty. Run a scan to add offers.</td></tr>`;

  container.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom: 20px">Pipeline Inbox (${state.pipeline.length})</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Company</th><th>Role</th><th>Actions</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderProfile(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 800px">
      <h2 style="margin-bottom: 8px">Edit Profile</h2>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Editing as JSON — saved back as YAML.</p>
      <textarea id="profile-json" style="width: 100%; height: 400px; background: var(--bg-dark); border: 1px solid var(--glass-border); border-radius: 8px; color: white; padding: 16px; margin-bottom: 20px; font-family: 'Courier New', monospace;">${JSON.stringify(state.profile, null, 2)}</textarea>
      <button id="btn-save-profile" class="btn-primary">Save profile.yml</button>
    </div>
  `;

  document.getElementById('btn-save-profile').addEventListener('click', async () => {
    try {
      const data = JSON.parse(document.getElementById('profile-json').value);
      await fetch(`${API_URL}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      alert('Profile saved!');
      await refreshData();
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  });
}

function renderCvGenerator(container) {
  const name = (state.profile.candidate?.full_name || 'candidate').toLowerCase().replace(/\s+/g, '-');
  const today = new Date().toISOString().slice(0, 10);
  const generalHtml = `output/cv-${name}-general.html`;
  const generalPdf  = `output/cv-${name}-general-${today}.pdf`;

  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto">
      <h2 style="margin-bottom: 8px">CV Generator</h2>
      <p style="color: var(--text-muted); margin-bottom: 24px">
        Generate your general CV from <code>cv.md</code> + <code>config/profile.yml</code>, then convert to PDF.
      </p>

      <div style="border: 1px solid var(--glass-border); border-radius: 8px; padding: 20px; margin-bottom: 24px">
        <h3 style="margin-bottom: 16px">General CV</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px">
          Reads your <code>cv.md</code> and profile to produce <code>${generalHtml}</code>
        </p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap">
          <button class="btn-primary" id="btn-gen-html">Step 1 — Generate HTML</button>
          <button class="btn-secondary" id="btn-gen-pdf">Step 2 — Convert to PDF</button>
        </div>
        <p style="color: var(--text-muted); font-size: 12px; margin-top: 12px">PDF → <code>${generalPdf}</code></p>
      </div>

      <div style="border: 1px solid var(--glass-border); border-radius: 8px; padding: 20px">
        <h3 style="margin-bottom: 16px">Company-Specific CVs</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px">
          All <code>cv-*.html</code> files found in <code>scratch/</code>.
        </p>
        <div id="cv-scratch-list" style="display: flex; flex-direction: column; gap: 12px">
          <p style="color: var(--text-muted); font-size: 13px">Loading...</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-gen-html').addEventListener('click', () => runCommand('generate-cv-fixed.mjs'));
  document.getElementById('btn-gen-pdf').addEventListener('click', () => runCommand('generate-pdf.mjs', [generalHtml, generalPdf]));

  fetch(`${API_URL}/scratch-files`).then(r => r.json()).then(files => {
    const el = document.getElementById('cv-scratch-list');
    if (!el) return;
    if (!files.length) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:13px">No <code>cv-*.html</code> files found in <code>scratch/</code>.</p>`;
      return;
    }
    el.innerHTML = files.map(f => {
      const company = f.replace(/^cv-[^-]+-/, '').replace('.html', '');
      const pdf = `output/cv-${name}-${company}-${today}.pdf`;
      return `
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--bg-dark); border-radius: 6px">
          <span style="flex: 1; font-size: 13px; text-transform: capitalize">${company}</span>
          <code style="font-size: 11px; color: var(--text-muted); flex: 2">scratch/${f}</code>
          <button class="btn-secondary" style="font-size: 12px; padding: 6px 12px"
            onclick="runCommand('generate-pdf.mjs', ['scratch/${f}', '${pdf}'])">Generate PDF</button>
        </div>`;
    }).join('');
    // Update heading count
    const h3 = el.closest('[style*="border"]')?.querySelector('h3');
    if (h3) h3.innerText = `Company-Specific CVs (${files.length} in scratch/)`;
  }).catch(() => {
    const el = document.getElementById('cv-scratch-list');
    if (el) el.innerHTML = `<p style="color:var(--text-muted);font-size:13px">Could not load scratch files.</p>`;
  });
}

function renderRemote(container) {
  const remoteBoards = [
    { name: 'Himalayas',       url: 'https://himalayas.app/jobs/remote',        desc: 'Curated remote AI & tech roles' },
    { name: 'WeWorkRemotely',  url: 'https://weworkremotely.com',               desc: 'Largest remote-only job board' },
    { name: 'RemoteOK',        url: 'https://remoteok.com/?tags=ai',            desc: 'Remote AI & engineering roles' },
    { name: 'Remotive',        url: 'https://remotive.com/remote-jobs/software-dev', desc: 'Verified remote tech companies' },
    { name: 'Wellfound',       url: 'https://wellfound.com/jobs?remote=true',   desc: 'AI startup remote roles globally' },
    { name: 'Otta',            url: 'https://otta.com',                         desc: 'Curated tech roles, remote filter' },
    { name: 'YC Work at a Startup', url: 'https://workatastartup.com',         desc: 'YC-backed startups worldwide' },
    { name: 'Jobspresso',      url: 'https://jobspresso.co',                    desc: 'Hand-curated remote jobs' },
  ];

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 24px">

      <div class="stats-grid">
        <div class="card">
          <div class="stat-label">Remote Queries</div>
          <div class="stat-value">14</div>
        </div>
        <div class="card">
          <div class="stat-label">Remote Boards Indexed</div>
          <div class="stat-value">${remoteBoards.length}</div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-bottom: 8px">Scan Remote Jobs</h2>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">
          Run targeted scans using AI-powered search grounding or direct platform APIs.
        </p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap">
          <button class="btn-primary" onclick="runCommand('deep-scan.mjs', ['--remote'])">🌍 Deep Scan — Remote Only</button>
          <button class="btn-secondary" onclick="runCommand('linkedin-scan.mjs')">🔗 Scan LinkedIn Remote</button>
          <button class="btn-secondary" onclick="runCommand('naukri-scan.mjs')">🏢 Scan Naukri India</button>
          <button class="btn-secondary" onclick="runCommand('deep-scan.mjs')">🔍 Full Deep Scan (All Boards)</button>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-bottom: 16px">Top Remote Boards</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px">
          ${remoteBoards.map(b => `
            <div style="padding: 14px; background: var(--bg-dark); border: 1px solid var(--glass-border); border-radius: 8px; display: flex; flex-direction: column; gap: 6px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <span style="font-weight: 600">${b.name}</span>
                <button class="btn-icon" onclick="window.open('${b.url}')" title="Open">↗</button>
              </div>
              <span style="font-size: 12px; color: var(--text-muted)">${b.desc}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px">
        <div class="card">
          <h2 style="margin-bottom: 16px">🔗 LinkedIn Premium Tips</h2>
          <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px">
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">Job Alerts → Pipeline</div>
              <div style="color: var(--text-muted)">Set up alerts at linkedin.com/jobs/search with "Remote" filter. When emails arrive, paste job URLs into the Pipeline tab.</div>
            </div>
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">InMail After Evaluation</div>
              <div style="color: var(--text-muted)">Once a role scores ≥ 4.0, use Premium InMail to message the hiring manager directly — attach your tailored CV.</div>
            </div>
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">Who Viewed Your Profile</div>
              <div style="color: var(--text-muted)">Check daily. Companies viewing you are warm leads. Research them and add to portals.yml as tracked companies.</div>
            </div>
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">Open to Work (Recruiters Only)</div>
              <div style="color: var(--text-muted)">Enable "Open to Work" visible to recruiters only — not your network. Target: "AI", "LLM", "Applied AI" roles globally.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2 style="margin-bottom: 16px">🏢 Naukri Premium Tips</h2>
          <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px">
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">Profile Visibility Boost</div>
              <div style="color: var(--text-muted)">Premium profiles appear at the top of recruiter searches. Keep your headline and headline tags updated: "AI Engineering", "LLM", "Applied AI".</div>
            </div>
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">Who Viewed Your Resume</div>
              <div style="color: var(--text-muted)">Visit naukri.com → My Naukri → Who viewed my profile. Companies that viewed you = warm leads. Research and evaluate them here.</div>
            </div>
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">Job Alerts</div>
              <div style="color: var(--text-muted)">Set keyword alerts: "Head of AI Bengaluru", "AI Engineering Manager remote", "LLM Engineer India". New matches land in email — paste URLs here.</div>
            </div>
            <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px">
              <div style="font-weight: 600; margin-bottom: 4px">Priority Applicant</div>
              <div style="color: var(--text-muted)">When applying, use "Apply with Naukri Premium" for your application to appear highlighted. But only apply to roles that score ≥ 4.0 here first.</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}

// Global actions (used by inline onclick handlers)

async function extractUrlFromReport(reportPath) {
  try {
    const res = await fetch(`${API_URL}/report?path=${encodeURIComponent(reportPath)}`);
    if (!res.ok) return '';
    const text = await res.text();
    const match = text.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

window.showApplyModal = async (url, company, role, number) => {
  const modal = document.getElementById('apply-modal');
  const c = state.profile.candidate || {};

  document.getElementById('apply-title').innerText = company || 'Apply';
  document.getElementById('apply-subtitle').innerText = role || '';
  document.getElementById('apply-url-input').value = url || '';
  modal.dataset.appNumber = number || '';

  const fields = [
    { key: 'Name',     val: c.full_name || '' },
    { key: 'Email',    val: c.email || '' },
    { key: 'Phone',    val: c.phone || '' },
    { key: 'LinkedIn', val: c.linkedin ? `https://${c.linkedin}` : '' },
    { key: 'Location', val: c.location || '' },
  ];

  document.getElementById('apply-profile-fields').innerHTML = fields.map(f => `
    <div class="apply-profile-row">
      <span class="apply-profile-key">${f.key}</span>
      <span class="apply-profile-val" title="${f.val}">${f.val || `<span style="color:var(--text-muted);font-style:italic">not set</span>`}</span>
      ${f.val ? `<button class="btn-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(f.val)}).then(()=>{this.innerText='✓';setTimeout(()=>this.innerText='Copy',1200)})">Copy</button>` : ''}
    </div>
  `).join('');

  // Populate CV selector from output/ directory
  const pdfFiles = await fetch(`${API_URL}/output-files`).then(r => r.json()).catch(() => []);
  const cvSelect = document.getElementById('apply-cv-select');
  cvSelect.innerHTML = `<option value="">-- No attachment (add manually in browser) --</option>` +
    pdfFiles.map(f => `<option value="${f}">${f}</option>`).join('');
  const generalCv = pdfFiles.find(f => f.includes('general'));
  if (generalCv) cvSelect.value = generalCv;

  modal.classList.remove('hidden');
};

window.applyFromApp = async (number, company, role, reportPath) => {
  let url = '';
  if (reportPath) url = await extractUrlFromReport(reportPath);
  window.showApplyModal(url, company, role, number);
};

window.updateStatus = async (number, status) => {
  await fetch(`${API_URL}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, status })
  });
  await refreshData();
  renderView();
};

window.generatePdf = (reportPath) => {
  const match = reportPath.match(/(\d+)-([^-]+)/);
  if (!match) return alert('Cannot identify report to find matching CV HTML.');
  const [, , company] = match;
  const today = new Date().toISOString().slice(0, 10);
  const slug = (state.profile.candidate?.full_name || 'candidate').toLowerCase().replace(/\s+/g, '-');
  const inputHtml = `scratch/cv-${slug}-${company.toLowerCase()}.html`;
  const outputPdf = `output/cv-${slug}-${company.toLowerCase()}-${today}.pdf`;
  runCommand('generate-pdf.mjs', [inputHtml, outputPdf]);
};

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyInline(text) {
  return escHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="r-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="r-link">$1</a>');
}

function buildTable(lines) {
  const dataLines = lines.filter(l => !/^\|[-:\s|]+\|$/.test(l.trim()));
  if (!dataLines.length) return '';
  const headers = dataLines[0].split('|').slice(1, -1)
    .map(c => `<th>${applyInline(c.trim())}</th>`).join('');
  const bodyRows = dataLines.slice(1).map(row =>
    `<tr>${row.split('|').slice(1, -1).map(c => `<td>${applyInline(c.trim())}</td>`).join('')}</tr>`
  ).join('');
  return `<table class="r-table"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t.startsWith('|') && t.endsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        block.push(lines[i++]);
      }
      out.push(buildTable(block));
      continue;
    }
    if (t.startsWith('### '))      out.push(`<h3 class="r-h3">${applyInline(t.slice(4))}</h3>`);
    else if (t.startsWith('## ')) out.push(`<h2 class="r-h2">${applyInline(t.slice(3))}</h2>`);
    else if (t.startsWith('# '))  out.push(`<h1 class="r-h1">${applyInline(t.slice(2))}</h1>`);
    else if (/^---+$/.test(t))    out.push('<hr class="r-hr">');
    else if (t === '')             out.push('<div style="height:6px"></div>');
    else                           out.push(`<p class="r-p">${applyInline(line)}</p>`);
    i++;
  }
  return out.join('');
}

window.viewReport = async (reportPath) => {
  if (!reportPath) return alert('No report path available.');
  const overlay = document.getElementById('report-overlay');
  const content = document.getElementById('report-content');
  const filename = document.getElementById('report-filename');
  filename.innerText = reportPath.split('/').pop() || reportPath;
  content.innerHTML = '<p class="r-p" style="color:var(--text-muted)">Loading…</p>';
  overlay.classList.remove('hidden');
  try {
    const res = await fetch(`${API_URL}/report?path=${encodeURIComponent(reportPath)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      content.innerHTML = `<p class="r-p" style="color:#ef4444">ERROR: ${err.error}</p>`;
      return;
    }
    content.innerHTML = renderMarkdown(await res.text());
  } catch (err) {
    content.innerHTML = `<p class="r-p" style="color:#ef4444">ERROR: ${err.message}</p>`;
  }
};

// Helpers
function computeStats() {
  return {
    total: state.applications.length,
    avgScore: state.applications.reduce((acc, app) => acc + app.score, 0) / (state.applications.length || 1),
    active: state.applications.filter(a => ['Applied', 'Responded', 'Interview', 'Offer'].includes(a.status)).length
  };
}

function computeFunnel() {
  const counts = {
    Evaluated: state.applications.length,
    Applied: state.applications.filter(a => ['Applied', 'Responded', 'Interview', 'Offer'].includes(a.status)).length,
    Interview: state.applications.filter(a => ['Interview', 'Offer'].includes(a.status)).length,
    Offer: state.applications.filter(a => a.status === 'Offer').length
  };
  return Object.entries(counts).map(([label, count]) => ({
    label,
    count,
    pct: counts.Evaluated > 0 ? (count / counts.Evaluated) * 100 : 0
  }));
}

function getScoreColor(score) {
  if (score >= 4) return '#10b981';
  if (score >= 3) return '#f59e0b';
  return '#ef4444';
}

async function runCommand(command, args = []) {
  const terminal = document.getElementById('terminal-overlay');
  const output = document.getElementById('terminal-output');
  terminal.classList.remove('hidden');
  output.innerText = `> node ${command} ${args.join(' ')}\n\n`;

  try {
    const response = await fetch(`${API_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, args })
    });

    // Bug fix: handle HTTP error responses before streaming
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      output.innerText += `ERROR: ${err.error || 'Command failed'}`;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output.innerText += decoder.decode(value);
      output.scrollTop = output.scrollHeight;
    }

    await refreshData();
    renderView();
  } catch (err) {
    output.innerText += `\n\nERROR: ${err.message}`;
  }
}

window.runCommand = runCommand;
