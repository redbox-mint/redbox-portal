"""Read-only deployment input inventory; synthetic defaults are labelled."""
import hashlib,json,pathlib,re,subprocess
ROOT=pathlib.Path('/home/andrew/src/github/redbox-portal');WSU=pathlib.Path('/home/andrew/src/bitbucket/redbox-hook-wsu-v6');OUT=ROOT/'support/specs/sails-retirement/evidence/final-review-r25';RAW=ROOT/'.tmp/sails-retirement/final-review-r25'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
files=subprocess.check_output(['git','ls-files'],cwd=WSU,text=True).splitlines()
refs={};sources={}
internal={'BASH_SOURCE','SCRIPT_DIR','TAG','DEPLOY_TAG','TEST_IMAGE','PLATFORM','SUFFIX','CREDS_DIR','CREDS_FILE','DESIRED_CREDS_FILE','host_arch'}
for name in files:
 p=WSU/name
 if not p.is_file() or (p.suffix not in {'.ts','.cjs','.sh','.yml','.md','.json'} and name!='Dockerfile') or name.startswith(('test/','assets/','bootstrap-data/','language-defaults/')) or name=='package-lock.json':continue
 source=p.read_text();sources[name]=sha(p)
 patterns=[r'process\.env\.([A-Za-z_][A-Za-z_0-9]*)',r'\$\{([A-Za-z_][A-Za-z_0-9]*)',r'(?:env|optionalEnv|booleanEnv|envValue)\(\s*[\'\"]([A-Za-z_][A-Za-z_0-9]*)[\'\"]',r'[\'\"]((?:SAILS_DOI__)[A-Z_]+)[\'\"]',r'\b((?:TS_NODE_|NODE_PATH)[A-Z_]*)=']
 if p.suffix not in {'.sh','.yml','.md'} and name!='Dockerfile': patterns.pop(1)
 if p.suffix in {'.sh','.yml','.md'} or name=='Dockerfile':patterns.append(r'\b([A-Z][A-Z_0-9]*)=')
 if name=='AGENTS.md':patterns.append(r'\b(NODE_PATH)\b')
 for pattern in patterns:
  for m in re.finditer(pattern,source):
   key=m.group(1)
   if key in internal:continue
   refs.setdefault(key,[]).append({'file':name,'line':source.count('\n',0,m.start())+1,'text':source.splitlines()[source.count('\n',0,m.start())].strip()})
 # Destructured process.env selectors are not dot property accesses.
 if name in ['support/v6/app.cjs','support/v6/verify.cjs']:
  for key in ['REDBOX_APPLICATION_CONFIG','REDBOX_ENVIRONMENT_CONFIG','REDBOX_LOCAL_CONFIG']:
   refs.setdefault(key,[]).append({'file':name,'line':5 if name.endswith('app.cjs') else 9,'text':'explicit selected file, removed before canonical environment parsing'})
config=json.loads((RAW/'resolved-defaults.json').read_text())
canonical={
'REDBOX_PORT':'server.port','REDBOX_HOSTNAME':'server.hostname','REDBOX_PUBLIC_URL':'server.publicUrl','REDBOX_ROOT_CONTEXT':'server.rootContext','REDBOX_TRUST_PROXY':'server.trustProxy','REDBOX_STOP_DEADLINE_MS':'server.stopDeadlineMs','REDBOX_MONGODB_URL':'datastores.mongodb.url','REDBOX_STORAGE_MONGODB_URL':'datastores.redboxStorage.url','REDBOX_SESSION_SECRET':'redboxSession.secret','REDBOX_SESSION_MONGODB_URL':'redboxSession.mongoUrl','REDBOX_AGENDA_BACKEND':'agendaQueue.options.backend','REDBOX_AGENDA_MONGODB_URL':'agendaQueue.options.db','REDBOX_AGENDA_COLLECTION':'agendaQueue.options.collection','REDBOX_AGENDA_PROCESS_EVERY':'agendaQueue.options.processEvery','REDBOX_AGENDA_HISTORY_RETENTION_HOURS':'agendaQueue.options.historyRetentionHours','REDBOX_ADMIN_USER':'brandingConfigurationDefaults.auth.local.default.adminUser','REDBOX_ADMIN_PASSWORD':'brandingConfigurationDefaults.auth.local.default.adminPw','REDBOX_ADMIN_EMAIL':'brandingConfigurationDefaults.auth.local.default.email','REDBOX_ADMIN_TOKEN':'brandingConfigurationDefaults.auth.local.default.token','REDBOX_LOG_LEVEL':'logging.level','REDBOX_BOOTSTRAP_DATA_PATH':'bootstrap.bootstrapDataPath','REDBOX_SOLR_HOST':'solr.cores.default.options.host','REDBOX_SOLR_CORE':'solr.cores.default.options.core'}
def get(p):
 v=config
 for x in p.split('.'):
  if not isinstance(v,dict) or x not in v:return '<unset>'
  v=v[x]
 return v
