import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

type PackageRequire = ReturnType<typeof createRequire>;

type HookCompilerOptions = {
  baseUrl: string;
  paths: Record<string, string[]>;
  typeRoots: string[];
};

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function getPackageRequire(packageName: string): PackageRequire {
  const packageJsonPath = packageName === '@researchdatabox/redbox-dev-tools'
    ? path.resolve(__dirname, '..', '..', 'package.json')
    : require.resolve(`${packageName}/package.json`);

  return createRequire(packageJsonPath);
}

function resolvePackageDir(resolver: PackageRequire, request: string): string | null {
  try {
    return path.dirname(resolver.resolve(`${request}/package.json`));
  } catch {
    return null;
  }
}

function collectPathEntries(projectDir: string, entries: Array<string | null | undefined>): string[] {
  return entries
    .filter((entry): entry is string => Boolean(entry))
    .map(entry => toPosixPath(path.relative(projectDir, entry)))
    .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index);
}

function getHookCompilerOptions(projectDir: string, projectTsconfig: string): HookCompilerOptions {
  const projectRequire = createRequire(projectTsconfig);
  const redboxCoreRequire = getPackageRequire('@researchdatabox/redbox-core');
  const redboxDevToolsRequire = getPackageRequire('@researchdatabox/redbox-dev-tools');
  const redboxDevToolsDir = path.resolve(__dirname, '..', '..');
  const localNodeTypes = path.join(projectDir, 'node_modules', '@types');
  const devToolsNodeTypes = path.join(redboxDevToolsDir, 'node_modules', '@types');

  const sailsNgCommonDirs = [
    resolvePackageDir(redboxCoreRequire, '@researchdatabox/sails-ng-common'),
    resolvePackageDir(projectRequire, '@researchdatabox/sails-ng-common'),
    resolvePackageDir(redboxDevToolsRequire, '@researchdatabox/sails-ng-common'),
  ];
  const axiosDirs = [
    resolvePackageDir(redboxCoreRequire, 'axios'),
    resolvePackageDir(projectRequire, 'axios'),
    resolvePackageDir(redboxDevToolsRequire, 'axios'),
  ];
  const rxjsDirs = [
    resolvePackageDir(redboxCoreRequire, 'rxjs'),
    resolvePackageDir(projectRequire, 'rxjs'),
    resolvePackageDir(redboxDevToolsRequire, 'rxjs'),
  ];
  const lodashDirs = [
    resolvePackageDir(redboxCoreRequire, 'lodash'),
    resolvePackageDir(projectRequire, 'lodash'),
    resolvePackageDir(redboxDevToolsRequire, 'lodash'),
  ];

  return {
    baseUrl: '.',
    paths: {
      '@researchdatabox/sails-ng-common': collectPathEntries(projectDir, sailsNgCommonDirs),
      axios: collectPathEntries(projectDir, axiosDirs),
      rxjs: collectPathEntries(projectDir, rxjsDirs),
      'rxjs/*': collectPathEntries(projectDir, rxjsDirs.map(entry => entry ? path.join(entry, '*') : null)),
      lodash: collectPathEntries(projectDir, lodashDirs),
    },
    typeRoots: [
      fs.existsSync(localNodeTypes) ? toPosixPath(path.relative(projectDir, localNodeTypes)) : null,
      fs.existsSync(devToolsNodeTypes) ? toPosixPath(path.relative(projectDir, devToolsNodeTypes)) : null,
    ].filter((entry): entry is string => Boolean(entry)),
  };
}

export function createHookCompilerOptions(projectPath: string): HookCompilerOptions {
  const projectDir = process.cwd();
  const projectTsconfig = path.resolve(projectDir, projectPath);

  return getHookCompilerOptions(projectDir, projectTsconfig);
}

export function createHookTsConfig(projectPath: string): string {
  const projectDir = process.cwd();
  const projectTsconfig = path.resolve(projectDir, projectPath);
  const compilerOptions = getHookCompilerOptions(projectDir, projectTsconfig);
  const tempRootDir = path.join(projectDir, '.tmp', 'redbox-dev-tools');

  fs.mkdirSync(tempRootDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(tempRootDir, 'tsconfig-'));
  const tempTsconfigPath = path.join(tempDir, 'tsconfig.json');
  const tempConfig = {
    extends: toPosixPath(path.relative(tempDir, projectTsconfig)),
    compilerOptions: {
      baseUrl: toPosixPath(path.relative(tempDir, projectDir)) || '.',
      paths: compilerOptions.paths,
      typeRoots: compilerOptions.typeRoots.map(entry => toPosixPath(path.relative(tempDir, path.resolve(projectDir, entry)))),
    },
  };

  fs.writeFileSync(tempTsconfigPath, JSON.stringify(tempConfig, null, 2) + '\n');

  return tempTsconfigPath;
}

export function cleanupHookTsConfig(tempTsconfigPath: string): void {
  const tempDir = path.dirname(tempTsconfigPath);

  fs.rmSync(tempDir, { recursive: true, force: true });
}
