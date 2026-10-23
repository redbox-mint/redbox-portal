// Observe existing compiled functions; does not construct a portal or write config.
// Run after `npm --prefix packages/redbox-core run build` from the repository root.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = process.cwd();
const core = path.join(root, 'packages/redbox-core/dist');
const { mergeRedboxConfig } = require(path.join(core, 'loader'));
const discovery = require(path.join(core, 'hooks/hookDiscovery'));
const callback = () => 'approved executable value';
const ordinary = mergeRedboxConfig('ordinary', { items: ['a', 'b'], nested: { left: 1 }, callback }, { items: ['x'], nested: { right: 2 } });
assert.deepEqual(ordinary.items, ['x', 'b']);
assert.equal(ordinary.callback, callback);
const branded = mergeRedboxConfig('brandingConfigurationDefaults', { items: ['a', 'b'] }, { items: ['x'] });
assert.deepEqual(branded.items, ['x']);
const agenda = mergeRedboxConfig('agendaQueue', { jobs: [{ name: 'same', options: { a: 1 } }, { name: 'keep', fn: callback }] }, { jobs: { same: { options: { b: 2 } }, added: { enabled: true } } });
assert.deepEqual(Object.keys(agenda.jobs), ['same', 'keep', 'added']);
assert.equal(agenda.jobs.keep.fn, callback);
assert.deepEqual(agenda.jobs.same.options, { a: 1, b: 2 });

const routeOwner = {
  recordtypes: 'SR-029/SR-030', forms: 'SR-032', appconfig: 'SR-032', translation: 'SR-032',
  branding: 'SR-032/SR-040', 'dashboard-config': 'SR-032', vocabulary: 'SR-032',
  reports: 'SR-033', search: 'SR-033', 'search-query': 'SR-033', 'named-query': 'SR-033',
  'harvest-runs': 'SR-033/SR-036', 'integration-audit': 'SR-033', siem: 'SR-033/SR-036',
  records: 'SR-034/SR-035', 'record-schemas': 'SR-035/SR-039', export: 'SR-034',
  users: 'SR-036/SR-038', admin: 'SR-036/SR-039', notifications: 'SR-033/SR-036',
  'figshare-crosswalks': 'SR-036', 'figshare-vocabulary': 'SR-032/SR-036',
};
const registry = require(path.join(core, 'api-routes/route-registry'));
const registered = new Set(registry.registerCoreApiRoutes().map(route => `${route.method} ${route.path}`));
const groups = [];
for (const file of fs.readdirSync(path.join(core, 'api-routes/groups')).filter(file => file.endsWith('.js')).sort()) {
  const group = file.slice(0, -3);
  const arrays = Object.values(require(path.join(core, 'api-routes/groups', file))).filter(Array.isArray);
  const routes = arrays.flat().filter(route => route && typeof route.path === 'string' && typeof route.method === 'string');
  if (!routeOwner[group] && routes.length) throw new Error(`Unassigned route group: ${group}`);
  groups.push({ group, owner: routeOwner[group], routes: routes.map(route => ({ method: route.method, path: route.path, controller: route.controller, action: route.action, registered: registered.has(`${route.method} ${route.path}`) })) });
}
const coreRoutes = require(path.join(core, 'config/routes.config')).routes;
const corePolicies = require(path.join(core, 'config/policies.config')).policies;
function legacyOwner(route, target) {
  const descriptor = route + ' ' + (typeof target === 'string' ? target : JSON.stringify(target));
  if (/csrfToken/.test(descriptor)) return 'SR-039';
  if (/companion/i.test(descriptor)) return 'SR-042';
  if (/tus|attach|datastream/i.test(descriptor)) return 'SR-041/SR-042';
  if (/socket|subscribe|join/i.test(descriptor)) return 'SR-043';
  if (/user|login|logout|oidc|aaf/i.test(descriptor)) return 'SR-036/SR-038';
  if (/translation|locales|i18n|appconfig|form|workflow|types|record\/type/i.test(descriptor)) return 'SR-032';
  if (/report|search|named.query|history|audit|job/i.test(descriptor)) return 'SR-033';
  if (/RecordController|ExportController|workspaces/i.test(descriptor)) return 'SR-034/SR-035';
  return 'SR-040';
}
const routes = Object.entries(coreRoutes).map(([route, target]) => ({ route, target: typeof target === 'function' ? '[Function]' : target, owner: legacyOwner(route, target) }));
const hooks = discovery.getHookPrecedenceOrder(root).map(hook => ({ name: hook.name, metadata: hook.sails, listedPriorityIndex: hook.listedPriorityIndex ?? null, rootPath: path.relative(root, hook.rootPath) }));
async function characterizeSailsConfig() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-config-'));
  try {
    const config = path.join(temporary, 'config');
    fs.mkdirSync(path.join(config, 'env', 'selected'), { recursive: true });
    for (const [name, value] of [
      ['base.js', { base: true, winner: 'base' }],
      ['env/selected/part.js', { folder: true, winner: 'folder' }],
      ['env/selected.js', { file: true, winner: 'environment-file' }],
      ['local.js', { local: true, winner: 'local' }],
    ]) fs.writeFileSync(path.join(config, name), `module.exports.sample = ${JSON.stringify(value)};`);
    const app = { config: { appPath: temporary, paths: { config }, environment: 'selected', sample: { explicit: true, winner: 'explicit' } }, log: { silly() {} } };
    app.modules = require(path.join(root, 'node_modules/sails/lib/hooks/moduleloader'))(app);
    const loaded = await new Promise((resolve, reject) => app.modules.loadUserConfig((error, value) => error ? reject(error) : resolve(value)));
    assert.equal(loaded.sample.winner, 'local');
    assert.deepEqual(Object.keys(loaded.sample).sort(), ['base', 'file', 'folder', 'local', 'winner']);
    await new Promise((resolve, reject) => require(path.join(root, 'node_modules/sails/lib/hooks/userconfig'))(app).loadModules(error => error ? reject(error) : resolve()));
    assert.equal(app.config.sample.winner, 'explicit');
    return { loadedUserConfig: loaded.sample, afterExplicitOverrides: app.config.sample, note: 'Actual Sails moduleloader/userconfig functions over disposable config files; no Sails application, persistence, business bootstrap or listener was constructed.' };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
characterizeSailsConfig().then(precedence => {
  console.log(JSON.stringify({ sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version, host: 'No host: existing compiled loader/route and installed Sails config functions only', examples: { precedence, ordinary: { items: ordinary.items, nested: ordinary.nested, functionIdentityPreserved: ordinary.callback === callback }, branded, agenda: { names: Object.keys(agenda.jobs), mergedSameOptions: agenda.jobs.same.options, functionIdentityPreserved: agenda.jobs.keep.fn === callback } }, hooksHighToLow: hooks, contractRouteCount: registered.size, coreRouteTableCount: routes.length, groups, routes, corePolicyChains: corePolicies, limitation: 'Core configured route table only; institution config and runtime hook overrides not executed. This is characterization, not standalone runtime or HTTP parity evidence.' }, null, 2));
}).catch(error => { console.error(error); process.exitCode = 1; });