meta={}
def add(names,default,derived,override,scope='active'):
 for n in names.split():meta[n]={'default':default,'derived':derived,'override':override,'scope':scope}
add('REDBOX_BUILD_IMAGE REDBOX_PORTAL_IMAGE','required; no image fallback','Dockerfile FROM builder/runtime; build and CI argv','qualified fixed local tags or published repository@digest; support/v6/README.md')
add('REDBOX_COMPOSE_PROJECT_NAME','development: redbox-hook-wsu-development; integration: redbox-hook-wsu-v6-test','Compose resource names only','nonempty Compose project name; does not enter app environment')
add('REDBOX_PORTAL_HOST_PORT',1500,'published listener and default REDBOX_PORTAL_APP_URL (R24)','positive free host port; does not change internal 1500')
add('REDBOX_PORTAL_APP_URL','http://localhost:${REDBOX_PORTAL_HOST_PORT:-1500}','container REDBOX_PUBLIC_URL, CSRF origin and environment-derived DOI defaults','explicit public origin; public path additionally needs server.rootContext via selected configuration/Compose override')
for n,v in [('REDBOX_PORTAL_DEBUG_HOST_PORT',9876),('REDBOX_MONGODB_HOST_PORT',27017),('REDBOX_SOLR_HOST_PORT',8983),('REDBOX_S3_API_HOST_PORT',9000),('REDBOX_S3_ADMIN_HOST_PORT',9001)]:add(n,v,'host publication only; internal service DNS/port remain unchanged','free host port in development Compose')
add('REDBOX_APPLICATION_CONFIG REDBOX_ENVIRONMENT_CONFIG REDBOX_LOCAL_CONFIG','unset; only APPLICATION_CONFIG selected by dev Compose (support/v6/application.cjs) and integration (test.cjs)','application -> selected environment -> local layers','absolute selected CJS/ESM module; support/v6/README.md and configuration-v6.md')
add('NODE_ENV','production in institution executable','configuration environment label; does not select files','supported environment identifier; files selected independently')
add('HOOK_ATTACHMENTS_STAGE_DIR','/attachments/staging','record.attachments.file.directory and storage.disks.staging.config.root','nonempty path; same value enters both hook contributions')
add('HOOK_S3_BUCKET HOOK_S3_REGION','required before registration; dev Compose supplies local values','primary S3 bucket/region and prepare-s3.sh target','environment at hook module evaluation; selected config can override a valid contribution')
add('HOOK_S3_ACCESS_KEY HOOK_S3_SECRET_KEY','empty string after R25 fix; dev Compose supplies seaweedadmin','explicit driver credentials only when BOTH trimmed values nonempty; otherwise AWS credential chain','set both explicit credentials or leave both unset; support/v6/README.md')
add('HOOK_S3_ENDPOINT','unset in hook; prepare-s3.sh defaults http://seaweedfs:8333; dev Compose sets that endpoint','S3 driver and standalone bucket-preparation target','trimmed endpoint URL; explicit override must target same S3 service')
for n in ['HOOK_S3_FORCE_PATH_STYLE','HOOK_S3_BUCKET_ENDPOINT','HOOK_S3_TLS','HOOK_S3_USE_ACCELERATE_ENDPOINT']:add(n,'unset (SDK default); dev FORCE_PATH_STYLE=true','corresponding primary S3 driver option','case-insensitive true/1/yes/on or false/0/no/off; blank/unknown is omitted; inherited helper behavior')
add('HOOK_S3_SUPPORTS_ACL',False,'primary S3 driver ACL support','same boolean spellings; blank/unknown falls back false')
add('HOOK_S3_KEY_PREFIX','HOOK_S3_PRIMARY_PREFIX or attachments/','storage.keyPrefix','nonempty raw KEY_PREFIX wins; fallback PRIMARY_PREFIX is trimmed')
add('HOOK_S3_PRIMARY_PREFIX','attachments/','fallback for storage.keyPrefix','trimmed historical fallback when KEY_PREFIX empty/unset')
add('DOI_PUBLIC_LANDING_URL','REDBOX_PUBLIC_URL + /published, else https://research-data.westernsydney.edu.au/published','dataPublication DOI JSONata URL; record handle wins','trimmed public landing base without trailing slashes; captured at module evaluation')
add('DOI_INSTRUMENT_LANDING_URL','REDBOX_PUBLIC_URL + /default/rdmp/record/view, else WSU production URL at that path','instrument DOI JSONata URL; record.metadata.landingPageUrl wins','trimmed record-view base; needed for nondefault brand/portal; captured at module evaluation')
add('DATACITE_BASE_URL','https://api.test.datacite.org','doiPublishing.connection.baseUrl','trimmed URL captured in hook defaults; selected branding config/AppConfig overrides actual runtime data')
add('DATACITE_USERNAME DATACITE_PASSWORD','empty string','doiPublishing.connection credentials','deployment secret environment or selected branding config; existing dynamic AppConfig remains authoritative')
add('DATACITE_DOI_PREFIX','empty string','dataPublication/instrument profile prefix defaultValue (no minted DOI until configured)','trimmed DOI prefix; captured at module evaluation')
add('SAILS_DOI__PUBLICLANDINGURL SAILS_DOI__INSTRUMENTLANDINGURL','readable fallback in hook helper, but NOT an accepted v6 startup variable','canonical loader rejects retired sails_* inputs','use DOI_PUBLIC_LANDING_URL / DOI_INSTRUMENT_LANDING_URL; explicit rejection is retirement policy','retired-read')
add('AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY','Seaweed Compose values: seaweedadmin','Seaweed credentials and signed development bucket health probe; SDK standard credential chain outside Compose','development service constants; production SDK credential provider owns standard AWS variables')
add('SOLR_HOME','/var/solr/data','Solr service data/config directory, not portal client host/port','development Compose service constant; deployment Compose override')
add('NODE_PATH','unset in current v6 Dockerfile/Compose','AGENTS.md retains an archetype note about mounted shared dependencies; current installed Node resolution uses the portal graph','not an active v6 selector; no NODE_PATH override required','documented historical note')
add('AWS_DEFAULT_REGION','ap-southeast-2 in development Seaweed','development bucket health signature','Compose service constant; hook region is independently HOOK_S3_REGION')
add('S3_BUCKET','development test-aws-redbox-hook-wsu-attachments; integration wsu-integration','Seaweed bucket creation and health probe','Compose service constant matched to rbportal HOOK_S3_BUCKET')
add('WSU_DISPOSABLE','unset; integration Compose true','installed verifier destructive-fixture fence','must be exactly true for disposable integration only','test-only')
add('TS_NODE_PROJECT TS_NODE_TRANSPILE_ONLY','test/tsconfig.json and true in test:unit','shared Mocha/TypeScript launch settings','package.json test script; not deployment runtime inputs','test-only')
add('REPO','nexus-prod.redboxresearchdata.com.au:21444/wsu-redbox-portal','local/deploy/manifest image repository','explicit build-shell repository')
add('CIRCLE_BRANCH CIRCLE_TAG','branch first, then tag, else local','TAG; DEPLOY_TAG replaces slash with hyphen','CircleCI owned branch/tag context')
add('CIRCLE_SHA1','test image local fallback; required for strict local/deploy scripts','commit image tag and temporary builder image tag','CircleCI commit identifier')
add('CIRCLE_BUILD_NUM','required by strict deploy script','circleci build image tag','CircleCI build number')
add('DOCKER_USER DOCKER_PASS','required by strict publication/local scripts','registry login credentials','CI secret context; no registry command exercised in R25')
add('REDBOX_RETIRED_V5_COMPOSE','intentionally unset','old Compose entrypoint refuses with v6 guidance','do not supply; use v6 Compose','retired')
add('RBPORTAL_SAILS_LOG_LEVEL REGENERATE_SHIMS SHIM_VERBOSE sails_appUrl','error / false / false / http://localhost:1500 in retained v5 bootstrap fixture','retained v5 Sails fixture only; current npm/CI never selects it','retired workflow; no v6 activation path','retired')
for n,p in canonical.items():
 meta[n]={'default':('required private secret, minimum 32 characters' if n=='REDBOX_SESSION_SECRET' else get(p)),'derived':p+'; owned consumer reads resolved snapshot','override':'canonical environment; application/environment/local data modules at '+p+' (CLI also for server fields)','scope':'active'}
 if n in ['REDBOX_PUBLIC_URL','REDBOX_ROOT_CONTEXT']:meta[n]['derived']+='; CSRF uses URL origin; pages/assets/callback routes use root separately. Listen port, cookie path/security and IdP registered redirect URIs are independent explicit settings.'
 if n.startswith('REDBOX_ADMIN_'):meta[n]['derived']+='; fresh bootstrap defaults only, not a replacement for existing user/AppConfig data'
