import fs from 'fs';
const p = new URL('../src/api/production.ts', import.meta.url);
const out = new URL('../src/api/project.ts', import.meta.url);
let c = fs.readFileSync(p, 'utf8');
const reps = [
  ['production API', 'project request API'],
  ['productionApiBase', 'projectRequestApiBase'],
  ['productionUrl', 'projectRequestUrl'],
  ["base.endsWith('/production')", "base.endsWith('/project-request')"],
  ['`${base}/production`', '`${base}/project-request`'],
  ['prodFetch', 'prjFetch'],
  ['prodPostFirst', 'prjPostFirst'],
  ['ProductionUnit', 'ProjectUnit'],
  ['ProductionRequestStatus', 'ProjectRequestStatus'],
  ['ProductionRequest', 'ProjectRequest'],
  ['ProductionRemark', 'ProjectRequestRemark'],
  ['ProductionAttachment', 'ProjectRequestAttachment'],
  ['getProductionUnits', 'getProjectUnits'],
  ['createProductionUnit', 'createProjectUnit'],
  ['updateProductionUnit', 'updateProjectUnit'],
  ['getMyProductionUnits', 'getMyProjectUnits'],
  ['getProductionDashboard', 'getProjectRequestDashboard'],
  ['listProductionRequests', 'listProjectRequests'],
  ['createProductionRequest', 'createProjectRequest'],
  ['getProductionRequest', 'getProjectRequest'],
  ['addProductionRemark', 'addProjectRequestRemark'],
  ['uploadProductionAttachment', 'uploadProjectRequestAttachment'],
  ['tsAcceptProductionRequest', 'tsAcceptProjectRequest'],
  ['tsRejectProductionRequest', 'tsRejectProjectRequest'],
  ['ipUpdateProductionRequest', 'ipUpdateProjectRequest'],
  ['ipForwardProductionRequest', 'ipForwardProjectRequest'],
  ['nocApproveProductionRequest', 'nocApproveProjectRequest'],
  ['nocCompleteProductionRequest', 'nocCompleteProjectRequest'],
  ['projectCompleteProductionRequest', 'projectCompleteProjectRequest'],
  ['productionFileUrl', 'projectRequestFileUrl'],
  ['/uploads/production/', '/uploads/project-request/'],
  ['latest production routes', 'latest project request routes'],
  ['/** Base path for production API', '/** Base path for project request API'],
];
for (const [a, b] of reps) c = c.split(a).join(b);
fs.writeFileSync(out, c);
console.log('ok', out.pathname);
