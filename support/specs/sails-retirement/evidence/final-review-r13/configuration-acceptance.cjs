// Reviewed dispositions for the complete, pinned source inventory. No baseline modules execute.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
const inventory = require('./configuration-inventory.json');
const docs = ['support/specs/sails-retirement/configuration-v6.md#baseline-input-dispositions', 'support/wiki/V6-Client-Compatibility.md#configuration-input-dispositions'];
const migrated = {
  appUrl: 'server.publicUrl; browser templates receive the canonical origin',
  port: 'server.port',
  http: 'server.rootContext/trustProxy; owned Express middleware and PortalHttpOptions',
  log: 'logging.level and PortalHttpOptions.requestLogging; selected logger owns formatting/output',
  lognamespace: 'selected logger and explicit domain logger inputs',
  bootstrapTimeout: 'awaited initialization with lifecycle deadlines; no Sails hook timeout',
  db: 'owned datastore initialization/readiness; no Sails waitRetries/waitSleep loop',
  crontab: 'schedules with registered operation names',
  queue: 'selected queue factory and agendaQueue options/jobs',
  raid: 'brandingConfigurationDefaults.raidPublishing and dynamic brand raidPublishing; baseline defaults already seed this block',
  services: 'selected factories; email disabled via selected Email input',
  controllers: 'owned HTTP route declarations',
  routes: 'owned HTTP route declarations',
  policies: 'PortalHttpOptions.policyConfiguration and explicit policy declarations',
  cors: 'explicit Express host integration and canonical origins',
  security: 'owned CSRF/CSP policies; csp domain data remains supported',
  sockets: 'direct Socket.IO grants/events and explicit socket inputs',
  session: 'redboxSession owned Mongo store; disabled Sails session hook is removed',
  views: 'resolved extension views and explicit viewRoots',
  dynamicasset: 'owned dynamic page routes; additional assets through explicit host/extension routes',
  dynamicconfig: 'owned AppConfig persistence/hydration and explicit brand resolution',
  validators: 'registered validators and neutral extension declarations; field validators remain form DSL data',
  workspacetype_services: 'registered workspace factories',
};
const inactive = {
  redboxToCkan: 'exported baseline defaults/types; no baseline production consumer found',
  enableNewForm: 'environment declaration only; no baseline production consumer found',
  reusableContributorFormDefinitions: 'build-time fragment included by reusableFormDefinitions, not a separately read startup section',
  reusableRelatedObjectsFormDefinitions: 'build-time fragment included by reusableFormDefinitions, not a separately read startup section',
  reusableViewFormDefinitions: 'build-time fragment included by reusableFormDefinitions, not a separately read startup section',
  datapubs: 'stale wiki reference; baseline Oni service consumes branded oniPublishing instead',
  features: 'illustrative wiki custom service setting, no bundled production reader',
};
const retired = {
  autoreload: 'development tooling; explicit builds replace Sails reload hook',
  blueprints: 'Sails action/REST/shortcut auto-routing removed',
  globals: 'Sails/service/model globals removed',
  hooks: 'Sails hook discovery removed; declare neutral extensions',
  pubsub: 'Sails pubsub hook removed; direct Socket.IO',
  typescript: 'build-time compiler configuration replaces Sails TypeScript hook',
  webpack: 'owned static build replaces Sails webpack hook',
  dontBackupCoreLanguageFilesWhenMerging: 'removed legacy loader file copying and backup effects',
  keepResponseErrors: 'sanitized operational errors replace raw backend/driver exception responses',
};
const state = {
  appPath: 'host-supplied appPath, not startup data',
  beforeShutdown: 'runtime lifecycle callback; not a serializable startup value',
  brandingAware: 'runtime brand resolver function; use explicit brand resolution',
  passport: 'runtime authentication instance; configured providers remain branded auth data',
  startupMinute: 'bootstrap-generated runtime timestamp, not an operator setting',
  recordContractContributorState: 'runtime registry state, now owned record contract registry',
  configmodels: 'runtime model registry, now selected model registry',
  legacyBlock: 'invented ConfigService migration test block',
  anotherLegacyBlock: 'invented ConfigService migration test block',
  '*': 'dynamic configuration key: actual possible shapes separately enumerated by defaults/types/fixtures',
};
function disposition(parts) {
  const name = parts[0];
  if (name === 'form' && ['forms', 'defaultForm', 'formConfigRegistry'].includes(parts[1]))
    return { classification: 'migrated', reason: 'explicit extension forms registry and form delivery replace legacy generated form shims', references: docs };
  for (const [classification, map] of Object.entries({ migrated, inactive, retired, state }))
    if (map[name]) return { classification, reason: map[name], ...(classification === 'migrated' || classification === 'retired' ? { references: docs } : {}) };
  return { classification: 'retained', reason: 'same domain input, verified against startup schema and public configuration type' };
}
function fixtureDisposition(fixture) {
  const d = disposition([fixture.name]);
  if (d.classification !== 'retained') return d;
  if (fixture.name === 'workflow' && Object.values(fixture.sample).some(value => typeof value !== 'object'))
    return { classification: 'excluded-fixture', reason: 'workflow step/record snapshot in a stubbed request fixture, not startup workflow maps' };
  if (fixture.name === 'form') {
    if (typeof fixture.sample !== 'object') return { classification: 'excluded-fixture', reason: 'record/form-reference scalar inside a config-named DTO, not startup configuration' };
    if (fixture.sample.forms || fixture.sample.defaultForm || fixture.sample.formConfigRegistry)
      return disposition(['form', 'forms']);
  }
  if (fixture.name === 'recordValidation' && fixture.sample.operations?.submit && ['enabledValidationGroups', 'roles', 'allowedTargetSteps', 'label'].some(key => Object.hasOwn(fixture.sample.operations.submit, key)))
    return { classification: 'excluded-fixture', reason: 'baseline negative fixture explicitly asserts unknown operation properties fail validation' };
  if (fixture.name === 'action' && fixture.sample.testAction?.service)
    return { classification: 'migrated', reason: 'stubbed executable service object; use registered named operations', references: docs };
  if (fixture.name === 'bootstrap')
    return { classification: 'excluded-fixture', reason: 'bootstrap fixture is runtime function/state; baseline startup file declarations are inventoried separately' };
  return d;
}
module.exports = { disposition, fixtureDisposition, docs };
if (require.main === module) {
(async () => {
  require('ts-node').register({ transpileOnly: true, project: path.join(root, 'packages/redbox-core/test/tsconfig.json') });
  const ts = require('typescript');
  const { z } = require('node:module').createRequire(path.join(root, 'packages/redbox-core/package.json'))('zod');
  const { portalSchema } = require(path.join(root, 'packages/redbox-core/src/configuration/portal'));
  const schema = z.toJSONSchema(portalSchema, { unrepresentable: 'any' });
  function schemaPath(node, parts) {
    if (!parts.length || node === true) return true;
    if (!node || node === false) return false;
    if (node.$ref) return schemaPath(schema.$defs[node.$ref.split('/').at(-1)], parts);
    if (node.anyOf) return node.anyOf.some(item => schemaPath(item, parts));
    if (node.allOf) return node.allOf.every(item => schemaPath(item, parts));
    const [name, ...rest] = parts;
    if (node.type === 'array') return name === '*' && schemaPath(node.items, rest);
    if (node.properties?.[name]) return schemaPath(node.properties[name], rest);
    if (node.type === 'object' || node.additionalProperties) return node.additionalProperties !== false && schemaPath(node.additionalProperties ?? true, rest);
    return !node.type; // unrepresentable executable/custom leaf; never fabricate its value
  }
  const source = path.join(root, 'packages/redbox-core/src/configuration/portal.ts');
  const core = path.join(root, 'packages/redbox-core');
  const config = ts.readConfigFile(path.join(core, 'tsconfig.json'), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, core).options;
  const program = ts.createProgram([source], { ...options, noEmit: true });
  const checker = program.getTypeChecker();
  const alias = program.getSourceFile(source).statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'PortalConfiguration');
  const type = checker.getTypeAtLocation(alias);
  function typePath(current, parts) {
    if (!parts.length || current.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
    if (current.isUnion() || current.isIntersection()) return current.types.some(item => typePath(item, parts));
    const [name, ...rest] = parts;
    const member = name === '*' ? undefined : checker.getPropertyOfType(current, name);
    if (member) return typePath(checker.getTypeOfSymbolAtLocation(member, alias), rest);
    const index = checker.getIndexTypeOfType(current, name === '*' && checker.isArrayType(current) ? ts.IndexKind.Number : ts.IndexKind.String);
    return !!index && typePath(index, rest);
  }
  const entries = inventory.entries.map(entry => ({ path: entry.path, ...disposition(entry.path), schema: schemaPath(schema, entry.path), typed: typePath(type, entry.path) }));
  // Native session adapter comments list Redis-only fields which Mongo never consumed.
  for (const entry of entries) {
    const dotted = entry.path.join('.');
    if (dotted === 'record.customFields') Object.assign(entry, { classification: 'inactive', reason: 'historical unimplemented proposal in form-custom-field-values spec; no baseline consumer/default' });
    if (dotted === 'api.endpoint') Object.assign(entry, { classification: 'inactive', reason: 'illustrative Services Architecture URL setting; no bundled baseline production reader' });
    if (dotted === 'auth.*') Object.assign(entry, { classification: 'excluded-fixture', reason: 'dynamic old Siem test auth brand lookup; actual supported auth shapes enumerated separately' });
    if (dotted === 'bootstrap.bootstrap') Object.assign(entry, { classification: 'retired', reason: 'Sails bootstrap callback becomes awaited named bootstrap operations', references: docs });
    if (['auth.roles.push', 'bootstrap.bootstrapDataPath.trim', 'storage.serviceName.trim'].includes(dotted)) Object.assign(entry, { classification: 'state', reason: 'method call on configuration value, not a configuration property' });
    if (/^redboxSession\.(db|host|pass|port|prefix)$/.test(dotted)) Object.assign(entry, { classification: 'inactive', reason: 'historical Redis adapter option; baseline only supported/selected Mongo and ignored this field' });
    if (/^datastores\.\*/.test(dotted)) Object.assign(entry, { classification: 'state', reason: 'dynamic datastore name; accepted names mongodb/redboxStorage are explicitly enumerated' });
    if (dotted.startsWith('recordValidation.operations.submit.') && !entry.schema) Object.assign(entry, { classification: 'excluded-fixture', reason: 'negative validation fixture; unknown operation properties intentionally rejected before this feature' });
  }
  const fixtures = inventory.fixtures.map((fixture, index) => ({ index, file: fixture.file, line: fixture.line, name: fixture.name, ...fixtureDisposition(fixture) }));
  const counts = list => Object.fromEntries([...new Set(list.map(item => item.classification))].sort().map(kind => [kind, list.filter(item => item.classification === kind).length]));
  const unresolved = inventory.unresolved.map((entry, index) => ({ index, ...entry, owner: entry.file, disposition: /process\.env/.test(entry.expression) ? 'explicit environment input or selected data module conversion; see environmentReads ledger' : /function|=>|require\(|new /.test(entry.expression) ? 'owned executable/resource declaration; migrate through selected factories, named operations or form registry; never evaluate during inventory' : 'symbolic reference retained with source path; literal/type inventory covers resolved data, caller must supply declared capability', references: docs }));
  const excludedFiles = inventory.excludedFiles.map(entry => ({ ...entry, owner: /support\/docs/.test(entry.file) ? 'documentation (AGENTS tracked wiki router)' : /lock|locales|language-defaults|dist|node_modules/.test(entry.file) ? 'dependency/build/localization owner' : 'repository asset/tooling owner', disposition: /support\/docs/.test(entry.file) ? 'legacy documentation excluded in favor of tracked wiki' : /lock|locales|language-defaults|dist|node_modules/.test(entry.file) ? 'dependency/generated/localization data; not startup option declarations or reads' : 'non-source asset; no executable configuration read' }));
  const environmentReads = inventory.environmentReads.map(entry => ({ ...entry, owner: entry.file, disposition: /^UPPY_/.test(entry.name) ? 'explicit resolveCompanionConfiguration(environment) in selected data module; no implicit process-wide discovery' : /^sails_/i.test(entry.name) ? 'convert documented aliases using convertLegacyEnvironment; unsupported aliases fail and require typed data conversion' : entry.name === '*' ? 'dynamic environment read: actual names enumerated at callsite/configuration declaration; selected module owns conversion' : 'toolchain/provider environment owned by source module; not implicitly merged into portal startup data', references: docs }));
  const strictShapes = [];
  const visitedRefs = new Set();
  function strictShape(node, parts, definitions, seen = new Set()) {
    if (!node || typeof node !== 'object') return;
    if (node.$ref) { const ref = decodeURIComponent(node.$ref.split('/').at(-1)); if (!seen.has(ref) && !visitedRefs.has((parts[0] ?? 'root') + ':' + ref)) { visitedRefs.add((parts[0] ?? 'root') + ':' + ref); strictShape(definitions[ref], parts, definitions, new Set([...seen, ref])); } else strictShapes.push({ path: parts, type: 'reference', reference: ref, owner: parts[0] || 'portal startup schema', disposition: 'shared/recursive schema shape; refer to first expansion under this owner', references: docs }); return; }
    if (node.type) strictShapes.push({ path: parts, type: node.type, owner: parts[0] || 'portal startup schema', disposition: 'typed data: no incidental coercion; declared constraints apply', references: docs });
    for (const [name, property] of Object.entries(node.properties ?? {})) strictShape(property, [...parts, name], definitions, seen);
    if (node.items) strictShape(node.items, [...parts, '*'], definitions, seen);
    if (node.additionalProperties && typeof node.additionalProperties === 'object') strictShape(node.additionalProperties, [...parts, '*'], definitions, seen);
    for (const variant of [...(node.anyOf ?? []), ...(node.allOf ?? [])]) strictShape(variant, parts, definitions, seen);
  }
  strictShape(schema, [], schema.$defs ?? {});
  const domainSchema = require(path.join(core, 'src/configuration/portal-domains.schema.json'));
  strictShape(domainSchema, [], domainSchema.definitions ?? {});
  for (const name of ['afterSanitizeAttributes', 'beforeSanitizeElements', 'afterSanitizeElements']) strictShapes.push({ path: ['dompurify', 'hooks', name], type: 'function', owner: 'DOMPurify selected configuration', disposition: 'explicit executable exception; other startup functions rejected', references: docs });
  const typedSamples = fixtures.filter(fixture => fixture.classification === 'retained').map(fixture => ({ [fixture.name]: inventory.fixtures[fixture.index].sample }));
  const typesSource = '// Generated by configuration-acceptance.cjs from every retained literal baseline fixture.\n' +
    "import type { PortalConfiguration } from '../../src/configuration/portal';\n" +
    'type PartialData<T> = T extends (...args: never[]) => unknown ? T : T extends readonly (infer U)[] ? PartialData<U>[] : T extends object ? { [K in keyof T]?: PartialData<T[K]> } : T;\n' +
    'export const baselineConfigurationFixtures = ' + JSON.stringify(typedSamples, null, 2) + ' satisfies readonly PartialData<PortalConfiguration>[];\n';
  const { format, resolveConfig } = require('prettier');
  let generatedTypes = await format(typesSource, { ...(await resolveConfig(path.join(core, 'test/configuration/legacyInventoryTypes.ts'))), parser: 'typescript' });
  const generatedFile = path.join(core, 'test/configuration/legacyInventoryTypes.ts');
  // These five declaration omissions predate the feature. Runtime accepts every
  // corresponding fixture; retain exact expected compiler failures rather than casting
  // them away or deleting valid data from the acceptance table.
  const typePolicies = {
    loginUrl: { file: 'packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts', declaration: 'BrandAuthAafConfig', property: 'loginUrl' },
    claimMappingOptions: { file: 'packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts', declaration: 'BrandAuthOidcConfig', property: 'claimMappingOptions' },
    jsonString: { file: 'packages/redbox-core/src/config/solr.config.ts', declaration: 'SolrPreIndexConfig', property: 'jsonString' },
    defaultNS: { file: 'packages/redbox-core/src/config/i18n.config.ts', declaration: 'I18nNextInitConfig', property: 'defaultNS' },
    ReusableComponent: { file: 'packages/sails-ng-common/src/config/dictionary.outline.ts', declaration: 'ReusableFormDefinitions' },
  };
  const { execFileSync } = require('node:child_process');
  const declarations = Object.entries(typePolicies).map(([key, policy]) => {
    const baselineText = execFileSync('git', ['show', inventory.baseline + ':' + policy.file], { cwd: root, encoding: 'utf8' });
    const baselineFile = ts.createSourceFile(policy.file, baselineText, ts.ScriptTarget.Latest, true);
    const currentFile = ts.createSourceFile(policy.file, fs.readFileSync(path.join(root, policy.file), 'utf8'), ts.ScriptTarget.Latest, true);
    const find = file => file.statements.find(node => (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === policy.declaration);
    const before = find(baselineFile), after = find(currentFile);
    if (!before || !after || policy.property && [before, after].some(node => node.members.some(member => member.name?.getText().replaceAll("'", '') === policy.property))) throw Error('Inherited typing proof changed for ' + key);
    if (!policy.property && before.getText().replace(/\s/g, '') !== after.getText().replace(/\s/g, '')) throw Error('Inherited reusable type changed');
    return { key, ...policy, classification: 'B', severity: 'P3', baseline: { file: policy.file, line: baselineFile.getLineAndCharacterOfPosition(before.getStart()).line + 1, declaration: before.getText() }, disposition: 'inherited narrow declaration; runtime remains accepted; backlog only' };
  });
  // A virtual compiler source keeps --check read-only.
  const compilerHost = ts.createCompilerHost({ ...options, noEmit: true });
  const readFile = compilerHost.readFile;
  compilerHost.readFile = file => path.resolve(file) === generatedFile ? generatedTypes : readFile(file);
  const typeProgram = ts.createProgram([generatedFile], { ...options, noEmit: true }, compilerHost);
  const typedFile = typeProgram.getSourceFile(generatedFile);
  const typedDeclaration = typedFile.statements.find(ts.isVariableStatement).declarationList.declarations[0];
  const array = typedDeclaration.initializer.expression;
  const retained = fixtures.filter(fixture => fixture.classification === 'retained');
  const typingDiagnostics = typeProgram.getSemanticDiagnostics(typedFile).map(diagnostic => {
    const line = typedFile.getLineAndCharacterOfPosition(diagnostic.start).line;
    const sourceLine = generatedTypes.split('\n')[line];
    const policy = declarations.find(policy => sourceLine.includes(policy.key));
    if (!policy || ![2322, 2353].includes(diagnostic.code)) throw Error('New configuration typing failure: ' + ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
    const element = array.elements.findIndex(node => node.pos <= diagnostic.start && diagnostic.start <= node.end);
    if (element < 0) throw Error('Cannot locate typed fixture');
    return { fixture: retained[element].index, code: diagnostic.code, key: policy.key, line, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '), classification: 'B', disposition: policy.disposition };
  });
  for (const fixture of fixtures) if (fixture.classification === 'retained') fixture.typed = typingDiagnostics.some(diagnostic => diagnostic.fixture === fixture.index) ? 'known-inherited-literal-diagnostic' : 'accepted';
  const lines = generatedTypes.split('\n');
  for (const diagnostic of [...typingDiagnostics].sort((a, b) => b.line - a.line)) lines.splice(diagnostic.line, 0, ' '.repeat(lines[diagnostic.line].length - lines[diagnostic.line].trimStart().length) + '// @ts-expect-error B inherited declaration omission: ' + diagnostic.key + '; see configuration-acceptance.json typingBacklog');
  generatedTypes = lines.join('\n');
  if (process.argv.includes('--check')) { if (fs.readFileSync(generatedFile, 'utf8') !== generatedTypes) throw Error('Typed baseline fixtures are stale'); }
  else fs.writeFileSync(generatedFile, generatedTypes);
  const ledger = { baseline: inventory.baseline, counts: { paths: counts(entries), fixtures: counts(fixtures), unresolved: unresolved.length, excludedFiles: excludedFiles.length, environmentReads: environmentReads.length, strictShapes: strictShapes.length, typedFixtures: counts(fixtures.filter(fixture => fixture.classification === 'retained').map(fixture => ({ classification: fixture.typed }))), inheritedTypingDiagnostics: typingDiagnostics.length }, entries, fixtures, unresolved, excludedFiles, environmentReads, strictShapes, typingBacklog: declarations, typingDiagnostics };
  const output = JSON.stringify(ledger, null, 2) + '\n';
  const destination = path.join(__dirname, 'configuration-acceptance.json');
  if (process.argv.includes('--check')) { if (fs.readFileSync(destination, 'utf8') !== output) throw Error('Configuration acceptance ledger is stale'); }
  else fs.writeFileSync(destination, output);
  console.log(JSON.stringify(ledger.counts));
  const uncovered = entries.filter(entry => entry.classification === 'retained' && (!entry.schema || !entry.typed));
  if (uncovered.length) { console.error(JSON.stringify(uncovered, null, 2)); process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
}