for n in canonical:refs.setdefault(n,[{'file':'portal:packages/redbox-core/src/configuration/'+('portal.ts' if n in ['REDBOX_ADMIN_USER','REDBOX_ADMIN_PASSWORD','REDBOX_ADMIN_EMAIL','REDBOX_ADMIN_TOKEN','REDBOX_LOG_LEVEL','REDBOX_BOOTSTRAP_DATA_PATH','REDBOX_SOLR_HOST','REDBOX_SOLR_CORE'] else 'deployment.ts'),'line':None,'text':'supported canonical environment input map'}])
missing=sorted(set(refs)-set(meta));assert not missing,missing
rows=[{'input':n,**meta[n],'references':refs[n]} for n in sorted(refs)]
roots=['server','datastores','redboxSession','auth','storage','agendaQueue','solr','custom.wsu','page','logging','bootstrap','record.attachments','brandingConfigurationDefaults.auth','brandingConfigurationDefaults.doiPublishing','brandingConfigurationDefaults.raidPublishing','brandingConfigurationDefaults.oniPublishing','emailnotification','pdfgen','figshareDev','companion','appConfigSecrets','orcid','vocab.bootstrapRvaImports','vocab.bootstrapFigshareImports']
leaves=[]
def flatten(value,prefix):
 if isinstance(value,dict) and value:
  for k,v in value.items():flatten(v,prefix+'.'+k)
 else:
  value='<private required fixture; no default>' if prefix=='redboxSession.secret' else value
  if prefix.startswith('storage.disks.primary.config.') and prefix.split('.')[-1] in ['key','secret','bucket','region']:value='<synthetic required fixture; see corresponding HOOK_S3 input>'
  group=next((x for x in roots if prefix==x or prefix.startswith(x+'.')),'')
  derived={'server':'HTTP origin/root/listener; independent settings documented above','redboxSession':'owned session store/cookie, no implicit cookie derivation','datastores':'owned logical Mongo target and pool policy','storage':'selected filesystem/S3 disk and key prefix','agendaQueue':'selected queue backend/store, job scheduling/locking','solr':'selected Solr client/core/schema/preindex','pdfgen':'PDF target app URL plus relative source prefix; brand/per-call options override defaults','brandingConfigurationDefaults.doiPublishing':'brand DOI bootstrap defaults; existing AppConfig wins; profile data maps DOI payload','brandingConfigurationDefaults.auth':'brand auth bootstrap defaults; existing AppConfig wins; IdP redirect URI is explicit','emailnotification':'mail transport/template defaults; no network send in R25'}.get(group,'selected consumer data; no implicit environment reread')
  leaves.append({'input':prefix,'default':value,'derived':derived,'override':'selected application/environment/local data at this path; environment wins only for the named canonical mappings','scope':'deployment data; arrays treated as one ordered input'})
