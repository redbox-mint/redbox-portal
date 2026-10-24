import * as path from 'path';
import * as fs from 'fs';
import { Project, SyntaxKind, ObjectLiteralExpression, ArrayLiteralExpression } from 'ts-morph';
import { RedboxPaths } from './paths';

export type NavigationTarget = 'menu' | 'menuRoot' | 'homePanel' | 'adminSection' | 'adminFooter';

export interface NavigationMapping {
  action?: string;
  target: NavigationTarget;
  containerId?: string;
  itemId?: string;
  labelKey: string;
  href?: string;
}

export interface LanguageDefaultEntry {
  key: string;
  value: string;
  language?: string;
}

export async function updateControllerIndex(params: {
  project: Project;
  paths: RedboxPaths;
  root: string;
  controllerName: string;
  className: string;
  webservice: boolean;
  dryRun: boolean;
}): Promise<void> {
  const indexPath = path.join(params.paths.coreTypes, 'src', 'controllers', 'index.ts');
  const importPath = params.webservice ? `./webservice/${params.controllerName}` : `./${params.controllerName}`;
  await addPublicExport(params.project, indexPath, importPath, params.dryRun);
}

async function addPublicExport(
  project: Project,
  indexPath: string,
  importPath: string,
  dryRun: boolean
): Promise<void> {
  const sourceFile = project.addSourceFileAtPathIfExists(indexPath) ?? project.createSourceFile(indexPath, '');
  if (!sourceFile.getExportDeclaration(d => d.getModuleSpecifierValue() === importPath))
    sourceFile.addExportDeclaration({ moduleSpecifier: importPath });
  sourceFile.formatText();
  if (!dryRun) await sourceFile.save();
}

export async function updateServiceIndex(params: {
  project: Project;
  paths: RedboxPaths;
  root: string;
  serviceName: string;
  className: string;
  dryRun: boolean;
}): Promise<void> {
  await addPublicExport(
    params.project,
    path.join(params.paths.coreTypes, 'src', 'services', 'index.ts'),
    `./${params.serviceName}`,
    params.dryRun
  );
}

export async function updateRoutes(params: {
  project: Project;
  paths: RedboxPaths;
  root: string;
  route: string;
  controllerName: string;
  action: string;
  webservice: boolean;
  csrf?: boolean;
  dryRun: boolean;
}): Promise<void> {
  if (params.csrf === false)
    throw new Error('Generated extension routes cannot disable CSRF. Bind the selected host policy explicitly.');
  const [method, ...parts] = params.route.includes(' ') ? params.route.trim().split(/\s+/) : ['get', params.route];
  const routePath = parts.join(' ');
  if (
    !['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method.toLowerCase()) ||
    !routePath.startsWith('/')
  )
    throw new Error('An extension route requires an explicit supported HTTP method and absolute path.');
  const routesPath = path.join(params.paths.coreTypes, 'src', 'config', 'extensionRoutes.ts');
  const sourceFile =
    params.project.addSourceFileAtPathIfExists(routesPath) ??
    params.project.createSourceFile(
      routesPath,
      `import type { ExtensionRoute } from '@researchdatabox/redbox-core/extensions';\n// Include these declarations in registerRedboxExtension().routes and bind each named handler/policy.\nexport const routes: ExtensionRoute[] = [];\n`
    );
  const routes = sourceFile
    .getVariableDeclarationOrThrow('routes')
    .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const name = `${params.webservice ? 'api-' : ''}${params.controllerName}-${params.action}`;
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(name))
    throw new Error('Generated route names must be bounded extension identifiers; provide a shorter named handler.');
  const duplicate = routes
    .getElements()
    .some(el =>
      el.isKind(SyntaxKind.ObjectLiteralExpression) && getStringProp(el, 'name') === name
    );
  const access = ['noCache', 'brandingAndPortal', 'isWebServiceAuthenticated', 'brandActor', 'checkAuth'];
  if (!['get', 'head', 'options'].includes(method.toLowerCase())) access.push('csrf');
  if (!duplicate)
    routes.addElement(
      `{ name: ${JSON.stringify(name)}, method: ${JSON.stringify(method.toLowerCase())}, path: ${JSON.stringify(routePath)}, handler: ${JSON.stringify(name)}, access: ${JSON.stringify(access)} }`
    );
  sourceFile.formatText();
  if (!params.dryRun) await sourceFile.save();
}

