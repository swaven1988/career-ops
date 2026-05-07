import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export function getPortals(rootPath) {
  const filePath = path.join(rootPath, 'portals.yml');
  if (!fs.existsSync(filePath)) return {};
  return yaml.load(fs.readFileSync(filePath, 'utf-8'));
}

export function parseApplications(rootPath) {
  const filePath = path.join(rootPath, 'data', 'applications.md');
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const apps = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.includes('| #') || trimmed.includes('|---')) continue;

    const fields = trimmed.split('|').map(f => f.trim()).filter((_, i) => i > 0);
    if (fields.length < 8) continue;

    apps.push({
      number: fields[0],
      date: fields[1],
      company: fields[2],
      role: fields[3],
      score: parseFloat(fields[4].split('/')[0]) || 0,
      status: fields[5].replace(/\*\*/g, ''),
      pdf: fields[6].includes('✅'),
      report: fields[7].match(/\[(\d+)\]\((.+)\)/)?.[2] || ''
    });
  }
  return apps;
}

export function parsePipeline(rootPath) {
  const filePath = path.join(rootPath, 'data', 'pipeline.md');
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const pipeline = [];

  for (const line of lines) {
    const match = line.match(/- \[ \] (https?:\/\/\S+)\s*\|\s*([^|]+)\s*\|\s*(.+)/);
    if (match) {
      pipeline.push({
        url: match[1],
        company: match[2].trim(),
        role: match[3].trim()
      });
    }
  }
  return pipeline;
}

export function getProfile(rootPath) {
  const filePath = path.join(rootPath, 'config', 'profile.yml');
  if (!fs.existsSync(filePath)) return {};
  return yaml.load(fs.readFileSync(filePath, 'utf-8'));
}

export function saveProfile(rootPath, data) {
  const filePath = path.join(rootPath, 'config', 'profile.yml');
  fs.writeFileSync(filePath, yaml.dump(data), 'utf-8');
}

export function updateApplicationStatus(rootPath, number, newStatus) {
  const filePath = path.join(rootPath, 'data', 'applications.md');
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    if (line.includes(`| ${number} |`)) {
      const parts = line.split('|');
      parts[6] = ` ${newStatus} `;
      return parts.join('|');
    }
    return line;
  });
  fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
}
