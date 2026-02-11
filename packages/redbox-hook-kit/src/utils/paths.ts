import * as path from 'path';
import * as fs from 'fs';

export interface RedboxPaths {
  root: string;
  coreTypes: string;
  angular: string;
}

export function resolvePaths(options: {
  root?: string;
  coreTypesRoot?: string;
  angularRoot?: string;
}): RedboxPaths {
  if (!options.root) {
    throw new Error('The --root option is required for this command.');
  }

  const root = path.resolve(options.root);

  if (!fs.existsSync(root)) {
    throw new Error(`The provided root directory does not exist: ${root}`);
  }

  const coreTypes = options.coreTypesRoot 
    ? path.resolve(options.coreTypesRoot)
    : path.join(root, 'packages', 'redbox-core-types');

  const angular = options.angularRoot
    ? path.resolve(options.angularRoot)
    : path.join(root, 'angular');

  // Basic validation
  if (!fs.existsSync(path.join(coreTypes, 'package.json'))) {
    console.warn(`Warning: Could not find redbox-core-types at ${coreTypes}`);
  }

  return {
    root,
    coreTypes,
    angular
  };
}
