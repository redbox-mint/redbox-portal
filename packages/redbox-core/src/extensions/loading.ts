import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPublicExtensionEntry, resolveExtensionExport } from './exports';

export interface InstalledExtension {
  readonly name: string;
  readonly root: string;
  readonly specifier: string;
  readonly parentURL: string;
}

export class ExtensionError extends Error {
  public constructor(
    public readonly provider: string,
    detail: string
  ) {
    super(`Extension ${provider}: ${detail}`);
    this.name = 'ExtensionError';
  }
}

type PackageManifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  redbox?: { extension?: string };
  hookLoadPriority?: string[];
};

/** Direct installed dependencies are the installation's extension allowlist. No source-tree fallback/cache. */
export async function discoverInstalledExtensions(
  appPath: string,
  options: { includeDevDependencies?: boolean } = {}
): Promise<{ extensions: InstalledExtension[]; hookLoadPriority: string[] }> {
  const parentURL = pathToFileURL(path.resolve(appPath, 'package.json')).href;
  const manifest = JSON.parse(await readFile(new URL(parentURL), 'utf8')) as PackageManifest;
  const resolve = createRequire(parentURL);
  const extensions: InstalledExtension[] = [];
  const dependencies = {
    ...manifest.dependencies,
    ...(options.includeDevDependencies ? manifest.devDependencies : {}),
  };
  for (const name of Object.keys(dependencies).sort()) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name))
      throw new ExtensionError('installation', 'invalid dependency package name');
    // Reading the installed manifest directly deliberately does not require a
    // public package.json export. Entrypoints below still use public exports.
    let installed: PackageManifest | undefined;
    let root = '';
    for (const directory of resolve.resolve.paths(name) ?? []) {
      root = path.join(directory, name);
      try {
        installed = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as PackageManifest;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new ExtensionError(name, 'cannot read installed package manifest');
      }
    }
    if (!installed) throw new ExtensionError(name, 'declared dependency is not installed');
    const entry = installed.redbox?.extension;
    if (entry === undefined) continue;
    if (!isPublicExtensionEntry(entry))
      throw new ExtensionError(name, 'redbox.extension must name a public package export ("." or "./extension")');
    extensions.push({ name, root, specifier: name + (entry === '.' ? '' : entry.slice(1)), parentURL });
  }
  const priority = manifest.hookLoadPriority ?? [];
  if (!Array.isArray(priority) || priority.some(name => typeof name !== 'string' || !name.trim()))
    throw new ExtensionError('installation', 'hookLoadPriority must contain package names');
  return { extensions, hookLoadPriority: [...new Set(priority.map(name => name.trim()))] };
}

/** Native import preserves TLA and ESM-only dependencies; no require() interop shortcut. */
export async function loadExtensionModule(extension: InstalledExtension): Promise<Record<string, unknown>> {
  try {
    const manifestURL = pathToFileURL(path.join(extension.root, 'package.json')).href;
    const manifest = JSON.parse(await readFile(new URL(manifestURL), 'utf8'));
    if (manifest.exports != null) {
      const entry = '.' + extension.specifier.slice(extension.name.length);
      const target = resolveExtensionExport(manifest.exports, entry, manifestURL);
      if (target === undefined) throw new Error('No matching public export');
      return await import(target);
    }
    // Preserve legacy main/index fallback when the package has no exports map.
    const { resolve } = await import('import-meta-resolve');
    return await import(resolve(extension.specifier, extension.parentURL));
  } catch {
    // Module errors can contain URLs, credentials or arbitrary top-level values.
    throw new ExtensionError(extension.name, 'public entrypoint could not be resolved or asynchronously loaded');
  }
}

export function extensionRegistration(module: Record<string, unknown>, provider: string): () => unknown {
  const named = module.registerRedboxExtension;
  const fallback =
    typeof module.default === 'function'
      ? module.default
      : module.default && typeof module.default === 'object'
        ? Reflect.get(module.default, 'registerRedboxExtension')
        : undefined;
  if (named && fallback && named !== fallback)
    throw new ExtensionError(provider, 'ambiguous named/default registerRedboxExtension exports');
  const registration = named ?? fallback;
  if (typeof registration !== 'function')
    throw new ExtensionError(provider, 'export registerRedboxExtension() using the v6 contract');
  return registration as () => unknown;
}
