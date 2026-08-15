import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = fileURLToPath(new URL('../src', import.meta.url));
const reps = [
  ['ProductionUnit', 'ProjectUnit'],
  ['ProductionRemark', 'ProjectRequestRemark'],
  ['ProductionAttachment', 'ProjectRequestAttachment'],
  ['ProductionRequestStatus', 'ProjectRequestStatus'],
  ['ProductionRequest', 'ProjectRequest'],
];

function walk(d, files = []) {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (/\.(tsx?)$/.test(name) && !p.endsWith('api\\production.ts') && !p.endsWith('api/production.ts'))
      files.push(p);
  }
  return files;
}

for (const file of walk(dir)) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  for (const [a, b] of reps) c = c.split(a).join(b);
  if (c !== orig) {
    fs.writeFileSync(file, c);
    console.log(path.relative(dir, file));
  }
}
