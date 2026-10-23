// Run after the core build. Offline inventory, never a split router or dispatcher.
const { execFileSync } = require('node:child_process');
const { writeFileSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../../../..');
const { routes } = require(resolve(root, 'packages/redbox-core/dist/config/routes.config.js'));
const { registerCoreApiRoutes } = require(resolve(root, 'packages/redbox-core/dist/api-routes/route-registry.js'));
const { identityAdministrationRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/identityAdministration.js'));
const { queryWriteRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/queryWrites.js'));
const { vocabularyIntegrationRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/vocabularyIntegrations.js'));
const { configurationReadRoutes, appConfigFormReadRoute } = require(resolve(root, 'packages/redbox-core/dist/http/express/configuration.js'));
const { recordReadRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/recordReads.js'));
const { queryReadRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/queryReads.js'));
const { configurationWriteRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/configurationWrites.js'));
const { formDeliveryRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/formDelivery.js'));
const { csrfTokenRoute } = require(resolve(root, 'packages/redbox-core/dist/http/express/csrf.js'));
const { authenticationRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/login.js'));
const { metadataReadRoutes } = require(resolve(root, 'packages/redbox-core/dist/http/express/metadata.js'));
if (global.sails || Object.keys(require.cache).some(p => /node_modules\/sails\//.test(p)))
  throw Error('Inventory must remain offline without Sails.');

function owner(pattern, controller, action) {
  const path = pattern.toLowerCase();
  const target = controller.replace(/^webservice\//, '').replace(/Controller$/, '');
  const read = /^(get|head|options) /i.test(pattern);
  const page = /^(render|index$|editAppConfig$|editor$|login$|profile$)/i.test(action);
  if (path.includes('/csrftoken')) return 'SR-039';
  if (path.includes('/user/info') || path.includes('/user/begin_oidc')) return 'SR-038';
  if (
    target === 'Record' &&
    /^(getForm|getAllTypes|getType|getWorkflowSteps|getAllDashboardTypes|getDashboardType|getDashboardView|getDashboardViewSettings|getDashboardWorkflowSettings)$/.test(
      action
    )
  )
    return 'SR-032';
  if (target === 'Record' && /^(edit|view|redirectLegacyConsolidatedDashboard)$/.test(action)) return 'SR-040';
  if (target === 'DynamicAsset') return 'SR-040';
  if (target === 'DashboardConfig') return action === 'editor' ? 'SR-040' : 'SR-032';
  if (/companion|\/tus/.test(path)) return 'SR-042';
  if (/subscribe|unsubscribe/.test(action) || target === 'Asynch') return 'SR-043';
  if (/upload|attachment|datastream/i.test(action)) return 'SR-041';
  if (target === 'Admin' && /^(rolesIndex|usersIndex|harvestRunsIndex)$/.test(action)) return 'SR-040';
  if (target === 'Vocabulary' && action === 'manager') return 'SR-040';
  // These actions receive multipart files despite having no 'upload' in their names.
  if (/^(Branding|BrandingApp)$/.test(target) && /^(logo|favicon)$/.test(action)) return 'SR-041';
  if (target === 'User' && action === 'login') return 'SR-040';
  if (target === 'User' && /login|logout|authenticate|oidc|aaf|jwt|callback/i.test(action)) return 'SR-038';
  if (target === 'RecordType') return 'SR-029';
  if (page || target === 'RenderView' || /render|theme|typeface|font|asset/i.test(action)) return 'SR-040';
  if (/^(FormManagement|Forms|Translation|AppConfig|Config|WorkflowSteps|WorkspaceTypes)$/.test(target))
    return 'SR-032';
  if (
    /^(Report|Reports|Search|SearchQuery|NamedQuery|IntegrationAudit|HarvestRun|HarvestRuns|Harvester|RecordAudit|Siem|Asynchs)$/.test(
      target
    )
  )
    return read || /^(search|query|preview|execute)/i.test(action) ? 'SR-033' : 'SR-036';
  if (/^(Record|RecordSchema|Export)$/.test(target))
    return read || /^(get|list|search|export|download)/i.test(action) ? 'SR-034' : 'SR-035';
  if (
    /^(Email|BrandingApp|UserManagement|Branding|FormVocabulary|Vocab|Vocabulary|Admin|User|Users|Workspace|WorkspaceAsync|WorkspaceApp|Action|Notification|Notifications|Figshare|FigshareVocabulary|FigshareCrosswalk|Orcid|Doi|Raid|Oni|Mint|RDMP)$/.test(
      target
    )
  )
    return 'SR-036';
  if (!controller) return 'SR-040'; // root/view/redirect declarations, including hook root override
  throw Error('Assign a task to ' + pattern + ': ' + controller + '.' + action);
}

const contracts = new Set(registerCoreApiRoutes().map(r => r.method.toUpperCase() + ' ' + r.path));
const migratedRoutes = new Set([...recordReadRoutes, ...queryReadRoutes, ...identityAdministrationRoutes, ...queryWriteRoutes, ...vocabularyIntegrationRoutes, ...configurationReadRoutes, ...configurationWriteRoutes, appConfigFormReadRoute, ...metadataReadRoutes, ...formDeliveryRoutes, ...authenticationRoutes, csrfTokenRoute].map(route => route.method.toUpperCase() + ' ' + route.path));
const entries = Object.entries(routes)
  .map(([pattern, target]) => {
    const controller =
      typeof target === 'object'
        ? (target.controller ?? '')
        : typeof target === 'string' && !target.startsWith('/')
          ? target.split('.')[0]
          : '';
    const action =
      typeof target === 'object'
        ? (target.action ?? '')
        : typeof target === 'string'
          ? (target.split('.')[1] ?? '')
          : '';
    const normalized = /^[a-z]+ /i.test(pattern) ? pattern.replace(/^[a-z]+/i, v => v.toUpperCase()) : 'ALL ' + pattern;
    const task = owner(normalized, controller, action);
    const prerequisites =
      task === 'SR-035'
        ? ['SR-038', 'SR-039', 'SR-041', 'SR-043']
        : task === 'SR-036' || (task === 'SR-032' && !/^(GET|HEAD|OPTIONS) /.test(normalized))
          ? ['SR-038', 'SR-039']
          : task === 'SR-041'
            ? ['SR-034', 'SR-035', 'SR-038', 'SR-039']
            : task === 'SR-042'
              ? ['SR-034', 'SR-038', 'SR-041']
              : task === 'SR-043'
                ? ['SR-034', 'SR-038']
                : [];
    if (task === 'SR-036' && action === 'linkAccounts') prerequisites.push('SR-035');
    // Legacy GET is an unsafe cache mutation, not an ordinary administration read.
    if (task === 'SR-036' && action === 'refreshCachedResources') prerequisites.push('explicit-method/CSRF migration');
    if (['SR-033', 'SR-034'].includes(task) && !/^(GET|HEAD|OPTIONS) /.test(normalized)) prerequisites.push('SR-039');
    return {
      route: normalized,
      target: controller
        ? controller + '.' + action
        : typeof target === 'function'
          ? 'inline CSRF token handler'
          : target,
      contract: contracts.has(normalized),
      task,
      prerequisites,
      standalone: task === 'SR-029' || migratedRoutes.has(normalized),
    };
  })
  .sort((a, b) => a.route.localeCompare(b.route));
// The development hook's only legacy route is a root redirect; PDF contributes no HTTP routes yet.
entries.push({
  route: 'ALL /',
  target: '/default/rdmp/home',
  provider: 'redbox-hook-dev',
  task: 'SR-040',
  prerequisites: [],
  standalone: false,
});
const additions = authenticationRoutes.filter(route => !entries.some(entry => entry.route === route.method.toUpperCase() + ' ' + route.path)).map(route => ({ route: route.method.toUpperCase() + ' ' + route.path, target: route.controller + '.' + route.action, task: 'SR-038', prerequisites: ['SR-039'], standalone: true }));
const result = {
  additions,
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  description:
    'Core effective routes plus bundled development redirect. Institution routes require SR-005 designation. ALL denotes legacy any-method declarations; action semantics determine mutation prerequisites.',
  counts: entries.reduce((counts, e) => {
    counts[e.task] = (counts[e.task] ?? 0) + 1;
    return counts;
  }, {}),
  entries,
};
const path = resolve(__dirname, 'route-inventory.json');
if (process.argv.includes('--check')) {
  const recorded = JSON.parse(readFileSync(path, 'utf8'));
  if (JSON.stringify(recorded.entries) !== JSON.stringify(entries) || JSON.stringify(recorded.additions ?? []) !== JSON.stringify(additions))
    throw Error('Route inventory is stale; rebuild and regenerate.');
} else writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ routes: entries.length, counts: result.counts, check: process.argv.includes('--check') }));
