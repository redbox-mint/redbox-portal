import { spawnSync } from 'child_process';
import { dirname, join } from 'node:path';

import { cleanupHookTsConfig, createHookTsConfig } from '../utils/hook-tsconfig';

const args = [...process.argv.slice(2)];
const projectArgIndex = args.findIndex((arg) => arg === '-p' || arg === '--project');
const projectPath = projectArgIndex >= 0 ? args[projectArgIndex + 1] : 'tsconfig.json';
const tempTsconfigPath = createHookTsConfig(projectPath ?? 'tsconfig.json');

if (projectArgIndex >= 0) {
  args.splice(projectArgIndex, 2, '-p', tempTsconfigPath);
} else {
  args.unshift('-p', tempTsconfigPath);
}

const nativeCompilerPackage = require.resolve('@typescript/native/package.json');
const nativeCompiler = join(dirname(nativeCompilerPackage), 'bin', 'tsc');
const result = spawnSync(process.execPath, [nativeCompiler, ...args], {
  stdio: 'inherit',
});

cleanupHookTsConfig(tempTsconfigPath);
process.exit(result.status ?? 1);
