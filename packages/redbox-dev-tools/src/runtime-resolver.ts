import path from 'path';

export function getResolutionPaths(): string[] {
  const paths: string[] = [];

  try {
    const redboxCorePackageJson = require.resolve('@researchdatabox/redbox-core/package.json');
    paths.push(path.dirname(redboxCorePackageJson));
  } catch (_error) {
  }

  paths.push(__dirname);
  paths.push(process.cwd());

  return paths;
}

export function resolveFromRedboxContract(request: string): string {
  return require.resolve(request, { paths: getResolutionPaths() });
}

export function requireFromRedboxContract<T = unknown>(request: string): T {
  return require(resolveFromRedboxContract(request)) as T;
}
