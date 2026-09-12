import fs from 'node:fs';
import path from 'node:path';

export type ApplicationManifestEntry = {
  id: `A${string}`;
  project: string;
  sourceRoot: string;
  outputPath: string;
  route: string;
  persona: 'anonymous' | 'admin';
  usefulSelectors: string[];
  delayedDependency: string;
  journeySpec: string;
};

const app = (
  id: ApplicationManifestEntry['id'],
  project: string,
  route: string,
  usefulSelectors: string[],
  journeySpec: string
): ApplicationManifestEntry => {
  const shortName = project.replace('@researchdatabox/', '');
  return {
    id,
    project,
    sourceRoot: `projects/researchdatabox/${shortName}/src`,
    outputPath: `assets/angular/${shortName}`,
    route,
    persona: id === 'A01' ? 'anonymous' : 'admin',
    usefulSelectors,
    delayedDependency: '/dynamic/apiClientConfig',
    journeySpec,
  };
};

export const applicationManifest: readonly ApplicationManifestEntry[] = [
  app('A01', '@researchdatabox/local-auth', '/default/rdmp/user/login', ['#adminLogin', '#username', '#password'], 'local-auth.spec.ts'),
  app('A02', '@researchdatabox/export', '/default/rdmp/export', ['export input#after', 'export label:has-text("JSON")'], 'reports-and-export.spec.ts'),
  app('A03', '@researchdatabox/dashboard', '/default/rdmp/dashboard/rdmp', ['dashboard input[type="text"]', 'dashboard sort [role="button"]:has-text("Title")'], 'dashboard-and-search.spec.ts'),
  app('A04', '@researchdatabox/report', '/default/rdmp/admin/report/rdmpRecords', ['report label:has-text("Filter by title")', 'report record-table th:has-text("Title")'], 'reports-and-export.spec.ts'),
  app('A05', '@researchdatabox/report-config', '/default/rdmp/admin/reports', ['report-config button:has-text("Create report")', 'report-config tbody tr:has-text("rdmpRecords")'], 'reports-and-export.spec.ts'),
  app('A06', '@researchdatabox/manage-users', '/default/rdmp/admin/users', ['#manage-users-search', 'manage-users tbody tr:has-text("Local Admin")'], 'users-and-roles.spec.ts'),
  app('A07', '@researchdatabox/record-audit', '/default/rdmp/record/viewAudit/e2e-playwright-audit', ['record-audit #rb-audit-date-from:enabled', 'record-audit tbody tr:has-text("Created")'], 'audit-and-harvest.spec.ts'),
  app('A08', '@researchdatabox/admin-vocabulary', '/default/rdmp/admin/vocabulary/manager', ['admin-vocabulary input[type="search"]', 'admin-vocabulary button:has-text("Create vocabulary")'], 'vocabularies.spec.ts'),
  app('A09', '@researchdatabox/admin-figshare-vocabulary', '/default/rdmp/admin/integrations/figshare/vocabularies', ['admin-figshare-vocabulary button:has-text("Add Figshare source")', 'admin-figshare-vocabulary [role="tab"]:has-text("Crosswalks")'], 'vocabularies.spec.ts'),
  app('A10', '@researchdatabox/dashboard-config-editor', '/default/rdmp/admin/dashboard-config', ['dashboard-config-editor input[aria-label="Filter dashboard targets"]', 'dashboard-config-editor .dc-nav-item:has-text("standard")'], 'configuration-editors.spec.ts'),
  app('A11', '@researchdatabox/named-query-editor', '/default/rdmp/admin/named-query', ['#named-query-search', 'named-query-editor tbody tr:has-text("listRDMPRecords")'], 'configuration-editors.spec.ts'),
  app('A12', '@researchdatabox/manage-roles', '/default/rdmp/admin/roles', ['manage-roles input[aria-label="Search for name"]', 'manage-roles #role-Admin'], 'users-and-roles.spec.ts'),
  app('A13', '@researchdatabox/form', '/default/rdmp/record/e2e-initialisation-modes/edit', ['redbox-form label:has-text("Title")', 'redbox-form label:has-text("Calculated description")'], 'initialisation.spec.ts'),
  app('A14', '@researchdatabox/app-config', '/default/rdmp/admin/appconfig/edit/systemMessage', ['app-config input[type="text"]', 'app-config label:has-text("Message Title")'], 'portal-settings.spec.ts'),
  app('A15', '@researchdatabox/deleted-records', '/default/rdmp/admin/deletedRecords', ['deleted-records input#title', 'deleted-records h1:has-text("Deleted Records")'], 'deleted-records.spec.ts'),
  app('A16', '@researchdatabox/harvest-runs', '/default/rdmp/admin/harvest-runs', ['harvest-runs #harvest-runs-source-name', 'harvest-runs button:has-text("Apply filters")'], 'audit-and-harvest.spec.ts'),
  app('A17', '@researchdatabox/branding', '/default/rdmp/admin/branding', ['branding-admin-root #header-branding-background-color', 'branding-admin-root button:has-text("Generate Preview")'], 'portal-settings.spec.ts'),
  app('A18', '@researchdatabox/translation', '/default/rdmp/admin/translation', ['app-root #tx-search:enabled', 'app-root #lang-en'], 'portal-settings.spec.ts'),
  app('A19', '@researchdatabox/record-search', '/default/rdmp/record/search', ['record-search #basic-search-input', 'record-search button:has-text("Search Plans")'], 'dashboard-and-search.spec.ts'),
];

