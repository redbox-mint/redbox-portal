'use strict';
const fs=require('node:fs');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const base='support/specs/sails-retirement/evidence/';
const here=base+'final-review-r15/';
const inventory=JSON.parse(fs.readFileSync(here+'angular-source.json','utf8'));
const native=JSON.parse(fs.readFileSync(base+'final-review-r13/http-acceptance.json','utf8')).rows;
const diffs=['records','identity','parent'].flatMap(name=>{
  const d=JSON.parse(fs.readFileSync(base+`final-review-r14/${name}-differential.json`,'utf8'));
  return (d.routes??d.rows).map(row=>({...row,ledger:`final-review-r14/${name}-differential.json`}));
});
// Explicit source-reviewed routing; repeated numbers are distinct shipped call sites.
const mappings=[
  [234],[235],[237],[240],[178],[241],[238],[239],[242],[243],[225],[232],[227],[229],[228],[230],[231],[233],
  [178],[179],[180],[181],[183],[174],[175],[225],[178],
  [208,210,211,212,214,215,216],[207],[222],[209],[213],[223],[224],
  [30],[31,32],[33,34],[56],[54,55],[57],[58],
  [63,64],[108,109],[302],[305],[307],[306],[304],[303],
  [75],[76],[77],[72],[73],[74],[90],[91],[92],[265],[59],[264],[330],
  [5],[108],[108],[252],[86],[87],[89],[88],[112],[106],[107],[3],[4],[7],[8],[9,10],[6],
  [135],[136],[138],[137,139],[108,110],[83],[84],[16],[60],[13],[17],[61],[62],[61],
  [260],[255],[169],[156],[155],[153],[154],[158],[157],[170],[171],[172],[151],[152],[173],
  [11],[12],[113],[3],[69],[96],[97],[98],[70],[72],[78],[189],[79],[80],[190],
];
assert.equal(mappings.length,inventory.calls.length);
const defaults={
  credentials:'Same-origin browser session cookie. No bearer header added by shipped Angular services.',
  headers:'DI CsrfInterceptor adds X-Source:jsclient and Content-Type:application/json;charset=utf-8; context token adds X-CSRF-Token. FormData omits explicit Content-Type so browser supplies multipart boundary.',
  csrf:'Mutation services call enableCsrfHeader after config initialization and pass their HttpContext. GET reads may omit token; GET remains nonmutating. Public config/CSRF bootstrap is unprotected. Actual browser origin/session/CSRF enforcement is server-owned.',
  status:'firstValueFrom(HttpClient Observable) resolves 2xx and rejects HttpErrorResponse for non-2xx/transport. The owning consumer methods below record catch/finally and visible state. JSON parse failures reject too.',
  version:'No version request means native v1. Dashboard-config editor, form-definition reads and record writes/preflight explicitly use X-ReDBox-Api-Version:2.0; dynamic modules set apiVersion=2.0.',
};
const family={
  FigshareVocabularyApiService:'unwrap(data or raw); unwrapList records/summary. Component reads source IDs, taxonomy IDs, revision/hash/proposals/diff/summary, crosswalk mappings and usage; delete ignores body including 204. Async mutation methods catch and finalize flags.',
  FigshareCrosswalkApiService:'unwrap/list records; approved crosswalk ID/name/status/localVocabularyId and local vocabulary ID/name/source populate configuration binding options. Failure rejects caller; no hidden status-dependent success.',
  VocabularyApiService:'unwrap data/raw; list normalizes records/summary or data/meta; get vocabulary+entries; create/update return detail; sync created/updated/skipped/lastSyncedAt. Admin component catches read and write failures and finalizes state.',
  BrandingAdminService:'Raw BrandingAdminState contains variables/draft/typeface/history/counters; previews contain cssUrl/expiresAt/revision; uploads return canonical state or image metadata. runMutation catches and clears its keyed pending state; 409 conflict/413 limit are recognized by status. v1 message used for detail.',
  DashboardConfigApiService:'Explicit v2 response.data; errors[0].detail/title/code plus body.meta/errors[0].meta and HTTP status feed DashboardConfigApiError. Targets/settings/fields/validation/copy preview and revision fields are consumed by editor. No errors[].status dependency.',
  FormService:'getFormConfig observes v2 HttpResponse: body.data, body.meta, body.prehydrate and ETag. Unselected getModelData reads data. Native form and metadata/default routes match these transports; form service propagates failures into owning form load.',
  TypeaheadDataService:'Unwrap raw or data array; label/value/historical/disabled/raw. Named queries also accept records or response.docs and configured label/value paths. External call goes to portal proxy (options.query), never directly to arbitrary provider. Components handle rejection and clear loading/search state.',
  VocabTreeService:'Unwrap raw/data tree children/path entries including label/value/children/hasChildren/disabled/historical; query-string pagination/selection fields remain scalar strings. Typeahead tree consumer catches/finalizes loading.',
  HarvestRunApiService:'Raw/data ListAPIResponse summary.numFound/page/start + records; getRun raw/data detail and events. Component catches request failures and clears loading; no redundant error item status consumed.',
  NamedQueryApiService:'Explicit unwrap response.data or raw for definition arrays/collections/definition; mutations ignore name payload or refresh. Editor catches/finalizes all mutations; missing404 follows catch and does not inspect errors[].status.',
  AppConfigService:'Raw form {schema,data,model,fields} accepted by Formly; save result is awaited, component sets successful/unsuccessful and finally clears formSaving. No dependency on legacy failure HTTP200.',
  ConfigService:'Bootstrap GET /csrfToken returns _csrf; then GET /dynamic/apiClientConfig returns public baseUrl/branding/portal/app/i18NextOpts/etc. Config cached and emitConfig completes dependent services. baseUrl is origin; rootContext is appended once by HttpClientService.',
  RecordService:'Read payloads retain raw browser envelopes or unwrap data at the selected method. Lists summary/items; metadata metaMetadata/metadata/relationships; audit/permissions/integration tab fields; graph rootOid/edges/relatedObjects/omittedByAccess. RecordActionResult reads v2 meta outcome/problems/completion/requestId/concurrency/metadata + ETag for write/preflight; typed error statuses and unknown outcomes retained. Lifecycle UI reads exact selected revision before dispatch.',
  ReportService:'Raw report definition and ReportResultDto.summary/records. getReportResult sends name/start/rows plus configured filters; Report component renders report/results and templates. Definition errors propagate to component init; no new class-A failure established for this unchanged read-only consumer.',
  TranslationService:'Raw entries[] key/value/description/category/contentFormat; languages[] code/displayName; bundle.data/enabled/displayName. Admin component catches edits/language toggles and clears saving flags. Bundle data is domain bundle.data, not version2 API data wrapper; native browser handlers retain raw shapes.',
  UserService:'Raw User/roles/users arrays and SaveResult {status,message}; links primary/linkedAccounts/impact; audit records/summary. Login result.success/url feeds browser redirect. Four account mutation consumers and role save now catch HTTP rejections. Existing disable/enable/link/audit/candidate consumers already catch; account linking finalizes isLinkSaving.',
  WorkspaceTypeService:'Raw or data status/workspaceTypes and workspaceType; filters entries requiring nonempty name. Form workspace selector loads list and uses configured type definitions. getWorkspaceType is public unselected helper.',
  SearchService:'Raw browser search result summary/results/facets/refiners/sort metadata used by record-search component. Invalid/unauthorized requests reject; search component catches and clears busy state. Trailing slash is accepted by Express.',
  ReportConfigService:'Raw/data ReportConfigDto[], DTO and preview columns/records/summary; named-query list name[]. Editor catches writes/previews/deletes and clears isSaving/isPreviewing; ignores success deletion payload. Safe failure detail may be generic HTTP message, but cannot strand pending state.',
  SiemAdminApiService:'Raw/data config; event/delivery rows+total normalized; test result success/status/message/request metadata. Admin component catches failures and finalizes pending flags; canonical secret mask is preserved by server.',
};
const sourceRef=file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
function validate(rows){
  assert.equal(rows.length,inventory.calls.length);
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  for(const r of rows){assert(r.server.length,`unmatched ${r.id}`);assert(r.responseConsumerConclusion);for(const route of r.server)assert(route.method==='all'||route.method.toUpperCase()===r.httpMethod,`${r.id} method mismatch`);}
}
const rows=inventory.calls.map((call,i)=>{
  const selected=mappings[i].map(n=>`HTTP-${String(n).padStart(3,'0')}`);
  const server=selected.map(id=>{
    const route=native.find(r=>r.id===id);assert(route,id);
    const differential=diffs.find(r=>r.id===id);assert(differential,id);
    const file=route.current.file;
    const source=fs.readFileSync(file,'utf8');
    const exported=route.current.export??differential.current?.handler;
    const index=exported?source.search(new RegExp('\\b(?:function|const|class)\\s+'+exported+'\\b')):0;
    const current={...route.current,line:index<0?1:source.slice(0,index).split('\n').length};
    const dimensions=Object.fromEntries(Object.entries(differential.dimensions??{}).map(([key,value])=>[key,typeof value==='object'&&value!==null?value.conclusion??value:value]));
    return {id,method:route.method,path:route.path,action:route.action??null,requestFields:route.fields,current,...sourceRef(file),r14:differential.ledger,r14Dimensions:dimensions};
  });
  const consumers=call.consumers.map(e=>({file:e.file,line:e.line,caller:e.caller,callee:e.callee,expression:e.source}));
  return {...call,sourceMethod:undefined,consumers,server,request:{url:call.urlExpression,arguments:call.arguments,constructionSource:{file:call.file,method:call.method,line:call.line},fullMethodIn:'angular-source.json calls[].sourceMethod',headerPolicy:'shared.headers/csrf/version',schemaScope:'requestFields on each server route; aliases without schema use the exact client method body + native handler source'},responseConsumerConclusion:family[call.class],statusHandling:'shared.status; owning method and transitive consumer source in angular-source.json',review:'Source reviewed against current native handler, shared responses/policies and consumer code. Selective executable probes are listed separately; source mapping is not per-route HTTP execution.'};
});
validate(rows);
const negativeControls=[];
for(const [name,mutate] of [
  ['omitted callsite',r=>r.pop()],
  ['wrong HTTP method',r=>{r[0].httpMethod='DELETE';}],
  ['unmapped native target',r=>{r[0].server=[];}],
]) {
  const copy=structuredClone(rows);mutate(copy);let rejected=false;
  try{validate(copy);}catch{rejected=true;}assert(rejected,name);negativeControls.push({name,rejected});
}
const r14Reassessment=[
  {id:'REC-P3-04',callIds:['ANG-071'],result:'Graph getRelationshipGraph unwraps data/raw then selects rootOid/edges/relatedObjects/omittedByAccess. Added meta/ETag never overrides these. No wrong graph result; retain P3.'},
  {id:'REC-P3-05',callIds:['ANG-055'],result:'Named-query missing response404 enters editor catch. asErrorMessage reads Error.message/error.message; never errors[].status. No P2 promotion.'},
  {id:'REC-P3-02',callIds:['ANG-113','ANG-114','ANG-115','ANG-116','ANG-117'],result:'Report config mutations and previews catch non2xx and finally clear isSaving/isPreviewing. No pending failure from the status/envelope delta. Error detail can be generic; P3 retained.'},
  {id:'P3-error-contract',callIds:['ANG-097','ANG-098','ANG-099','ANG-100','ANG-102'],result:'PROMOTED A/P2: HTTP500 rejects awaited Angular Promise; four ManageUsers methods and ManageRoles.saveCurrentUser left Saving/Generating/Revoking and no failure. Narrow local catches added. Browser regression + actual Express-to-consumer negative control.'},
  {id:'P3-error-contract-other',callIds:['ANG-001','ANG-018','ANG-028','ANG-030','ANG-031','ANG-033','ANG-034','ANG-044','ANG-047','ANG-066','ANG-103','ANG-104','ANG-105','ANG-106','ANG-107','ANG-108'],result:'Other identity/link/audit/toggle, branding, Figshare, typeahead and record attachment consumers either catch/finalize or public unselected helper propagates rejection. No additional P1/P2 shown; safe generic error wording retained as P3.'},
  {id:'REC-P3-01/03,P3-cache',result:'Cache directives do not change the payload fields consumed here. Unversioned immutable cache is existing B05. No demonstrated new Angular P1/P2.'},
  {id:'REC-P3-06,P3-chronicle,P3-index-message',result:'Additional audit, omitted custom markers and index message wording have no matching Angular control/data-field dependency. Not claimed byte-equivalent; no new consumer failure shown.'},
];
const result={schemaVersion:1,baseline:'a49366803',incoming:'bda01cb25',headAtGeneration:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),counts:{...inventory.counts,contracts:rows.length,distinctNativeRoutes:new Set(rows.flatMap(r=>r.server.map(s=>s.id))).size,unmatchedCalls:0,negativeControls:negativeControls.length},shared:defaults,sharedSources:['angular/projects/researchdatabox/portal-ng-common/src/lib/httpClient.service.ts','angular/projects/researchdatabox/portal-ng-common/src/lib/csrf.interceptor.ts','angular/projects/researchdatabox/portal-ng-common/src/lib/config.service.ts','angular/projects/researchdatabox/portal-ng-common/src/lib/portal-core-services.module.ts','packages/redbox-core/src/http/express/responses.ts','packages/redbox-core/src/http/express/csrf.ts'].map(sourceRef),rows,r14Reassessment,negativeControls,limitations:['Every callsite is enumerated, including public unselected helpers; this is finite built-in source review, not every possible institution configuration or external provider response.','Source consumer graph uses typed constructor/inject targets and literal same-class calls; inheritance and template activation must be read with the retained methods/templates.','Source schema and R14 dimensions are provenance, not new executed evidence. Current HTTP and browser regression observations are separately identified.','No full suite, Docker management, institution acceptance or deployed CSRF/provider/persistence qualification by this reviewer; parent owns final qualification.']};
fs.writeFileSync(here+'angular-contracts.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.counts));
