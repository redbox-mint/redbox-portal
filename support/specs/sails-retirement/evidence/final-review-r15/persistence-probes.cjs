'use strict';
// Focused real-Mongo proof. It never starts/stops Docker and touches only the
// two named R15 persistence databases. Historical methods run against explicit
// current repository ports whose unchanged source is recorded in the inventory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = process.cwd();
const coreRoot = path.join(root, 'packages/redbox-core');
require('ts-node').register({transpileOnly:true, project:path.join(coreRoot,'test/tsconfig.json')});
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  if (name === '@researchdatabox/redbox-core/extensions/storage') return path.join(coreRoot,'src/extensions/storage.ts');
  return originalResolve.call(this,name,parent,...args);
};
const ts = require('typescript');
const _ = require('lodash');
const { MongoClient, ObjectId, BSON, GridFSBucket } = require('mongodb');
const { Readable } = require('node:stream');
const { of, firstValueFrom } = require('rxjs');
const { method: baselineMethod, baseline } = require('../final-review-r14/baseline-method.cjs');
const runtime = require(path.join(coreRoot,'src/persistence/runtime.ts'));
const exportedStorage = require(path.join(coreRoot,'src/extensions/storage.ts'));
const storageFile = 'packages/sails-hook-redbox-storage-mongo/src/persistence/StorageProtocol.ts';
const sourceHash = value => crypto.createHash('sha256').update(value).digest('hex');
const observed = [];
const log = new Proxy({}, {get:()=>()=>{}});
const url = process.env.R15_PERSISTENCE_MONGO_URL || 'mongodb://127.0.0.1:29511/sr_r15_persistence';
assert.equal(new URL(url).pathname,'/sr_r15_persistence');
const storageUrl = url.replace('/sr_r15_persistence','/sr_r15_persistence_storage');
const native = new MongoClient(url,{serverSelectionTimeoutMS:5000});
const owner = {config:{datastores:{mongodb:{url},redboxStorage:{url:storageUrl}}},log};
const schemas = docs => BSON.EJSON.serialize(docs,{relaxed:false});
function note(id, result) { observed.push({id,...result}); console.log('PASS '+id); }
function baselineModule(file, overrides = {}) {
  const text = cp.execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'});
  const mod = new Module(path.join(root,file)+'.r15-baseline',module);
  mod.filename = path.join(root,file);
  mod.paths = Module._nodeModulePaths(path.dirname(mod.filename));
  const nativeRequire = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(overrides,name) ? overrides[name] : nativeRequire(name);
  mod._compile(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,mod.filename);
  return {exports:mod.exports,file,sourceSha256:sourceHash(text)};
}
const fixtureRecord = oid => ({redboxOid:oid,revision:0,metadata:{title:'Legacy record',nested:{number:7,flag:false,list:['x',null]},legacyExtension:{preserve:true}},
  metaMetadata:{brandId:'brand-1',type:'rdmp',form:'default',createdBy:'alice',lastSaveDate:'2026-08-01T00:00:00.000Z'},
  workflow:{stage:'draft',stageLabel:'Draft'},authorization:{view:['alice'],edit:['alice'],viewRoles:[],editRoles:[]},
  dateCreated:'2026-08-01T00:00:00.000Z'});
