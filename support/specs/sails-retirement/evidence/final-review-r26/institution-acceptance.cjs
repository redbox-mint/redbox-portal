'use strict';
// Read-only institution data replay. No legacy hook lifecycle, controller or migration runs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const ts = require(root + '/node_modules/typescript');
require(root + '/node_modules/ts-node').register({transpileOnly:true,project:root+'/packages/redbox-core/test/tsconfig.json'});
const core = root+'/packages/redbox-core/src/';
const {loadPortalConfiguration, portalDefaults, portalSchema} = require(core+'configuration/portal');
const {convertLegacyDeployment} = require(core+'configuration/deployment');
const {resolveStartupConfiguration} = require(core+'configuration/resolution');
const defaults=portalDefaults().values;
const Ajv=require(root+'/packages/redbox-core/node_modules/ajv');
const domainValidate=new Ajv({strict:false,allErrors:true,validateFormats:false}).compile(require(core+'configuration/portal-domains.schema.json'));
const coreData={
  defineRedboxHook: x=>x,
  reusableFormDefinitions:defaults.reusableFormDefinitions,
  vocab:defaults.vocab,
  raid:require(core+'config/raid.config').raid,
  DEFAULT_ADMIN_SIDEBAR_CONFIG:require(core+'configmodels/AdminSidebarConfig').DEFAULT_ADMIN_SIDEBAR_CONFIG,
};
const syntheticEnv={NODE_ENV:'production',HOOK_S3_BUCKET:'review-fixture',HOOK_S3_REGION:'ap-southeast-2'};
const env={REDBOX_SESSION_SECRET:'disposable-r26-session-secret-at-least-32-characters'};
const executablePaths=['afterSanitizeAttributes','beforeSanitizeElements','afterSanitizeElements'].map(x=>'dompurify.hooks.'+x);
const rows=[], sources=[], bypassed=[];
const exportsInventory=[], comparisons=[], inheritedDirectiveControls=[];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function plain(x) {
  if(Array.isArray(x))return Array.from(x,plain);
  if(x && typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,plain(v)]));
  return x;
}
function reader(directory, selectedEnv) {
  const cache=new Map();
  function read(file) {
    if(cache.has(file))return cache.get(file).exports;
    const code=fs.readFileSync(file,'utf8');sources.push({file,sha256:hash(code)});
    if(file.endsWith('.json'))return JSON.parse(code);
    const module={exports:{}};cache.set(file,module);
    const localRequire=name=>{
      if(name==='@researchdatabox/redbox-core')return coreData;
      if(['path','node:path'].includes(name))return path;
      if(['lodash','moment'].includes(name))return require(root+'/node_modules/'+name);
      if(!name.startsWith('.'))throw Error('Unreviewed import '+name+' in '+file);
      const target=path.resolve(path.dirname(file),name);
      // These are never inspected/called by registerRedboxConfig. Do not import their side effects.
      if(file===directory+'/src/index.ts' && !target.startsWith(directory+'/src/config/')) {
        bypassed.push({file,import:name,reason:'non-configuration registration, never invoked'});return {};
      }
      assert(target.startsWith(directory+'/src/'), 'read stays inside institution source');
      const resolved=[target+'.ts',target+'.js',target+'.json',target+'/index.ts',target].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
      assert(resolved,'missing '+target);return read(resolved);
    };
    const output=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const context=vm.createContext({module,exports:module.exports,require:localRequire,__dirname:path.dirname(file),__filename:file,
      process:{env:selectedEnv},URL,URLSearchParams,structuredClone,console:{log(){},warn(){},error(){}}});
    new vm.Script(output,{filename:file}).runInContext(context,{timeout:10000});return module.exports;
  }
  return read;
}
function shape(x) {
  if(x===null)return 'null';if(Array.isArray(x))return 'array';return typeof x;
}
function leaves(x,parts=[],out=[]) {
  const s=shape(x);out.push({path:parts,shape:s,...(['object','array','undefined','function'].includes(s)?{}:{valueHash:hash(JSON.stringify(x))})});
  if(x && typeof x==='object')for(const [k,v]of Object.entries(x))leaves(v,[...parts,k],out);
  return out;
}
// Execute only the baseline's three pure merge functions, extracted from tracked Git.
const baseline='a49366803164429f9d8bdd249dadcdf856c9d13e';
const baselineText=execFileSync('git',['show',baseline+':packages/redbox-core/src/loader/index.ts'],{cwd:root,encoding:'utf8'});
const baselineAst=ts.createSourceFile('loader.ts',baselineText,ts.ScriptTarget.Latest,true);
const mergeNames=['normalizeAgendaJobsConfig','mergeAgendaQueueConfig','mergeRedboxConfig'];
const mergeText=baselineAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&mergeNames.includes(n.name.text)).map(n=>n.getText(baselineAst)).join('\n');
assert.equal(baselineAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&mergeNames.includes(n.name.text)).length,3);
const baselineModule={exports:{}};
vm.runInNewContext(ts.transpileModule(mergeText,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
  {module:baselineModule,exports:baselineModule.exports,require:name=>{assert.equal(name,'lodash');return require(root+'/node_modules/lodash');}});
const baselineMerge=baselineModule.exports.mergeRedboxConfig;
const operational=new Set(['datastores','redboxSession','auth','brandingConfigurationDefaults','storage','environment','agendaQueue','port','host','appUrl','session','http']);
const documented={
  routes:'configuration-v6.md#baseline-input-dispositions: owned HTTP routes replace discovered route data',
  cors:'configuration-v6.md#baseline-input-dispositions: owned HTTP integration replaces Sails CORS',
  raid:'configuration-v6.md#baseline-input-dispositions: move RAiD defaults to brandingConfigurationDefaults.raidPublishing',
  servicenowCatalog:'configuration-v6.md#deployment-example-and-conversion: extension-owned namespace requires an explicitly owned schema/selected factory',
  uonRdmpReminder:'configuration-v6.md#deployment-example-and-conversion: extension-owned namespace requires an explicitly owned schema/selected factory',
};
async function load(config) {return loadPortalConfiguration({env,extensions:{providers:[{name:'institution-replay',declaration:{apiVersion:1,config}}]}});}
async function section(institution,key,value,variant) {
  const input={[key]:plain(value)};
  let converted, conversion;
  try {converted=convertLegacyDeployment(input,institution).values;conversion='operational converter';}
  catch(e) {
    assert(!operational.has(key),'operational conversion unexpectedly failed '+key+': '+e.message);
    conversion='documented manual typed domain contribution';converted=input;
  }
  const row={institution,variant,key,conversion,inputs:leaves(input)};
  try {
    const result=await load(converted);row.result='accepted';row.changed=[];
    const get=(o,p)=>p.reduce((a,k)=>a?.[k],o);
    let compared=converted;
    if(Array.isArray(converted.agendaQueue?.jobs))compared={...converted,agendaQueue:{...converted.agendaQueue,jobs:Object.fromEntries(converted.agendaQueue.jobs.map(({name,...job})=>[name,job]))}};
    for(const leaf of leaves(compared).filter(x=>!['object','array','undefined'].includes(x.shape))) {
      const before=get(compared,leaf.path),after=get(result,leaf.path);
      if(!Object.is(before,after))row.changed.push({path:leaf.path,before:leaf.shape,after:shape(after)});
    }
    assert.equal(row.changed.length,0,'accepted data silently changes '+institution+'.'+key);
    if(defaults[key] && typeof defaults[key]==='object' && !Array.isArray(defaults[key])) {
      const old=plain(baselineMerge(key,plain(defaults[key]),plain(value)));
      if(key==='redboxSession')old.secret=env.REDBOX_SESSION_SECRET;
      const current=result[key];
      const compare=(a,b,p=[])=>{
        if(Array.isArray(a)||Array.isArray(b)) {
          if(JSON.stringify(a)!==JSON.stringify(b))comparisons.push({institution,variant,path:[key,...p],kind:'documented array replacement',guidance:'configuration-v6.md: ordinary arrays replace; branding arrays already replaced in v5'});
          return;
        }
        if(a&&b&&typeof a==='object'&&typeof b==='object') {
          for(const k of new Set([...Object.keys(a),...Object.keys(b)]))compare(a[k],b[k],[...p,k]);
        } else if(a!==b)comparisons.push({institution,variant,path:[key,...p],kind:'requires review',before:shape(a),after:shape(b)});
      };
      compare(old,current);
      if(value && typeof value==='object' && Array.isArray(value._dontMerge)) {
        for(const target of value._dontMerge) {
          const retained=object=>Object.keys(object?.[target]||{}).filter(k=>!Object.hasOwn(value[target]||{},k)).sort();
          const before=retained(old),after=retained(current);
          assert.deepEqual(after,before,'inherited directive changes behavior');
          assert.deepEqual(old._dontMerge,current._dontMerge,'v5 and v6 both retain the inert marker');
          inheritedDirectiveControls.push({institution,variant,key,target,baselineMarkerPresent:true,currentMarkerPresent:true,retainedCoreKeys:before});
        }
      }
    }
  } catch(e) {
    if(e.name!=='ConfigurationError')throw e;
    row.result='rejected';row.path=e.path;row.reason=e.message;
    row.disposition=documented[key]?'correct documented conversion':'requires review';
    row.guidance=documented[key];
    if(['dashboardtype._dontMerge','workflow._dontMerge'].includes(e.path)) {
      row.disposition='correct documented conversion';row.guidance='configuration-v6.md: _dontMerge/_delete are retired loader directives; use explicit selected definitions and awaited bootstrap operations';
      const {_dontMerge,_delete,...definitions}=plain(value);
      const accepted=await load({[key]:definitions});
      for(const name of Object.keys(definitions))assert(accepted[key][name]);
      row.manualConversion='real loader accepts every supplied definition after inert v5 registration metadata is removed; no default definition is claimed deleted/replaced';
    }
    if(institution==='uanz' && key==='dashboardtype') {
      row.disposition='correct documented conversion';row.guidance='configuration-v6.md#baseline-input-dispositions: no scalar/container coercion; filterBy={} and recordTypeFilterBy="storage-new" preserve the empty-filter/single-type meaning';
      const changed=plain(value),rules=changed.workspace.formatRules;
      assert.equal(rules.filterBy.length,0);assert.equal(rules.recordTypeFilterBy.length,1);
      rules.filterBy={};rules.recordTypeFilterBy=String(rules.recordTypeFilterBy);
      const accepted=await load({dashboardtype:changed});
      assert.deepEqual(accepted.dashboardtype.workspace.formatRules,rules);
      row.manualConversion='real loader accepts explicit empty-object/single-string conversion; all other configured rules retained';
    }
    if(['servicenowCatalog','uonRdmpReminder'].includes(key)) {
      const accepted=await load({custom:{[key]:plain(value)}});
      // Undefined contributes no override under the documented startup contract.
      assert.deepEqual(accepted.custom[key],JSON.parse(JSON.stringify(plain(value))));
      row.manualConversion='real loader retains every field under custom.'+key+' for an explicitly bound institution factory';
    }
    // Gather every structural/domain validation fault, so a first failure cannot hide later keys.
    const merge=require(root+'/node_modules/lodash/mergeWith');
    const merged=merge({},defaults,converted,(_a,b)=>Array.isArray(b)?b:undefined);
    if(Array.isArray(merged.agendaQueue?.jobs))merged.agendaQueue.jobs=Object.fromEntries(merged.agendaQueue.jobs.map(({name,...job})=>[name,job]));
    const z=portalSchema.safeParse(merged);
    row.structural=z.success?[]:z.error.issues.map(({path,code,keys})=>({path,code,keys}));
    if(z.success) {
      domainValidate(z.data);row.domain=domainValidate.errors;
    }
  }
  rows.push(row);
}
(async()=>{
  await load({});
  for(const [key,value]of Object.entries(defaults))await section('bundled-defaults',key,value,'default');
  for(const institution of ['cqu','jcu','scu','uanz','uc','uon','uwa']) {
    const directory='/home/andrew/src/bitbucket/redbox-hook-'+institution;
    for(const variant of ['role-credentials','explicit-credentials','docker','production-crosswalk']) {
      const selectedEnv={...syntheticEnv,...(variant==='explicit-credentials'?{HOOK_S3_ACCESS_KEY:'fixture-key',HOOK_S3_SECRET_KEY:'fixture-secret'}:{}),...(variant==='docker'?{NODE_ENV:'docker'}:{}),...(variant==='production-crosswalk'?{FIGSHARE_ENV:'PROD'}:{})};
      const read=reader(directory,selectedEnv),hook=read(directory+'/src/index.ts');
      const config=plain(hook.registerRedboxConfig());
      for(const [key,value]of Object.entries(config))await section(institution,key,value,variant);
      // Include dormant exported configuration fragments in the source inventory.
      for(const file of fs.readdirSync(directory+'/src/config').filter(x=>/\.(ts|json)$/.test(x))) {
        const exported=read(directory+'/src/config/'+file);
        if(variant==='role-credentials')exportsInventory.push({institution,file,exported:leaves(exported)});
      }
    }
  }
  const wsu='/home/andrew/src/bitbucket/redbox-hook-wsu-v6';
  Object.assign(process.env,syntheticEnv);
  const config=require(wsu+'/dist').registerRedboxExtension().config;
  for(const [key,value]of Object.entries(config))await section('wsu-v6',key,value,'converted');
  const output=process.argv[2]||path.join(root,'.tmp/sails-retirement/final-review-r26/acceptance-initial-results.json');
  fs.writeFileSync(output,JSON.stringify({baseline,baselineMergeSha256:hash(mergeText),rows,comparisons,inheritedDirectiveControls,exportsInventory,sources:[...new Map(sources.map(x=>[x.file,x])).values()],bypassed},null,2)+'\n');
  console.log(JSON.stringify({sections:rows.length,accepted:rows.filter(x=>x.result==='accepted').length,
    rejected:rows.filter(x=>x.result==='rejected').map(({institution,variant,key,path,structural,domain})=>({institution,variant,key,path,structural,domain})),sources:new Set(sources.map(x=>x.file)).size},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
