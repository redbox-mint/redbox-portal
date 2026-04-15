import { spawnSync } from 'child_process';

import { cleanupHookTsConfig, createHookTsConfig } from '../utils/hook-tsconfig';

const args = [...process.argv.slice(2)];
const projectArgIndex = args.findIndex(arg => arg === '-p' || arg === '--project');
const projectPath = projectArgIndex >= 0 ? args[projectArgIndex + 1] : 'tsconfig.json';
const tempTsconfigPath = createHookTsConfig(projectPath ?? 'tsconfig.json');

if (projectArgIndex >= 0) {
  args.splice(projectArgIndex, 2, '-p', tempTsconfigPath);
} else {
  args.unshift('-p', tempTsconfigPath);
}

const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), ...args], {
  stdio: 'inherit',
});

cleanupHookTsConfig(tempTsconfigPath);
process.exit(result.status ?? 1);
