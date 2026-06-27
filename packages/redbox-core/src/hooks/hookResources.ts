import fs from 'fs';
import path from 'path';
import { getHookPrecedenceOrder } from './hookDiscovery';

export interface RedboxHookResource {
  name: string;
  rootPath: string;
  packageJsonPath: string;
  listedPriorityIndex?: number;
  viewsPath?: string;
  assetsPath?: string;
}

export interface ResolvedHookFile {
  rootPath: string;
  absolutePath: string;
  relativePath: string;
}

export interface ResolveHookFileOptions {
  extension?: string | false;
  roots?: string[];
}

function safeDirPath(dirPath: string): string | undefined {
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory() ? dirPath : undefined;
  } catch {
    return undefined;
  }
}

function normalizeResourcePath(resourcePath: string, extension: string | false): string | null {
  const withoutQuery = String(resourcePath ?? '').split('?')[0]?.trim() ?? '';
  if (!withoutQuery || withoutQuery.includes('\0') || withoutQuery.includes('\\')) {
    return null;
  }

  const withoutLeadingSlash = withoutQuery.replace(/^\/+/, '');
  if (!withoutLeadingSlash) {
    return null;
  }

  const normalizedParts: string[] = [];
  for (const part of withoutLeadingSlash.split('/')) {
    if (!part) {
      continue;
    }
    let decodedPart: string;
    try {
      decodedPart = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (
      !decodedPart ||
      decodedPart === '.' ||
      decodedPart === '..' ||
      decodedPart.includes('\0') ||
      decodedPart.includes('/') ||
      decodedPart.includes('\\')
    ) {
      return null;
    }
    normalizedParts.push(decodedPart);
  }

  if (normalizedParts.length === 0) {
    return null;
  }

  let normalizedPath = normalizedParts.join('/');
  if (extension && path.posix.extname(normalizedPath) === '') {
    normalizedPath += extension.startsWith('.') ? extension : `.${extension}`;
  }
  return normalizedPath;
}

function resolveFileFromRoot(rootPath: string, relativePath: string): ResolvedHookFile | null {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedFilePath = path.resolve(resolvedRoot, ...relativePath.split('/'));
  if (resolvedFilePath !== resolvedRoot && !resolvedFilePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }

  try {
    const stat = fs.statSync(resolvedFilePath);
    if (!stat.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    rootPath: resolvedRoot,
    absolutePath: resolvedFilePath,
    relativePath,
  };
}

function resolveFileFromRoots(roots: string[], resourcePath: string, extension: string | false): ResolvedHookFile | null {
  const normalizedPath = normalizeResourcePath(resourcePath, extension);
  if (!normalizedPath) {
    return null;
  }

  for (const root of roots) {
    const resolvedFile = resolveFileFromRoot(root, normalizedPath);
    if (resolvedFile) {
      return resolvedFile;
    }
  }
  return null;
}

export function discoverRedboxHookResources(appPath: string): RedboxHookResource[] {
  const resolvedAppPath = path.resolve(appPath);
  const resources: RedboxHookResource[] = [];
  for (const hookPackage of getHookPrecedenceOrder(resolvedAppPath)) {
    const hookRootPath = hookPackage.rootPath;
    const viewsPath = safeDirPath(path.join(hookRootPath, 'views'));
    const assetsPath = safeDirPath(path.join(hookRootPath, 'assets'));
    if (!viewsPath && !assetsPath) {
      continue;
    }

    resources.push({
      name: hookPackage.name,
      rootPath: hookRootPath,
      packageJsonPath: hookPackage.packageJsonPath,
      ...(typeof hookPackage.listedPriorityIndex === 'number' ? { listedPriorityIndex: hookPackage.listedPriorityIndex } : {}),
      viewsPath,
      assetsPath,
    });
  }

  return resources;
}

export function getHookViewRoots(appPath: string): string[] {
  return discoverRedboxHookResources(appPath)
    .filter(resource => resource.viewsPath)
    .map(resource => resource.viewsPath as string);
}

export function getHookAssetRoots(appPath: string): string[] {
  return discoverRedboxHookResources(appPath)
    .filter(resource => resource.assetsPath)
    .map(resource => resource.assetsPath as string);
}

export function resolveHookViewFile(
  appPath: string,
  viewPath: string,
  options: ResolveHookFileOptions = {}
): ResolvedHookFile | null {
  const roots = options.roots ?? getHookViewRoots(appPath);
  return resolveFileFromRoots(roots, viewPath, options.extension ?? '.ejs');
}

export function resolveHookAssetFile(
  appPath: string,
  assetPath: string,
  options: ResolveHookFileOptions = {}
): ResolvedHookFile | null {
  const roots = options.roots ?? getHookAssetRoots(appPath);
  return resolveFileFromRoots(roots, assetPath, options.extension ?? false);
}
