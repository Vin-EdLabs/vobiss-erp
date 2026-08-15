import fs from 'fs';
const p = new URL('../src/pages/production/ProductionDetail.tsx', import.meta.url);
let c = fs.readFileSync(p, 'utf8');
const start = c.indexOf('header={');
const end = c.indexOf('    >', start);
if (start === -1 || end === -1) {
  console.error('markers not found');
  process.exit(1);
}
const before = c.slice(0, start);
const after = c.slice(end);
c = before + 'header={<ProjectRequestDetailHeader request={request} />}\n' + after;
fs.writeFileSync(p, c);
console.log('patched');
