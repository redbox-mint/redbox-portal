'use strict';
// Executed extracted production consumer methods with explicit supplied payloads.
// These checks supplement source comparison; they do not claim new HTTP parity.
const fs=require('node:fs'),assert=require('node:assert/strict');
const ts=require(process.cwd()+'/node_modules/typescript'),_=require(process.cwd()+'/node_modules/lodash');
const {of,firstValueFrom}=require(process.cwd()+'/node_modules/rxjs');
function extract(file,names,bindings={}){
 const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),methods=[];
 function visit(n){if(ts.isMethodDeclaration(n)&&names.includes(n.name.getText(tree)))methods.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);
 assert.equal(methods.length,names.length);
 const js=ts.transpileModule(`class Consumer {${methods.join('\n')}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(bindings),js+';return Consumer;')(...Object.values(bindings));
}
async function main(){
 const root='angular/projects/researchdatabox/',results=[];
 const graphFile=root+'portal-ng-common/src/lib/record.service.ts';
 class Params{set(){return this;}}
 const Graph=extract(graphFile,['getRelationshipGraph'],{HttpParams:Params,firstValueFrom,_get:_.get,_isUndefined:_.isUndefined,_isEmpty:_.isEmpty});
 const graph=new Graph();graph.getHttpOptions=()=>({});graph.brandingAndPortalUrl='https://portal.test/default/rdmp';
 const data={rootOid:'root',edges:[{id:'edge'}],relatedObjects:{related:[{oid:'second'}]},omittedByAccess:{related:1}};
 let expected;
 for(const body of [data,{data,meta:{}},{data,meta:{revision:'added',requestId:'added'}}]){
  graph.http={get:()=>of(body)};const actual=await graph.getRelationshipGraph('root');
  if(expected)assert.deepEqual(actual,expected);expected=actual;
  results.push({family:'graph-added-fields',file:graphFile,case:Object.hasOwn(body,'data')?'versioned data + ignored meta':'raw v1',pass:true});
 }
 const Named=extract(root+'named-query-editor/src/app/named-query-editor.component.ts',['openQuery','save','asErrorMessage','t']);
 const Report=extract(root+'report-config/src/app/report-config.component.ts',['saveReport','previewReport','getErrorMessage']);
 const Brand=extract(root+'branding/src/app/branding-admin.component.ts',['runMutation','handleMutationError','errorDetail']);
 for(const status of [0,400,403,404,409,413,500])for(const withItemStatus of [false,true]){
  const error=Object.assign(new Error(`HTTP ${status} safe failure`),{status,error:{message:'Safe server message',errors:[{detail:'Safe detail',...(withItemStatus?{status:String(status)}:{})}]}});
  const named=new Named();Object.assign(named,{api:new Proxy({},{get:()=>()=>Promise.reject(error)}),clearMessage(){},rememberEditModalTrigger(){},cloneQuery:x=>x,logger:{error(){}},translationService:{t:(_k,fallback,opts)=>fallback.replace('{{error}}',opts.error)},validate:()=>({valid:true}),isNew:true,draft:{name:'draft'},isEditModalOpen:true});
  await named.openQuery('missing');assert.match(named.error,/HTTP .*safe failure/);assert.equal(named.isEditModalOpen,true);
  named.isEditModalOpen=true;named.canSave=true;named.sanitizeQuery=x=>x;named.error='';await named.save();assert.match(named.error,/HTTP .*safe failure/);assert.equal(named.isEditModalOpen,true);
  results.push({family:'named-query-missing/error',status,withItemStatus,pass:true});
  for(const method of ['saveReport','previewReport']){
   const report=new Report();const draft={name:'draft'};Object.assign(report,{selectedReport:draft,isNewReport:true,reportConfigService:new Proxy({},{get:()=>()=>Promise.reject(error)}),loggerService:{error(){}}});
   await report[method]();assert.equal(report.selectedReport,draft);assert.equal(report[method==='saveReport'?'isSaving':'isPreviewing'],false);assert.equal(report.errorMessage,'Safe server message');
   results.push({family:'report-config-error-finalization',method,status,withItemStatus,pass:true});
  }
  const brand=new Brand();Object.assign(brand,{inFlight:new Set(),isUnavailable:()=>false,requestRender(){},logger:{error(){}},i18n:{t:(key,opts)=>`${key}:${opts?.detail??''}`}});
  await brand.runMutation('save','branding-failed',()=>Promise.reject(error));assert.equal(brand.inFlight.size,0);assert.match(brand.error,/Safe server message/);
  results.push({family:'branding-error-finalization',status,withItemStatus,pass:true});
 }
 fs.writeFileSync('support/specs/sails-retirement/evidence/final-review-r15/angular-p3-results.json',JSON.stringify({node:process.version,proof:'Executed extracted production methods; supplied success/error payloads. No route dispatch or deployed browser claimed. Params stub only allows graph option construction; RxJS is installed actual library.',results},null,2)+'\n');
 console.log(`${results.length} P3 consumer observations passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
