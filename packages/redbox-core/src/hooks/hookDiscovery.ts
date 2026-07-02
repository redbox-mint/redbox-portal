import fs from 'fs';
import path from 'path';

export interface RedboxHookPackageMetadata {
  name: string;
  module: string;
  packageJsonPath: string;
  rootPath: string;
  sails: Record<string, unknown>;
  listedPriorityIndex?: number;
}

export interface RedboxHookOrderConfig {
  hookLoadPriority: string[];
}

export interface RedboxHookDiscoveryOptions {
  includeDevDependencies?: boolean;
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  hookLoadPriority?: unknown;
  sails?: Record<string, unknown>;
};

type HookDiscoveryCacheEntry = {
  packageJsonContent: string;
  dependencySignature: string;
  hooks: RedboxHookPackageMetadata[];
};

const hookDiscoveryCache = new Map<string, HookDiscoveryCacheEntry>();

const hookCapabilityFlags = [
  'hasModels',
  'hasPolicies',
  'hasServices',
  'hasControllers',
  'hasWebserviceControllers',
  'hasBootstrap',
  'hasConfig',
  'hasFormConfigs',
  'hasMigrations',
  'hasApiRoutes',
];

function warn(message: string): void {
  console.warn(`[redbox-loader:warn] ${message}`);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function isRedboxHookPackage(packageJson: PackageJson): boolean {
  const sailsConfig = packageJson.sails;
  if (!sailsConfig || typeof sailsConfig !== 'object') {
    return false;
  }
  if (sailsConfig.isHook === true) {
    return true;
  }
  return hookCapabilityFlags.some(flag => sailsConfig[flag] === true);
}

function resolveDependencyPackageJson(appPath: string, dependencyName: string): string | null {
  try {
    return require.resolve(`${dependencyName}/package.json`, { paths: [appPath] }) as string;
  } catch {
    return null;
  }
}

function buildDependencySignature(appPath: string, dependencyNames: string[]): string {
  return dependencyNames
    .map(dependencyName => {
      const packageJsonPath = resolveDependencyPackageJson(appPath, dependencyName);
      if (!packageJsonPath) {
        return `${dependencyName}:missing`;
      }
      try {
        return `${dependencyName}:${packageJsonPath}:${fs.readFileSync(packageJsonPath, 'utf8')}`;
      } catch {
        return `${dependencyName}:${packageJsonPath}:unreadable`;
      }
    })
    .join('\n');
}

function getAppPackageJsonContent(appPath: string): string | null {
  try {
    return fs.readFileSync(path.join(appPath, 'package.json'), 'utf8');
  } catch {
    return null;
  }
}

function normalizeHookLoadPriority(value: unknown): string[] {
  if (typeof value === 'undefined') {
    return [];
  }
  if (!Array.isArray(value)) {
    warn('package.json hookLoadPriority must be an array of package names; ignoring value.');
    return [];
  }

  const seen = new Set<string>();
  const priority: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      warn(`Ignoring invalid hookLoadPriority entry ${JSON.stringify(entry)}; expected a package name string.`);
      continue;
    }
    const packageName = entry.trim();
    if (seen.has(packageName)) {
      warn(`Duplicate hookLoadPriority entry "${packageName}"; keeping first occurrence.`);
      continue;
    }
    seen.add(packageName);
    priority.push(packageName);
  }
  return priority;
}

export function readHookLoadPriority(appPath: string): string[] {
  const appPackageJson = readJsonFile<PackageJson>(path.join(path.resolve(appPath), 'package.json'));
  return normalizeHookLoadPriority(appPackageJson?.hookLoadPriority);
}

export function compareHookPrecedence(
  a: RedboxHookPackageMetadata,
  b: RedboxHookPackageMetadata
): number {
  const aListed = typeof a.listedPriorityIndex === 'number';
  const bListed = typeof b.listedPriorityIndex === 'number';

  if (aListed && bListed) {
    return (a.listedPriorityIndex as number) - (b.listedPriorityIndex as number);
  }
  if (aListed) {
    return -1;
  }
  if (bListed) {
    return 1;
  }

  return b.name.localeCompare(a.name);
}

export function discoverRedboxHookPackages(
  appPath: string,
  options: RedboxHookDiscoveryOptions = {}
): RedboxHookPackageMetadata[] {
  const resolvedAppPath = path.resolve(appPath);
  const packageJsonContent = getAppPackageJsonContent(resolvedAppPath);
  if (!packageJsonContent) {
    hookDiscoveryCache.set(resolvedAppPath, { packageJsonContent: '', dependencySignature: '', hooks: [] });
    return [];
  }

  let appPackageJson: PackageJson;
  try {
    appPackageJson = JSON.parse(packageJsonContent) as PackageJson;
  } catch {
    hookDiscoveryCache.set(resolvedAppPath, { packageJsonContent, dependencySignature: '', hooks: [] });
    return [];
  }

  const dependencies = {
    ...(appPackageJson.dependencies ?? {}),
    ...(options.includeDevDependencies === false ? {} : (appPackageJson.devDependencies ?? {})),
  };
  const dependencyNames = Object.keys(dependencies).sort();
  const dependencySignature = buildDependencySignature(resolvedAppPath, dependencyNames);
  const cached = hookDiscoveryCache.get(resolvedAppPath);
  if (
    cached?.packageJsonContent === packageJsonContent
    && cached.dependencySignature === dependencySignature
  ) {
    return [...cached.hooks];
  }

  const hookLoadPriority = normalizeHookLoadPriority(appPackageJson.hookLoadPriority);
  const listedPriorityIndexes = new Map(hookLoadPriority.map((name, index) => [name, index]));

  const hooks: RedboxHookPackageMetadata[] = [];
  for (const dependencyName of dependencyNames) {
    const packageJsonPath = resolveDependencyPackageJson(resolvedAppPath, dependencyName);
    if (!packageJsonPath) {
      continue;
    }

    const dependencyPackageJson = readJsonFile<PackageJson>(packageJsonPath);
    if (!dependencyPackageJson || !isRedboxHookPackage(dependencyPackageJson)) {
      continue;
    }

    const listedPriorityIndex = listedPriorityIndexes.get(dependencyName);
    hooks.push({
      name: dependencyName,
      module: dependencyName,
      packageJsonPath,
      rootPath: path.dirname(packageJsonPath),
      sails: dependencyPackageJson.sails ?? {},
      ...(typeof listedPriorityIndex === 'number' ? { listedPriorityIndex } : {}),
    });
  }

  const installedHookNames = new Set(hooks.map(hook => hook.name));
  for (const packageName of hookLoadPriority) {
    if (!installedHookNames.has(packageName)) {
      warn(`hookLoadPriority references "${packageName}", but it is not an installed ReDBox hook.`);
    }
  }

  const orderedHooks = hooks.sort(compareHookPrecedence);
  hookDiscoveryCache.set(resolvedAppPath, { packageJsonContent, dependencySignature, hooks: orderedHooks });
  return [...orderedHooks];
}

export function getHookPrecedenceOrder(appPath: string): RedboxHookPackageMetadata[] {
  return discoverRedboxHookPackages(appPath);
}

export function getHookProcessingOrder(appPath: string): RedboxHookPackageMetadata[] {
  return [...getHookPrecedenceOrder(appPath)].reverse();
}
