import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

const filePath = process.argv[2];
const content = fs.readFileSync(filePath, 'utf8');
const data = yaml.load(content);

const tracked = data.tracked_companies;
const seen = new Set();
const unique = [];

for (const company of tracked) {
  if (!seen.has(company.name)) {
    unique.push(company);
    seen.add(company.name);
  } else {
    console.log(`Removing duplicate: ${company.name}`);
  }
}

data.tracked_companies = unique;
fs.writeFileSync(filePath, yaml.dump(data, { noRefs: true, lineWidth: -1 }));
console.log('Deduplication complete.');
