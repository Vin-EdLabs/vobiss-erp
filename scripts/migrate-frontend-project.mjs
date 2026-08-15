import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = fileURLToPath(new URL('../src', import.meta.url));

const fileReps = [
  ["from '@/api/production'", "from '@/api/project'"],
  ["from '../api/production'", "from '../api/project'"],
  ['getProductionDashboard', 'getProjectRequestDashboard'],
  ['listProductionRequests', 'listProjectRequests'],
  ['projectCompleteProductionRequest', 'projectCompleteProjectRequest'],
  ['getProductionRequest', 'getProjectRequest'],
  ['addProductionRemark', 'addProjectRequestRemark'],
  ['uploadProductionAttachment', 'uploadProjectRequestAttachment'],
  ['tsAcceptProductionRequest', 'tsAcceptProjectRequest'],
  ['tsRejectProductionRequest', 'tsRejectProjectRequest'],
  ['ipUpdateProductionRequest', 'ipUpdateProjectRequest'],
  ['ipForwardProductionRequest', 'ipForwardProjectRequest'],
  ['nocApproveProductionRequest', 'nocApproveProjectRequest'],
  ['createProductionRequest', 'createProjectRequest'],
  ['getProductionUnits', 'getProjectUnits'],
  ['createProductionUnit', 'createProjectUnit'],
  ['updateProductionUnit', 'updateProjectUnit'],
  ['getMyProductionUnits', 'getMyProjectUnits'],
  ['productionFileUrl', 'projectRequestFileUrl'],
  ['type ProductionRequest', 'type ProjectRequest'],
  ['type ProductionUnit', 'type ProjectUnit'],
  ['type ProductionRemark', 'type ProjectRequestRemark'],
  ['type ProductionAttachment', 'type ProjectRequestAttachment'],
  ['type ProductionRequestStatus', 'type ProjectRequestStatus'],
  ['ProductionRequest[]', 'ProjectRequest[]'],
  ['ProductionRequest)', 'ProjectRequest)'],
  ['ProductionRequest ', 'ProjectRequest '],
  ['ProductionRequest,', 'ProjectRequest,'],
  ['ProductionRequest>', 'ProjectRequest>'],
  ['ProductionUnit |', 'ProjectUnit |'],
  ['ProductionUnit>', 'ProjectUnit>'],
  ['ProductionUnit,', 'ProjectUnit,'],
  ['formatProductionUpdated', 'formatProjectRequestUpdated'],
  ['production requests', 'project requests'],
  ['production request', 'project request'],
  ['Production requests', 'Project requests'],
  ['Production request', 'Project request'],
  ['Track production', 'Track project'],
];

function walk(d, files = []) {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (/\.(tsx?|jsx?)$/.test(name)) files.push(p);
  }
  return files;
}

let count = 0;
for (const file of walk(dir)) {
  if (file.includes(`${path.sep}api${path.sep}production.ts`)) continue;
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  for (const [a, b] of fileReps) c = c.split(a).join(b);
  if (c !== orig) {
    fs.writeFileSync(file, c);
    count++;
    console.log('updated', path.relative(dir, file));
  }
}
console.log('done', count, 'files');