async function storage(prisma, historical) {
  const current = require(path.join(root,storageFile));
  class Base {constructor(){this.logHeader='MongoStorageService::';} updateChronicle(){} }
  const loaded = historical ? baselineModule(storageFile,{'@researchdatabox/redbox-core':{...exportedStorage,Services:{Core:{Service:Base}}}}) : null;
  const Ctor = historical ? loaded.exports.PrismaStorage : current.PrismaStorage;
  const collaborators = {log,recordTypes:{get:()=>of({name:'rdmp',searchable:false})},forms:{getFormByName:()=>of(null)},
    disks:{stagingDisk(){throw Error('not used');},disk(){throw Error('not used');}},translate:v=>v,exportMaxRecords:()=>100};
  const service = historical ? new Ctor(owner) : new Ctor(owner,collaborators);
  const {prismaRecordDocuments} = require(path.join(root,'packages/sails-hook-redbox-storage-mongo/src/persistence/PrismaRecordDocuments.ts'));
  service.client=prisma;
  service.recordCol=prismaRecordDocuments(prisma,'record');
  service.deletedRecordCol=prismaRecordDocuments(prisma,'deletedrecord');
  service.recordIdentityCol=prismaRecordDocuments(prisma,'recordidentity');
  service._requiredIndicesReady=true;
  for (const name of ['createTombstone','updateTombstone','removeTombstone','createActiveRecordFromTombstone']) {
    const implementation=service[name];
    service[name]=async function(...args){const value=await implementation.apply(this,args);if(value.applicationState!=='applied') console.log(name,JSON.stringify(value));return value;};
  }
  return {service,source:loaded ? {file:loaded.file,sha256:loaded.sourceSha256} : {file:storageFile,sha256:sourceHash(fs.readFileSync(storageFile))}};
}
async function lifecycle(prisma,historical) {
  const {service,source}=await storage(prisma,historical);
  const {Services:{Records}}=require(path.join(coreRoot,'src/records/Records.ts'));
  const brand={id:'brand-1',name:'default',roles:[]};
  const type={name:'rdmp',searchable:false,hooks:{},concurrentModification:{mode:'last-write-wins'}};
  const input={config:{record:{auditing:{enabled:false}},jsonld:{}},log,storageService:service,datastreamService:{},
    searchService:{remove(){},index:async()=>true},queueService:{},repository:{},branding:{getBrandById:()=>brand,getBrand:()=>brand,getDefault:()=>brand},
    recordTypes:{get:()=>of(type)},workflows:{},forms:{},roles:{getRole:()=>undefined},translation:{t:v=>v},resolveHook:()=>undefined};
  const records=new Records(input);
  if(historical) {
    const globals={_,...require('@researchdatabox/sails-ng-common'),...require(path.join(coreRoot,'src/RecordSaveResponse.ts')),
      ...require(path.join(coreRoot,'src/RecordStorageConcurrency.ts')),
      ...require(path.join(coreRoot,'src/model/storage/RecordAuditModel.ts')),
      ...require(path.join(coreRoot,'src/StorageServiceResponse.ts')),
      sails:{config:input.config,log},BrandingService:input.branding,RecordTypesService:input.recordTypes,firstValueFrom};
    for(const name of ['delete','restoreRecord','lifecycleAuthority']) records[name]=baselineMethod('packages/redbox-core/src/services/RecordsService.ts',name,globals);
  }
  const db=native.db('sr_r15_persistence_storage');
  const oid=historical?'baseline-soft-delete':'current-soft-delete';
  const legacy=fixtureRecord(oid);
  // A pre-existing record has neither incarnationId nor id. No bootstrap rewrite.
  await db.collection('record').insertOne(structuredClone(legacy));
  const before=await db.collection('record').findOne({redboxOid:oid});
  const result=await records.delete(oid,false,legacy,type,{id:'actor-1',username:'alice'});
  assert.ok(result.isSuccessful(),JSON.stringify(result));
  assert.equal(await db.collection('record').findOne({redboxOid:oid}),null);
  const tombstone=await db.collection('deletedrecord').findOne({redboxOid:oid});
  assert.equal(tombstone.lifecycleState,'deleted');
  assert.equal(tombstone.revision,2);
  assert.deepEqual(tombstone.deletedRecordMetadata.metadata,legacy.metadata);
  assert.deepEqual(tombstone.deletedRecordMetadata.metadata.legacyExtension,legacy.metadata.legacyExtension);
  const restored=await records.restoreRecord(oid,{id:'actor-1',username:'alice'},brand);
  assert.ok(restored.isSuccessful(),JSON.stringify(restored));
  const active=await db.collection('record').findOne({redboxOid:oid});
  assert.equal(active.revision,4);
  assert.deepEqual(active.metadata,legacy.metadata);
  assert.deepEqual(active.workflow,legacy.workflow);
  assert.deepEqual(active.authorization,legacy.authorization);
  assert.deepEqual(active.metadata.legacyExtension,legacy.metadata.legacyExtension);
  assert.equal(active.dateCreated,legacy.dateCreated);
  assert.equal(await db.collection('deletedrecord').findOne({redboxOid:oid}),null);
  note((historical?'baseline':'current')+'-legacy-soft-delete-restore',{mode:'actual-domain-methods-and-real-Mongo',source,
    before:schemas(before),deleted:schemas(tombstone),restored:schemas(active),result:{delete:schemas(result),restore:schemas(restored)}});
  // Legacy deleted rows predate revision/lifecycle/incarnation wrapper fields.
  // The normal cutover backfill must make them restorable without rewriting
  // their embedded data or adopting a different brand.
  const deletedOid=(historical?'baseline':'current')+'-legacy-deleted';
  const oldSnapshot=fixtureRecord(deletedOid);delete oldSnapshot.revision;
  await db.collection('deletedrecord').insertOne({redboxOid:deletedOid,deletedRecordMetadata:oldSnapshot,dateDeleted:'2026-08-02T00:00:00.000Z'});
  const oldDeleted=await db.collection('deletedrecord').findOne({redboxOid:deletedOid});
  assert.equal((await service.getTombstone(brand,deletedOid)).deletedRecordMetadata.metadata.title,'Legacy record');
  assert.equal(await service.getTombstone({id:'foreign-brand'},deletedOid),null);
  assert.deepEqual(await db.collection('deletedrecord').findOne({redboxOid:deletedOid}),oldDeleted);
  const maintenanceFile='persistence/storage/PrismaRecordRevisionMaintenance.ts';
  const batches=adapter(maintenanceFile,'prismaRecordRevisionBatches',prisma,historical);
  const migration=await batches('tombstone',25);
  assert.equal(migration.updated,1);
  const backfilled=await db.collection('deletedrecord').findOne({redboxOid:deletedOid});
  assert.equal(backfilled.revision,0);assert.equal(backfilled.lifecycleState,'deleted');
  assert.deepEqual(backfilled.deletedRecordMetadata,oldDeleted.deletedRecordMetadata);
  const restoredLegacy=await records.restoreRecord(deletedOid,{id:'actor-1',username:'alice'},brand);
  assert.ok(restoredLegacy.isSuccessful(),JSON.stringify(restoredLegacy));
  const restoredDeleted=await db.collection('record').findOne({redboxOid:deletedOid});
  assert.equal(restoredDeleted.revision,2);assert.deepEqual(restoredDeleted.metadata,oldSnapshot.metadata);
  assert.deepEqual(restoredDeleted.workflow,oldSnapshot.workflow);assert.deepEqual(restoredDeleted.authorization,oldSnapshot.authorization);
  assert.equal(await db.collection('deletedrecord').findOne({redboxOid:deletedOid}),null);
  note((historical?'baseline':'current')+'-legacy-deleted-backfill-restore',{mode:'actual-methods-and-real-Mongo',before:schemas(oldDeleted),backfilled:schemas(backfilled),restored:schemas(restoredDeleted),migration});
  await records.close();
}
function adapter(file,name,prisma,historical,...args){
  const loaded=historical ? baselineModule('packages/redbox-core/src/'+file) : null;
  const exports=loaded?.exports ?? require(path.join(coreRoot,'src',file));
  return exports[name](prisma,...args);
}
function normalized(value,key=''){
  if(value instanceof ObjectId)return '<ObjectId>';
  if(value instanceof Date)return '<BSON-Date>';
  if(Array.isArray(value))return value.map(v=>normalized(v));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalized(v,k)]));
  if(typeof value==='string' && /^(?:createdAt|updatedAt|lastAccessedAt|accessedAt|dateCreated|dateUpdated)$/.test(key) && Number.isFinite(Date.parse(value)))return '<ISO-string>';
  if(typeof value==='string' && key==='password' && /^\$2[aby]\$\d\d\$/.test(value))return '<bcrypt-hash>';
  if(typeof value==='string' && /^(?:id|role_users|user_roles|recordType|vocabulary)$/.test(key) && /^[a-f0-9]{24}$/.test(value))return '<ObjectId-text>';
  return value;
}
async function repositoryCases(prisma,historical){
  const label=historical?'baseline':'current';
  const db=native.db('sr_r15_persistence');
  const brandId='111111111111111111111111';
  const fixed='2026-08-01T00:00:00.000Z';
  const read=async collection=>db.collection(collection).find({}).sort({_id:1}).toArray();
  const reset=async names=>{for(const name of names) await db.collection(name).deleteMany({});};
  const identity=adapter('persistence/identity/PrismaIdentityRepositories.ts','prismaIdentityRepositories',prisma,historical,async()=>{},async()=>({id:brandId}));
  await reset(['user','role','role_users__user_roles','useraudit']);
  const role=await identity.create('role',{name:'Researcher',branding:brandId});
  const user=await identity.create('user',{username:'alice',name:'Alice',email:'alice@example.invalid',type:'local',password:'fixture-only-password',roles:[role.id]});
  const rawUser=await db.collection('user').findOne({_id:new ObjectId(user.id)});
  assert(rawUser._id instanceof ObjectId);assert.equal(rawUser.accountLinkState,'active');assert.equal(rawUser.loginDisabled,false);
  assert.equal(typeof rawUser.createdAt,'string');assert.equal(user.password,undefined);assert.equal(user.token,undefined);
  assert.equal(await identity.verifyPassword(user.id,'fixture-only-password'),true);
  assert.equal((await identity.one('user',{id:user.id},{populate:['roles']})).roles.length,1);
  const legacyId=new ObjectId('222222222222222222222222');
  await db.collection('user').insertOne({_id:legacyId,username:'legacy',name:'Legacy',email:'legacy@example.invalid',type:'oidc',createdAt:fixed,updatedAt:fixed,additionalAttributes:{custom:[false,0,null]}});
  const legacyBefore=await db.collection('user').findOne({_id:legacyId});
  const legacyRead=await identity.one('user',{id:legacyId.toHexString()});
  assert.equal(legacyRead.accountLinkState,null);
  assert.deepEqual(await db.collection('user').findOne({_id:legacyId}),legacyBefore);
  await identity.update('user',{id:legacyId.toHexString()},{name:'Renamed'});
  const legacyAfter=await db.collection('user').findOne({_id:legacyId});
  assert.equal(legacyAfter.createdAt,fixed);assert.equal(Object.hasOwn(legacyAfter,'loginDisabled'),false);
  assert.deepEqual(legacyAfter.additionalAttributes,legacyBefore.additionalAttributes);
  await identity.create('useraudit',{user:{id:user.id,username:'alice',password:'secret-to-remove',token:'secret-to-remove'},action:'profile-updated',additionalContext:{brandId,notes:'Fixture'}});
  const identityDocuments={user:await read('user'),role:await read('role'),memberships:await read('role_users__user_roles'),audit:await read('useraudit')};
  assert(!JSON.stringify(identityDocuments.audit).includes('secret-to-remove'));
  note(label+'-identity-legacy-patch-membership-audit',{raw:schemas(identityDocuments),legacyBefore:schemas(legacyBefore),legacyRead:schemas(legacyRead),legacyAfter:schemas(legacyAfter)});

  await reset(['appconfig','dashboardconfiguration','i18nbundle','i18ntranslation']);
  const configuration=adapter('persistence/configuration/PrismaConfigurationRepositories.ts','prismaConfigurationRepositories',prisma,historical);
  await db.collection('appconfig').insertOne({_id:new ObjectId('333333333333333333333333'),branding:new ObjectId(brandId),configKey:'system',configData:{message:'Old',nested:{values:[false,0,null]}},createdAt:fixed,legacyPhysicalField:'retain'});
  const legacyConfig=await configuration.appConfigs.findForBrandAndKey(brandId,'system');
  assert.equal(legacyConfig.branding,brandId);assert.deepEqual(legacyConfig.configData.nested.values,[false,0,null]);
  await configuration.appConfigs.replaceForBrandAndKey(brandId,'system',{message:'New',nested:{values:[false,0,null]}});
  const configRaw=await db.collection('appconfig').findOne({configKey:'system'});
  assert.equal(configRaw.createdAt,fixed);assert.equal(configRaw.legacyPhysicalField,'retain');assert(configRaw.branding instanceof ObjectId);
  await configuration.appConfigs.createConfiguration({branding:brandId,configKey:'new',configData:{enabled:false,limit:0,list:[]}});
  const aggregate=await configuration.dashboards.createAggregate({branding:brandId,revision:1,configData:{dashboardViews:{}}});
  assert.equal(await configuration.dashboards.compareAndSwap(brandId,1,{revision:2,configData:{dashboardViews:{published:true}},updatedAt:fixed}),true);
  assert.equal(await configuration.dashboards.compareAndSwap(brandId,1,{revision:3,configData:{},updatedAt:fixed}),false);
  assert.equal(aggregate.revision,1);
  note(label+'-configuration-legacy-json-cas',{raw:schemas({appconfig:await read('appconfig'),dashboard:await read('dashboardconfiguration')}),legacyRead:schemas(legacyConfig)});

  await reset(['vocabulary','vocabularyentry']);
  const vocabulary=adapter('persistence/vocabulary/PrismaVocabularyRepositories.ts','prismaVocabularyRepositories',prisma,historical,async()=>({id:brandId}));
  const vocab=await vocabulary.createVocabulary({name:'Test vocabulary',slug:'test-vocabulary',branding:brandId});
  const entry=await vocabulary.createEntry({vocabulary:vocab.id,label:'Mixed Case',value:'ABC',identifier:'abc'});
  assert.equal(entry.labelLower,'mixed case');assert.equal(entry.valueLower,'abc');assert.equal(entry.historical,false);
  const legacyEntryId=new ObjectId('444444444444444444444444');
  await db.collection('vocabularyentry').insertOne({_id:legacyEntryId,vocabulary:new ObjectId(vocab.id),label:'Legacy Label',value:'OldValue',labelLower:'legacy label',valueLower:'oldvalue',createdAt:fixed});
  const legacyEntry=await vocabulary.getEntry({id:legacyEntryId.toHexString()});
  assert.equal(legacyEntry.vocabulary,vocab.id);
  await vocabulary.reviseEntry(legacyEntryId.toHexString(),{label:'Renamed Label'});
  const entryRaw=await db.collection('vocabularyentry').findOne({_id:legacyEntryId});
  assert.equal(entryRaw.createdAt,fixed);assert.equal(entryRaw.value,'OldValue');assert.equal(entryRaw.valueLower,'oldvalue');assert.equal(entryRaw.labelLower,'renamed label');
  note(label+'-vocabulary-legacy-normalization',{raw:schemas({vocabulary:await read('vocabulary'),entries:await read('vocabularyentry')}),legacyRead:schemas(legacyEntry)});

  await reset(['recordtype','workflowstep','form']);
  const references=adapter('persistence/reference/PrismaReferenceRepositories.ts','prismaReferenceRepositories',prisma,historical);
  const recordType=await references.recordTypes.createDefinition({name:'rdmp',branding:brandId,key:'default:rdmp'});
  const form=await references.forms.createDefinition({name:'record-form',branding:brandId,configuration:[{class:'TextField',definition:{name:'title'}}]});
  const workflow=await references.workflows.createDefinition({name:'draft',recordType:recordType.id,starting:true,hidden:false,config:{workflow:{stage:'draft'},form:'record-form',authorization:{editRoles:['Researcher'],viewRoles:['Researcher']}}});
  await references.workflows.attachForm(workflow.id,form.id);
  const readWorkflow=await references.workflows.findByName(recordType.id,'draft');
  assert.equal(readWorkflow.starting,true);assert.equal(readWorkflow.hidden,false);assert.equal(readWorkflow.form,form.id);
  const rawWorkflow=(await read('workflowstep'))[0];assert(rawWorkflow.recordType instanceof ObjectId);assert(rawWorkflow.form instanceof ObjectId);
  note(label+'-recordtype-form-workflow-definition',{raw:schemas({recordType:await read('recordtype'),form:await read('form'),workflow:await read('workflowstep')}),read:schemas(readWorkflow)});

  await reset(['attachmentmetadata','attachmentaccessaudit']);
  const audit={log,emitAccessEvent:async()=>{},retainFollowup:async work=>work};
  class Base {constructor(){this.logger=log;} }
  const Attachments=historical
    ? baselineModule('packages/redbox-core/src/persistence/storage/PrismaAttachmentRepository.ts',{'../../CoreService':{Services:{Core:{Service:Base}}}}).exports.Services.PrismaAttachmentRepository
    : require(path.join(coreRoot,'src/persistence/storage/PrismaAttachments.ts')).Services.PrismaAttachmentRepository;
  const attachments=new Attachments(prisma,audit);
  const legacyAttachmentId=new ObjectId('555555555555555555555555');
  await db.collection('attachmentmetadata').insertOne({_id:legacyAttachmentId,oid:'attachment-record',fileId:'file-a',storageKey:'attachment-record/file-a',filename:'legacy.txt',contentLength:3,uploadedBy:'alice',createdAt:fixed,accessCount:2,legacyPhysicalField:'retained'});
  const legacyAttachment=await attachments.findOneByStorageKey('attachment-record/file-a');
  assert.equal(legacyAttachment.filename,'legacy.txt');
  await attachments.upsert({oid:'attachment-record',fileId:'file-a',storageKey:'attachment-record/file-a',contentType:'text/plain'});
  await attachments.recordAccess({oid:'attachment-record',fileId:'file-a',storageKey:'attachment-record/file-a',action:'download',accessedBy:'alice'});
  const attachmentRaw=await db.collection('attachmentmetadata').findOne({_id:legacyAttachmentId});
  assert.equal(attachmentRaw.filename,'legacy.txt');assert.equal(attachmentRaw.accessCount,3);assert.equal(attachmentRaw.createdAt,fixed);assert.equal(attachmentRaw.legacyPhysicalField,'retained');
  await attachments.upsert({oid:'attachment-record',fileId:'file-b',storageKey:'attachment-record/file-b',filename:'new.txt',contentLength:0});
  const newAttachment=await db.collection('attachmentmetadata').findOne({fileId:'file-b'});
  assert.equal(newAttachment.isJournal,false);assert.equal(newAttachment.accessCount,0);assert.equal(newAttachment.contentLength,0);
  note(label+'-attachment-legacy-patch-access-audit',{raw:schemas({attachments:await read('attachmentmetadata'),audit:await read('attachmentaccessaudit')}),legacyRead:schemas(legacyAttachment)});
}
async function storageDocumentCases(prisma,historical){
  const label=historical?'baseline':'current';
  const {service}=await storage(prisma,historical);
  const db=native.db('sr_r15_persistence_storage');
  const oid=label+'-fresh-record';
  const initial=fixtureRecord(oid);
  const brand={id:'brand-1',name:'default'};
  const create=await service.create(brand,initial,{name:'rdmp'});
  assert.equal(create.applicationState,'applied',JSON.stringify(create));
  const fresh=await db.collection('record').findOne({redboxOid:oid});
  assert.equal(fresh.revision,0);assert.equal(typeof fresh.incarnationId,'string');assert.equal(typeof fresh.dateCreated,'string');assert.equal(fresh.metadata.nested.flag,false);
  const {Services:{Records}}=require(path.join(coreRoot,'src/records/Records.ts'));
  const config={record:{auditing:{enabled:false}},jsonld:{addJsonLdContext:true,contexts:{review:{'@vocab':'https://example.invalid/vocabulary/'}}}};
  const recordDomain=new Records({config,log});
  if(historical) recordDomain.transitionWorkflowStepMetadata=baselineMethod('packages/redbox-core/src/services/RecordsService.ts','transitionWorkflowStepMetadata',{_,sails:{config,log}});
  const candidate=structuredClone(fresh);
  const target={config:{workflow:{stage:'review',stageLabel:'Review'},form:'review',authorization:{editRoles:['Admin'],viewRoles:['Researcher']}}};
  recordDomain.transitionWorkflowStepMetadata(candidate,target);
  const update=await service.updateMeta(brand,oid,candidate,undefined,{precondition:{expectedRevision:0,requireRevision:true}});
  assert.equal(update.applicationState,'applied',JSON.stringify(update));
  const transitioned=await db.collection('record').findOne({redboxOid:oid});
  assert.equal(transitioned.revision,1);assert.equal(transitioned.metaMetadata.form,'review');assert.equal(transitioned.workflow.stage,'review');assert.equal(transitioned.previousWorkflow.stage,'draft');
  assert.deepEqual(transitioned.metadata['@context'],config.jsonld.contexts.review);
  assert.equal(transitioned.dateCreated,fresh.dateCreated);assert.equal(transitioned.incarnationId,fresh.incarnationId);
  note(label+'-fresh-create-workflow-transition',{raw:schemas({fresh,transitioned})});
  const auditModel=new (require(path.join(coreRoot,'src/model/storage/RecordAuditModel.ts')).RecordAuditModel)(oid,transitioned,{id:'actor-1',username:'alice'},'updated');
  assert.equal((await service.createRecordAudit(auditModel)).success,true);
  const audit=await db.collection('recordaudit').findOne({redboxOid:oid});
  assert.equal(audit.action,'updated');assert.equal(audit.record.metadata.title,'Legacy record');assert.equal(typeof audit.createdAt,'string');
  const audits=await service.getRecordAudit({oid});assert.equal(audits.length,1);assert.equal(audits[0].record.metadata.title,'Legacy record');
  service.gridFsBucket=new GridFSBucket(db,{bucketName:'r15bytes'});
  const bytes=Buffer.from('fixture datastream bytes\n');
  await service.addDatastream(oid,{fileId:'file-a',metadata:{filename:'legacy.txt',contentType:'text/plain',contentLength:bytes.length}}, {getStream:async()=>Readable.from([bytes])});
  const attachment=await service.getDatastream(oid,'file-a');
  const chunks=[];for await(const chunk of attachment.readstream)chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks),bytes);
  const storedFile=await db.collection('r15bytes.files').findOne({filename:oid+'/file-a'});
  assert(storedFile.uploadDate instanceof Date);assert.equal(storedFile.metadata.redboxOid,oid);assert.equal(storedFile.length,bytes.length);
  note(label+'-record-audit-gridfs-bytes',{raw:schemas({audit,storedFile}),readBytesSha256:sourceHash(Buffer.concat(chunks))});
  await recordDomain.close();
}
async function main(){
  await native.connect();
  const server=await native.db('admin').command({buildInfo:1});
  await runtime.initializePersistence(owner);
  const prisma=await runtime.prismaDatabase(owner,'redboxStorage');
  const db=native.db('sr_r15_persistence_storage');
  for(const name of ['record','deletedrecord','recordidentity','recordaudit']) await db.collection(name).deleteMany({redboxOid:{$in:['baseline-soft-delete','current-soft-delete','baseline-fresh-record','current-fresh-record','baseline-legacy-deleted','current-legacy-deleted']}});
  await db.collection('r15bytes.files').deleteMany({});await db.collection('r15bytes.chunks').deleteMany({});
  for(const name of ['record','deletedrecord','recordidentity']) await db.collection(name).createIndex({redboxOid:1},{unique:true});
  global.sails={config:owner.config,log};global._=_;
  await lifecycle(prisma,true);
  await lifecycle(prisma,false);
  const corePrisma=await runtime.prismaDatabase(owner,'mongodb');
  await repositoryCases(corePrisma,true);
  await repositoryCases(corePrisma,false);
  await storageDocumentCases(prisma,true);
  await storageDocumentCases(prisma,false);
  const paired=[];
  for(const suffix of ['identity-legacy-patch-membership-audit','configuration-legacy-json-cas','vocabulary-legacy-normalization','recordtype-form-workflow-definition','attachment-legacy-patch-access-audit']){
    const before=observed.find(o=>o.id==='baseline-'+suffix),after=observed.find(o=>o.id==='current-'+suffix);
    assert.deepEqual(normalized(BSON.EJSON.deserialize(before.raw)),normalized(BSON.EJSON.deserialize(after.raw)),suffix);
    paired.push({family:suffix,result:'equal after normalizing generated ObjectIds, timestamps and salted bcrypt bytes; actual raw typed BSON retained separately'});
  }
  const file='support/specs/sails-retirement/evidence/final-review-r15/persistence-probe-results.json';
  fs.writeFileSync(file,JSON.stringify({node:process.version,mongoVersion:server.version,mongoGitVersion:server.gitVersion,databases:['sr_r15_persistence','sr_r15_persistence_storage'],baseline,observed,paired},null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await runtime.cleanupPersistence(owner);
  await native.close();
  delete global.sails;delete global._;
});
