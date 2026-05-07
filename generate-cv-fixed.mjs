import fs from 'fs';
import yaml from 'js-yaml';

// 1. Load data
const profile = yaml.load(fs.readFileSync('config/profile.yml', 'utf8'));
const cvMarkdown = fs.readFileSync('cv.md', 'utf8');

// 2. Simple Markdown Parser
function parseCV(md) {
    const sections = {};
    let currentSection = '';
    const lines = md.split('\n');
    
    lines.forEach(line => {
        if (line.startsWith('## ')) {
            currentSection = line.replace('## ', '').trim();
            sections[currentSection] = [];
        } else if (currentSection && !line.startsWith('## ')) {
            sections[currentSection].push(line);
        }
    });
    return sections;
}

const cvData = parseCV(cvMarkdown);

// 3. Load Template
let template = fs.readFileSync('templates/cv-template.html', 'utf8');

function clean(text) {
    if (!text) return '';
    return text.replace(/\*\*/g, '').trim();
}

function renderJob(job) {
    return `
    <div class="job">
        <div class="job-header">
            <span class="job-company">${clean(job.company)}</span>
            <span class="job-period">${clean(job.period)}</span>
        </div>
        <div class="job-role">${clean(job.role)}</div>
        <ul>
            ${job.bullets.map(b => `<li>${b.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('\n')}
        </ul>
    </div>`;
}

// 4. Fill Placeholders
const replacements = {
    '{{LANG}}': 'en',
    '{{PAGE_WIDTH}}': '210mm',
    '{{NAME}}': profile.candidate.full_name,
    '{{PHONE}}': profile.candidate.phone,
    '{{EMAIL}}': profile.candidate.email,
    '{{LINKEDIN_URL}}': 'https://' + profile.candidate.linkedin,
    '{{LINKEDIN_DISPLAY}}': profile.candidate.linkedin,
    '{{PORTFOLIO_URL}}': profile.candidate.portfolio_url || '',
    '{{PORTFOLIO_DISPLAY}}': profile.candidate.portfolio_url ? profile.candidate.portfolio_url.replace(/^https?:\/\//, '') : '',
    '{{LOCATION}}': profile.candidate.location,
    '{{EXTRA_CONTACTS}}': '',
    '{{PHOTO_HTML}}': '',
    '{{SECTION_SUMMARY}}': 'Professional Summary',
    '{{SUMMARY_TEXT}}': cvData['Profile Summary'] ? cvData['Profile Summary'].join(' ').replace(/^- /gm, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').trim() : '',
    '{{SECTION_COMPETENCIES}}': 'Core Competencies',
    '{{COMPETENCIES}}': profile.target_roles.archetypes.map(a => `<span class="competency-tag">${a.name}</span>`).join('\n'),
    '{{SECTION_EXPERIENCE}}': 'Work Experience',
    '{{EXPERIENCE}}': '', 
    '{{SECTION_PROJECTS}}': 'Projects',
    '{{PROJECTS}}': '',
    '{{SECTION_EDUCATION}}': 'Education',
    '{{EDUCATION}}': '',
    '{{SECTION_CERTIFICATIONS}}': 'Certifications',
    '{{CERTIFICATIONS}}': '',
    '{{SECTION_SKILLS}}': 'Technical Skills',
    '{{SKILLS}}': ''
};

// Experience mapping
const expLines = (cvData['Work Experience'] || []).concat(cvData['Previous Experience'] || []);
let experienceHtml = '';
let currentJob = null;
expLines.forEach(line => {
    if (line.startsWith('### ')) {
        if (currentJob) experienceHtml += renderJob(currentJob);
        const parts = line.replace('### ', '').split('|').map(s => s.trim());
        currentJob = { 
            company: parts[0] || 'Unknown', 
            role: parts[1] || 'Unknown', 
            period: parts[2] || 'Unknown', 
            bullets: [] 
        };
    } else if (line.trim().startsWith('- ') && currentJob) {
        currentJob.bullets.push(line.trim().replace('- ', ''));
    }
});
if (currentJob) experienceHtml += renderJob(currentJob);
replacements['{{EXPERIENCE}}'] = experienceHtml;

// Skills mapping
if (cvData['Technical Skills']) {
    replacements['{{SKILLS}}'] = `<div class="skills-grid">` + 
        cvData['Technical Skills']
        .filter(l => l.trim().startsWith('- '))
        .map(l => {
            const raw = l.trim().replace('- ', '');
            const colonIndex = raw.indexOf(':');
            if (colonIndex === -1) return `<div class="skill-item">${clean(raw)}</div>`;
            const cat = clean(raw.substring(0, colonIndex));
            const val = clean(raw.substring(colonIndex + 1));
            return `<div class="skill-item"><span class="skill-category">${cat}:</span> ${val}</div>`;
        }).join('\n') + `</div>`;
}

// Education mapping
if (cvData['Education']) {
    replacements['{{EDUCATION}}'] = cvData['Education']
        .filter(l => l.trim().startsWith('- '))
        .map(l => {
            const line = clean(l.replace('- ', ''));
            const match = line.match(/^(\d+): (.*)/);
            if (match) return `<div class="edu-item"><div class="edu-header"><span class="edu-title">${match[2]}</span><span class="edu-year">${match[1]}</span></div></div>`;
            return `<div class="edu-item">${line}</div>`;
        }).join('\n');
}

// Certifications mapping
if (cvData['Certifications']) {
    replacements['{{CERTIFICATIONS}}'] = cvData['Certifications']
        .filter(l => l.trim().startsWith('- '))
        .map(l => `<div class="cert-item"><span class="cert-title">${clean(l.replace('- ', ''))}</span></div>`).join('\n');
}

// Perform replacements
Object.keys(replacements).forEach(key => {
    template = template.split(key).join(replacements[key]);
});

// Inject Custom CSS Overrides
const customStyle = `
<style>
  .skills-grid {
    display: block !important;
    margin-top: 10px;
  }
  .skill-item {
    margin-bottom: 8px;
    line-height: 1.4;
  }
  .skill-category {
    font-weight: 700 !important;
    color: #1a1a2e !important;
  }
</style>
`;
template = template.replace('</head>', `${customStyle}</head>`);

fs.writeFileSync('output/cv-venkatesh-general.html', template);
console.log('HTML generated at output/cv-venkatesh-general.html');