export function workspaceApplications(workspacePath = path.resolve('angular/angular.json')): string[] {
  const workspace = JSON.parse(fs.readFileSync(workspacePath, 'utf8')) as { projects?: Record<string, { projectType?: string }> };
  return Object.entries(workspace.projects ?? {}).filter(([, project]) => project.projectType === 'application').map(([name]) => name).sort();
}

export function validateApplicationManifest(projects = workspaceApplications()): void {
  const manifestProjects = applicationManifest.map(entry => entry.project);
  const manifestIds = applicationManifest.map(entry => entry.id);
  const duplicates = manifestProjects.filter((project, index) => manifestProjects.indexOf(project) !== index);
  const duplicateIds = manifestIds.filter((id, index) => manifestIds.indexOf(id) !== index);
  const missing = projects.filter(project => !manifestProjects.includes(project));
  const unknown = manifestProjects.filter(project => !projects.includes(project));
  const invalidEntries = applicationManifest
    .filter(entry =>
      !/^A(?:0[1-9]|1[0-9])$/.test(entry.id) ||
      !entry.route.startsWith('/') ||
      entry.usefulSelectors.length < 2 ||
      !entry.delayedDependency.startsWith('/') ||
      !entry.journeySpec.endsWith('.spec.ts')
    )
    .map(entry => entry.id);
  const workspacePath = path.resolve('angular/angular.json');
  const workspace = JSON.parse(fs.readFileSync(workspacePath, 'utf8')) as { projects?: Record<string, { projectType?: string; sourceRoot?: string; root?: string; architect?: { build?: { options?: { outputPath?: string | { base?: string } } } } }> };
  const invalidPaths = applicationManifest.filter(entry => {
    const project = workspace.projects?.[entry.project];
    const outputPath = project?.architect?.build?.options?.outputPath;
    const base = typeof outputPath === 'string' ? outputPath : outputPath?.base;
    return !project || project.sourceRoot !== entry.sourceRoot || base !== `../${entry.outputPath}`;
  }).map(entry => entry.project);
  if (
    duplicates.length ||
    duplicateIds.length ||
    missing.length ||
    unknown.length ||
    invalidEntries.length ||
    invalidPaths.length ||
    applicationManifest.length !== 19
  ) {
    throw new Error(
      `Playwright application manifest mismatch (duplicates=${duplicates.join(',')}; duplicateIds=${duplicateIds.join(',')}; missing=${missing.join(',')}; unknown=${unknown.join(',')}; invalidEntries=${invalidEntries.join(',')}; invalidPaths=${invalidPaths.join(',')}; count=${applicationManifest.length}).`
    );
  }
}
