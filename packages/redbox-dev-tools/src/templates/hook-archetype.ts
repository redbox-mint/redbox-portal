import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';

Handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value));

export interface HookArchetypeOptions {
  cwd: string;
  packageName: string;
  description?: string;
  force?: boolean;
  templateName?: string;
}

export interface HookArchetypeResult {
  created: string[];
  skipped: string[];
}

type HookTemplateContext = {
  packageName: string;
  hookShortName: string;
  hookPascalName: string;
  description: string;
  integrationDirName: string;
  redboxCoreVersion: string;
  redboxDevToolsVersion: string;
};

type PackageJson = {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function normalizePackageName(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  return cleaned.startsWith('redbox-hook-') ? cleaned : `redbox-hook-${cleaned}`;
}

function getPackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function getTemplateRoot(templateName: string): string {
  return path.join(getPackageRoot(), 'templates', 'hook-archetype', templateName);
}

function walkTemplateFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTemplateFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function renderTemplate(sourcePath: string, context: HookTemplateContext): string {
  const templateSource = fs.readFileSync(sourcePath, 'utf8');
  const template = Handlebars.compile(templateSource, { noEscape: true });
  return template(context);
}

function toOutputRelativePath(templateRoot: string, filePath: string): string {
  const relativePath = path.relative(templateRoot, filePath);
  return relativePath.endsWith('.hbs')
    ? relativePath.slice(0, -4)
    : relativePath;
}

function shouldMarkExecutable(relativePath: string): boolean {
  return relativePath.endsWith('.sh');
}

function readPackageJson(packageJsonPath: string): PackageJson {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
}

function tryReadPackageJson(packageJsonPath: string): PackageJson | undefined {
  return fs.existsSync(packageJsonPath)
    ? readPackageJson(packageJsonPath)
    : undefined;
}

function getScopedPackageName(packageName: string): string {
  return `@researchdatabox/${packageName}`;
}

function readOwnPackageVersion(packageRoot: string): string {
  const packageJson = tryReadPackageJson(path.join(packageRoot, 'package.json'));

  if (!packageJson?.version) {
    throw new Error('Could not determine version for @researchdatabox/redbox-dev-tools');
  }

  return packageJson.version;
}

function tryReadInstalledPackageVersion(packageRoot: string, packageName: string): string | undefined {
  const packageJsonPath = path.join(packageRoot, 'node_modules', ...getScopedPackageName(packageName).split('/'), 'package.json');
  return tryReadPackageJson(packageJsonPath)?.version;
}

function isReusableDependencySpecifier(versionSpecifier: string): boolean {
  return !/^(file:|workspace:|link:|portal:)/.test(versionSpecifier);
}

function readDeclaredDependencyVersion(packageRoot: string, packageName: string): string | undefined {
  const packageJson = tryReadPackageJson(path.join(packageRoot, 'package.json'));
  const dependencyName = getScopedPackageName(packageName);
  const versionSpecifier = packageJson?.dependencies?.[dependencyName]
    ?? packageJson?.peerDependencies?.[dependencyName]
    ?? packageJson?.devDependencies?.[dependencyName];

  return versionSpecifier && isReusableDependencySpecifier(versionSpecifier)
    ? versionSpecifier
    : undefined;
}

function readDependencyPackageVersion(packageRoot: string, packageName: string): string {
  const installedVersion = tryReadInstalledPackageVersion(packageRoot, packageName);

  if (installedVersion) {
    return installedVersion;
  }

  const siblingPackageJson = tryReadPackageJson(path.join(packageRoot, '..', packageName, 'package.json'));

  if (siblingPackageJson?.version) {
    return siblingPackageJson.version;
  }

  const declaredVersion = readDeclaredDependencyVersion(packageRoot, packageName);

  if (declaredVersion) {
    return declaredVersion;
  }

  throw new Error(`Could not determine version for ${getScopedPackageName(packageName)}`);
}

function buildTemplateContext(options: HookArchetypeOptions): HookTemplateContext {
  const packageRoot = getPackageRoot();
  const packageName = normalizePackageName(options.packageName);
  const hookShortName = packageName.replace(/^redbox-hook-/, '');
  const hookPascalName = toPascalCase(hookShortName);

  return {
    packageName,
    hookShortName,
    hookPascalName,
    description: options.description ?? `ReDBox hook for ${hookPascalName}`,
    integrationDirName: hookShortName,
    redboxCoreVersion: readDependencyPackageVersion(packageRoot, 'redbox-core'),
    redboxDevToolsVersion: readOwnPackageVersion(packageRoot),
  };
}

export function generateHookArchetype(options: HookArchetypeOptions): HookArchetypeResult {
  const force = options.force ?? false;
  const templateName = options.templateName ?? 'standard';
  const templateRoot = getTemplateRoot(templateName);

  if (!fs.existsSync(templateRoot)) {
    throw new Error(`Unknown hook archetype template: ${templateName}`);
  }

  const context = buildTemplateContext(options);
  const templateFiles = walkTemplateFiles(templateRoot);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const templateFile of templateFiles) {
    const relativePath = toOutputRelativePath(templateRoot, templateFile);
    const outputPath = path.join(options.cwd, relativePath);
    const alreadyExists = fs.existsSync(outputPath);

    if (alreadyExists && !force) {
      skipped.push(relativePath);
      continue;
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    if (templateFile.endsWith('.hbs')) {
      fs.writeFileSync(outputPath, renderTemplate(templateFile, context));
    } else {
      fs.copyFileSync(templateFile, outputPath);
    }

    if (shouldMarkExecutable(relativePath)) {
      fs.chmodSync(outputPath, 0o755);
    }

    created.push(relativePath);
  }

  return { created, skipped };
}