export async function updateAuth(params: {
  project: Project;
  paths: RedboxPaths;
  root: string;
  route: string;
  auth: string[];
  dryRun: boolean;
}): Promise<void> {
  const authPath = path.join(params.paths.coreTypes, 'src', 'config', 'auth.config.ts');
  if (!fs.existsSync(authPath)) return;

  const sourceFile = params.project.addSourceFileAtPath(authPath);
  const authVar = sourceFile.getVariableDeclaration('auth');
  if (!authVar) return;

  const initializer = authVar.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!initializer) return;

  const rulesProp = initializer.getProperty('rules');
  if (!rulesProp || !rulesProp.asKind(SyntaxKind.PropertyAssignment)) return;

  const rulesArray = rulesProp
    .asKind(SyntaxKind.PropertyAssignment)!
    .getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!rulesArray) return;

  // Check existing roles for warning
  const authRolesProp = initializer.getProperty('roles');
  let existingRoles: string[] = [];
  if (authRolesProp && authRolesProp.asKind(SyntaxKind.PropertyAssignment)) {
    const rolesArray = authRolesProp
      .asKind(SyntaxKind.PropertyAssignment)!
      .getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (rolesArray) {
      existingRoles = rolesArray
        .getElements()
        .map((el: any) => {
          if (el.getKind() === SyntaxKind.ObjectLiteralExpression) {
            return (
              el
                .asKind(SyntaxKind.ObjectLiteralExpression)!
                .getProperty('name')
                ?.asKind(SyntaxKind.PropertyAssignment)
                ?.getInitializer()
                ?.getText()
                .replace(/['"]/g, '') || ''
            );
          }
          return '';
        })
        .filter(r => r !== '');
    }
  }

  const trimmedRoute = params.route.trim();
  if (!trimmedRoute) {
    throw new Error('Route cannot be empty or whitespace.');
  }
  const routePath = trimmedRoute.split(' ').pop();
  if (!routePath) {
    throw new Error(`Route is missing a path segment: '${trimmedRoute}'.`);
  }

  for (const role of params.auth) {
    if (existingRoles.length > 0 && !existingRoles.includes(role)) {
      console.warn(
        `Warning: Role '${role}' not found in auth.roles. It will still be added to rules, but may not function as expected.`
      );
    }
    // Check if rule already exists or is covered by a wildcard
    const isCovered = rulesArray.getElements().some((el: any) => {
      if (el.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const obj = el.asKind(SyntaxKind.ObjectLiteralExpression)!;
        const existingPathRaw = obj
          .getProperty('path')
          ?.asKind(SyntaxKind.PropertyAssignment)
          ?.getInitializer()
          ?.getText();
        const existingRoleRaw = obj
          .getProperty('role')
          ?.asKind(SyntaxKind.PropertyAssignment)
          ?.getInitializer()
          ?.getText();

        if (!existingPathRaw || !existingRoleRaw) return false;

        const existingPath = existingPathRaw.replace(/['"]/g, '');
        const existingRole = existingRoleRaw.replace(/['"]/g, '');

        if (existingRole !== role) return false;

        // Check path coverage
        let covered = false;
        if (existingPath === routePath) {
          covered = true;
        } else if (existingPath.endsWith('(/*)') || existingPath.endsWith('/*')) {
          const baseUrl = existingPath.replace(/(\(\/\*\)|\/\*)$/, '');
          if (routePath.startsWith(baseUrl)) {
            covered = true;
          }
        }

        if (!covered) return false;

        // Check permissions
        const verb = trimmedRoute.includes(' ') ? trimmedRoute.split(' ')[0].toLowerCase() : 'get';
        const requestedAccess = verb === 'get' ? 'read' : 'update';

        const canUpdate =
          obj.getProperty('can_update')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()?.getText() === 'true';
        const canRead =
          obj.getProperty('can_read')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()?.getText() === 'true';

        if (requestedAccess === 'read') {
          return canRead || canUpdate;
        } else {
          return canUpdate;
        }
      }
      return false;
    });

    if (!isCovered) {
      const verb = trimmedRoute.includes(' ') ? trimmedRoute.split(' ')[0].toLowerCase() : 'get';
      const permission = verb === 'get' ? 'can_read: true' : 'can_update: true';
      console.log(`  [AUTH] Adding rule for ${role} -> ${routePath} (${permission})`);
      rulesArray.addElement(`{ path: '${routePath}', role: '${role}', ${permission} }`);
    } else {
      console.log(`  [AUTH] Rule for ${role} -> ${routePath} already covered by existing rule`);
    }
  }

  sourceFile.formatText();
  if (!params.dryRun) {
    await sourceFile.save();
    console.log(`  [UPDATE] ${path.relative(params.root, authPath)}`);
  }
}

function getStringProp(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (!prop || !prop.asKind(SyntaxKind.PropertyAssignment)) return undefined;
  const initializer = prop.asKind(SyntaxKind.PropertyAssignment)!.getInitializer();
  return initializer ? initializer.getText().replace(/['"]/g, '') : undefined;
}

function getArrayProp(obj: ObjectLiteralExpression, name: string): ArrayLiteralExpression | undefined {
  const prop = obj.getProperty(name);
  if (!prop || !prop.asKind(SyntaxKind.PropertyAssignment)) return undefined;
  return (
    prop.asKind(SyntaxKind.PropertyAssignment)!.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression) || undefined
  );
}

function addNavItemToArray(array: ArrayLiteralExpression, item: NavigationMapping): boolean {
  const hasDuplicate = array.getElements().some((el: any) => {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) return false;
    const obj = el.asKind(SyntaxKind.ObjectLiteralExpression)!;
    const existingId = getStringProp(obj, 'id');
    const existingHref = getStringProp(obj, 'href');
    if (item.itemId && existingId === item.itemId) return true;
    if (item.href && existingHref === item.href) return true;
    return false;
  });

  if (hasDuplicate) return false;

  const props: string[] = [];
  if (item.itemId) props.push(`id: '${item.itemId}'`);
  props.push(`labelKey: '${item.labelKey}'`);
  if (item.href) props.push(`href: '${item.href}'`);
  array.addElement(`{ ${props.join(', ')} }`);
  return true;
}

function findMenuItemById(array: ArrayLiteralExpression, id: string): ObjectLiteralExpression | undefined {
  for (const el of array.getElements()) {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const obj = el.asKind(SyntaxKind.ObjectLiteralExpression)!;
    const itemId = getStringProp(obj, 'id');
    if (itemId === id) return obj;
    const childrenArray = getArrayProp(obj, 'children');
    if (childrenArray) {
      const nested = findMenuItemById(childrenArray, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

function normalizeNavHref(routePath: string): string {
  if (!routePath) return routePath;
  return routePath.replace(/^\/:branding\/:portal(\/|$)/, '/');
}

export async function updateNavigationConfig(params: {
  project: Project;
  paths: RedboxPaths;
  root: string;
  mapping: NavigationMapping;
  dryRun: boolean;
}): Promise<void> {
  const mapping = { ...params.mapping };
  if (mapping.href) {
    mapping.href = normalizeNavHref(mapping.href);
  }

  if (mapping.target === 'menu' || mapping.target === 'menuRoot') {
    const menuPath = path.join(params.paths.coreTypes, 'src', 'configmodels', 'MenuConfig.ts');
    if (!fs.existsSync(menuPath)) return;
    const sourceFile = params.project.addSourceFileAtPath(menuPath);
    const defaultVar = sourceFile.getVariableDeclaration('DEFAULT_MENU_CONFIG');
    if (!defaultVar) return;
    const initializer = defaultVar.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!initializer) return;
    const itemsArray = getArrayProp(initializer, 'items');
    if (!itemsArray) return;

    let targetArray = itemsArray;
    if (mapping.target === 'menu' && mapping.containerId) {
      const parent = findMenuItemById(itemsArray, mapping.containerId);
      if (!parent) {
        console.warn(`  [NAV] Menu parent '${mapping.containerId}' not found. Skipping.`);
        return;
      }
      let childrenArray = getArrayProp(parent, 'children');
      if (!childrenArray) {
        parent.addPropertyAssignment({ name: 'children', initializer: '[]' });
        childrenArray = getArrayProp(parent, 'children');
      }
      if (!childrenArray) return;
      targetArray = childrenArray;
    }

    const added = addNavItemToArray(targetArray, mapping);
    if (added) {
      sourceFile.formatText();
      if (!params.dryRun) {
        await sourceFile.save();
        console.log(`  [UPDATE] ${path.relative(params.root, menuPath)}`);
      }
    }
    return;
  }

  if (mapping.target === 'homePanel') {
    const homePanelPath = path.join(params.paths.coreTypes, 'src', 'configmodels', 'HomePanelConfig.ts');
    if (!fs.existsSync(homePanelPath)) return;
    const sourceFile = params.project.addSourceFileAtPath(homePanelPath);
    const defaultVar = sourceFile.getVariableDeclaration('DEFAULT_HOME_PANEL_CONFIG');
    if (!defaultVar) return;
    const initializer = defaultVar.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!initializer) return;
    const panelsArray = getArrayProp(initializer, 'panels');
    if (!panelsArray) return;

    if (!mapping.containerId) {
      console.warn('  [NAV] Home panel target requires containerId (panel id). Skipping.');
      return;
    }

    const panel = panelsArray
      .getElements()
      .find((el: any) => {
        if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) return false;
        const obj = el.asKind(SyntaxKind.ObjectLiteralExpression)!;
        return getStringProp(obj, 'id') === mapping.containerId;
      })
      ?.asKind(SyntaxKind.ObjectLiteralExpression);

    if (!panel) {
      console.warn(`  [NAV] Home panel '${mapping.containerId}' not found. Skipping.`);
      return;
    }

    const itemsArray = getArrayProp(panel, 'items');
    if (!itemsArray) return;

    const added = addNavItemToArray(itemsArray, mapping);
    if (added) {
      sourceFile.formatText();
      if (!params.dryRun) {
        await sourceFile.save();
        console.log(`  [UPDATE] ${path.relative(params.root, homePanelPath)}`);
      }
    }
    return;
  }

  if (mapping.target === 'adminSection' || mapping.target === 'adminFooter') {
    const adminPath = path.join(params.paths.coreTypes, 'src', 'configmodels', 'AdminSidebarConfig.ts');
    if (!fs.existsSync(adminPath)) return;
    const sourceFile = params.project.addSourceFileAtPath(adminPath);
    const defaultVar = sourceFile.getVariableDeclaration('DEFAULT_ADMIN_SIDEBAR_CONFIG');
    if (!defaultVar) return;
    const initializer = defaultVar.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!initializer) return;

    let targetArray: ArrayLiteralExpression | undefined;
    if (mapping.target === 'adminFooter') {
      targetArray = getArrayProp(initializer, 'footerLinks');
    } else {
      const sectionsArray = getArrayProp(initializer, 'sections');
      if (!sectionsArray) return;
      if (!mapping.containerId) {
        console.warn('  [NAV] Admin section target requires containerId (section id). Skipping.');
        return;
      }
      const section = sectionsArray
        .getElements()
        .find((el: any) => {
          if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) return false;
          const obj = el.asKind(SyntaxKind.ObjectLiteralExpression)!;
          return getStringProp(obj, 'id') === mapping.containerId;
        })
        ?.asKind(SyntaxKind.ObjectLiteralExpression);

      if (!section) {
        console.warn(`  [NAV] Admin section '${mapping.containerId}' not found. Skipping.`);
        return;
      }
      targetArray = getArrayProp(section, 'items');
    }

    if (!targetArray) return;
    const added = addNavItemToArray(targetArray, mapping);
    if (added) {
      sourceFile.formatText();
      if (!params.dryRun) {
        await sourceFile.save();
        console.log(`  [UPDATE] ${path.relative(params.root, adminPath)}`);
      }
    }
    return;
  }
}

export async function updateLanguageDefaults(params: {
  root: string;
  entries: LanguageDefaultEntry[];
  dryRun: boolean;
}): Promise<void> {
  const defaultsRoot = path.join(params.root, 'language-defaults');
  if (!fs.existsSync(defaultsRoot)) return;

  const entries = params.entries || [];
  if (entries.length === 0) return;

  const languages = fs
    .readdirSync(defaultsRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(lang => fs.existsSync(path.join(defaultsRoot, lang, 'translation.json')));

  for (const entry of entries) {
    const targetLangs = entry.language ? [entry.language] : languages;
    for (const lang of targetLangs) {
      const translationPath = path.join(defaultsRoot, lang, 'translation.json');
      if (!fs.existsSync(translationPath)) continue;

      const raw = fs.readFileSync(translationPath, 'utf8');
      let json: Record<string, any> = {};
      try {
        json = JSON.parse(raw);
      } catch (err) {
        console.warn(`  [LANG] Failed to parse ${translationPath}. Skipping.`);
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(json, entry.key)) {
        continue;
      }

      const updated = { ...json, [entry.key]: entry.value };
      const indentMatch = raw.match(/\n(\s+)"[^\"]+"\s*:/);
      const indent = indentMatch ? indentMatch[1] : '  ';
      const output = JSON.stringify(updated, null, indent) + '\n';

      if (params.dryRun) {
        console.log(`  [LANG] ${path.relative(params.root, translationPath)} (dry run)`);
      } else {
        fs.writeFileSync(translationPath, output);
        console.log(`  [UPDATE] ${path.relative(params.root, translationPath)}`);
      }
    }
  }
}