for p in roots:
 v=get(p)
 if v!='<unset>':flatten(v,p)
for p in ['custom.wsu.publicationsPath','brandingConfigurationDefaults.figsharePublishing','vocab.bootstrapRvaImports','vocab.bootstrapFigshareImports','pdfgen.sourceUrlBase']:
 if not any(x['input']==p for x in leaves):leaves.append({'input':p,'default':'/publications' if p.endswith('publicationsPath') else '<unset>','derived':'publication producer and public file reader share selected directory' if p.endswith('publicationsPath') else 'selected provider/bootstrap data','override':'selected module at this path; brand AppConfig where provider supports it','scope':'optional deployment input'})
for field,default,derived in [('templatePath','bundled templates/pubtemplate.ejs','selected publication EJS template'),('rifGroupName','Western Sydney University','RIF-CS registry group'),('triggerCondition','<%= true %>','publication trigger expression'),('outputPath','custom.wsu.publicationsPath or /publications','deployment-owned producer and file reader root'),('baseUrl','server.publicUrl','deployment-owned canonical publication URLs'),('landingPageUrl','server.publicUrl + /published','deployment-owned public landing base')]:
 leaves.append({'input':'recordtype.<type>.hooks.<event>.<phase>[].options.'+field,'default':default,'derived':derived,'override':'validated wsu.publication.produceMetadataFiles operation arguments; template/group/condition preserved; output/base/landing use selected deployment values','scope':'WSU exporter binding'})
