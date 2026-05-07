const API_URL = 'http://localhost:3010/api';

const state = {
  view: 'dashboard',
  applications: [],
  pipeline: [],
  profile: {},
  portals: {}
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupActionButtons();
  await refreshData();
  renderView();
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.view = btn.dataset.view;
      document.getElementById('view-title').innerText = btn.dataset.title || "Dashboard";
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
  document.getElementById('close-terminal').addEventListener('click', () => {
    document.getElementById('terminal-overlay').classList.add('hidden');
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
  
  select.innerHTML = companies.map(c => `
    <option value="${c.name}" ${currentSelections.includes(c.name) ? 'selected' : ''}>${c.name}</option>
  `).join('');
}

function renderView() {
  const container = document.getElementById('view-container');
  container.innerHTML = '';

  switch (state.view) {
    case 'dashboard':
      renderDashboard(container);
      break;
    case 'pipeline':
      renderPipeline(container);
      break;
    case 'evaluator':
      renderEvaluator(container);
      break;
    case 'profile':
      renderProfile(container);
      break;
  }
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
        <h2 style="margin-bottom: 20px">Recent Activity</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Role</th>
                <th>Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${state.applications.slice(0, 10).map(app => `
                <tr>
                  <td>${app.date}</td>
                  <td style="font-weight: 600">${app.company}</td>
                  <td>${app.role}</td>
                  <td><span style="color: ${getScoreColor(app.score)}">${app.score}/5</span></td>
                  <td>
                    <select class="status-select" onchange="updateStatus('${app.number}', this.value)">
                      <option value="Evaluated" ${app.status === 'Evaluated' ? 'selected' : ''}>Evaluated</option>
                      <option value="Applied" ${app.status === 'Applied' ? 'selected' : ''}>Applied</option>
                      <option value="Interview" ${app.status === 'Interview' ? 'selected' : ''}>Interview</option>
                      <option value="Rejected" ${app.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                    </select>
                  </td>
                  <td>
                    <button class="btn-icon" onclick="generatePdf('${app.report}')" title="Generate PDF">📄</button>
                    <button class="btn-icon" onclick="window.open('http://localhost:3000/${app.report}')" title="View Report">🔍</button>
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
    const jd = document.getElementById('jd-input').value;
    if (jd) runCommand('gemini-eval.mjs', [jd]);
  });
}

function renderPipeline(container) {
  container.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom: 20px">Pipeline Inbox</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.pipeline.map(item => `
              <tr>
                <td style="font-weight: 600">${item.company}</td>
                <td>${item.role}</td>
                <td>
                  <button class="btn-secondary" onclick="window.open('${item.url}')">View JD</button>
                  <button class="btn-primary" onclick="runCommand('gemini-eval.mjs', ['${item.url}'])">Evaluate</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderProfile(container) {
  const p = state.profile.candidate || {};
  container.innerHTML = `
    <div class="card" style="max-width: 800px">
      <h2 style="margin-bottom: 24px">Edit Profile</h2>
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

// Global actions
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
  // Extract company name and report ID
  const match = reportPath.match(/(\d+)-([^-]+)/);
  if (!match) return alert('Cannot identify report');
  
  const [_, id, company] = match;
  const inputHtml = `scratch/cv-venkatesh-${company.toLowerCase()}.html`;
  const outputPdf = `output/cv-venkatesh-${company.toLowerCase()}-2026-04-27.pdf`;
  
  runCommand('generate-pdf.mjs', [inputHtml, outputPdf]);
};

// Helpers
function computeStats() {
  return {
    total: state.applications.length,
    avgScore: state.applications.reduce((acc, app) => acc + app.score, 0) / (state.applications.length || 1),
    active: state.applications.filter(a => ['Applied', 'Interview'].includes(a.status)).length
  };
}

function computeFunnel() {
  const counts = {
    Evaluated: state.applications.length,
    Applied: state.applications.filter(a => ['Applied', 'Interview', 'Offer'].includes(a.status)).length,
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output.innerText += decoder.decode(value);
      
      // Auto-scroll the output area
      output.scrollTop = output.scrollHeight;
    }
    
    // Refresh data after command finishes
    await refreshData();
    renderView();
  } catch (err) {
    output.innerText += `\n\nERROR: ${err.message}`;
  }
}
// Expose to window for inline onclick handlers
window.runCommand = runCommand;
window.generatePdf = generatePdf;
window.updateStatus = updateStatus;
window.refreshData = refreshData;
window.renderView = renderView;