result={'method':'tracked WSU source reads + canonical portal environment maps + leaf expansion of real resolved WSU/application/PDF defaults; DSL arrays retained atomically','portalIncoming':'a4089ad238f78ca0d0f5b9227a61f8fd5ecf8061','wsuIncoming':'8dd61118eed9582be8d4d01359677b9be4dba631','sourceHashes':sources,'environmentInputs':rows,'configurationInputs':leaves,'internalShellVariablesExcluded':sorted(internal),'cliInputs':{'--port=':'server.port','--hostname=':'server.hostname','--public-url=':'server.publicUrl','--root-context=':'server.rootContext','--stop-deadline-ms=':'server.stopDeadlineMs','--maintenance=indexes:inspect':'offline index readiness; no implicit writes','--maintenance=indexes:ensure':'explicit index preparation','--initialize-only':'initialize, then owned stop'},'positionalBuildInputs':{'nexus_deploy.sh $1':'platform defaults linux/amd64','$2':'image suffix defaults empty','nexus_publish_manifest.sh $1':'image suffix defaults empty'}}
(OUT/'configuration-inputs.json').write_text(json.dumps(result,indent=2)+'\n')
md=['# WSU deployment inputs — R25','',f'The machine inventory lists **{len(rows)} environment inputs** and **{len(leaves)} resolved configuration leaf/array inputs**, plus all CLI and build positional inputs. It records defaults, downstream values, override channels and exact source locations. Synthetic credentials used for resolution are labelled; no production configuration was read.','', 'Precedence: core, ordered extensions, selected application, environment file, local file, canonical environment, supported CLI. Validity is checked after each layer; required hook S3 bucket/region inputs must already be valid during registration. Modules capture hook-specific environment at first import; use a fresh process after changing it. Existing brand AppConfig is dynamic and is not rewritten by startup defaults.','', 'Only variables listed in a service environment are forwarded by Compose; other shell variables require a deployment-owned Compose override. Ports published by Compose do not change in-container service DNS/ports. Public URL and root context, listen port, cookie security/path, IdP redirect URIs, default brand/portal and page landing/logout paths are separate explicit settings. Canonical URL must contain the selected public root; the loader does not infer proxy topology or rewrite a registered IdP callback.','', '| Environment input | Default | Downstream values | Override / disposition |','| --- | --- | --- | --- |']
def cell(x):return str(x).replace('|','\\|').replace('\n',' ')
for r in rows:md.append('| `'+r['input']+'` | '+cell(r['default'])+' | '+cell(r['derived'])+' | '+cell(r['override'])+' ('+r['scope']+') |')
md += ['', 'Every selected configuration leaf/array input is enumerated separately in [configuration-inputs.json](configuration-inputs.json). This includes Mongo driver/session policy, every queue job, Solr schema/options, authentication bootstrap data, mail transport/templates, PDF settings/options, DOI profiles and secret-provider controls. Form/workflow/metadata DSL definitions are the settled R20 domain surface, rather than deployment selectors; the default snapshot is retained in raw evidence.','', 'AWS SDK credential sources and Nodemailer/Solr native JSON options remain provider-owned: their arbitrary nested driver keys are not invented ambient REDBOX settings. Companion provider environment is not implicitly loaded: WSU leaves it disabled unless a selected module calls the documented resolver and supplies explicit companion data. DOI URL derivation reads ambient environment before selected files/CLI and fixes the instrument brand/portal to default/rdmp; the reproduced inherited B-18 discrepancy requires explicit DOI base variables on those deployments. The two retained SAILS_DOI aliases are rejected by the canonical v6 loader; use their DOI-prefixed replacements.','', 'Verification: [configuration matrix](configuration-matrix.cjs), [live HTTP starts](live-http.cjs), the WSU S3/exporter regressions and offline real Compose expansion. Results and qualification limits are in [R25](../final-review-r25.md).']
(OUT/'configuration-table.md').write_text('\n'.join(md)+'\n');print(json.dumps({'environmentInputs':len(rows),'configurationInputs':len(leaves),'sourceFiles':len(sources)}))
