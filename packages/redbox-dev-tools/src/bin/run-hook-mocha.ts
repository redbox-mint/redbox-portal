import Module from 'module';
import path from 'path';
import { spawnSync } from 'child_process';

import ts from 'typescript';

import { createHookCompilerOptions } from '../utils/hook-tsconfig';

type CompilerOptions = Record<string, unknown>;

type TsWithConvertToTSConfig = typeof ts & {
  convertToTSConfig: (
    config: ts.ParsedCommandLine,
    configFileName: string,
    host: typeof ts.sys,
  ) => { compilerOptions?: CompilerOptions };
};

type ModuleWithInitPaths = typeof Module & {
  _initPaths: () => void;
};

function getResolvedCompilerOptions(projectPath: string): CompilerOptions {
  const resolvedProjectPath = path.resolve(process.cwd(), projectPath);
  const configFile = ts.readConfigFile(resolvedProjectPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(resolvedProjectPath),
    undefined,
    resolvedProjectPath,
  );
  if (parsedConfig.errors.length > 0) {
    throw new Error(ts.flattenDiagnosticMessageText(parsedConfig.errors[0].messageText, '\n'));
  }

  const convertedConfig = (ts as TsWithConvertToTSConfig).convertToTSConfig(parsedConfig, resolvedProjectPath, ts.sys);
  return convertedConfig.compilerOptions ?? {};
}

const redboxCorePackageJson = require.resolve('@researchdatabox/redbox-core/package.json');
const redboxCoreDir = path.dirname(redboxCorePackageJson);
const workspaceNodeModules = path.resolve(redboxCoreDir, '..', '..', 'node_modules');
const coreNodeModules = path.join(redboxCoreDir, 'node_modules');
const existingNodePath = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
const tsNodeProject = process.env.TS_NODE_PROJECT ?? 'tsconfig.json';
const existingCompilerOptions: CompilerOptions = process.env.TS_NODE_COMPILER_OPTIONS
  ? JSON.parse(process.env.TS_NODE_COMPILER_OPTIONS)
  : {};
const resolvedCompilerOptions = getResolvedCompilerOptions(tsNodeProject);
const hookCompilerOptions = createHookCompilerOptions(tsNodeProject);

process.env.NODE_PATH = [workspaceNodeModules, coreNodeModules, ...existingNodePath]
  .filter((value, index, values) => value && values.indexOf(value) === index)
  .join(path.delimiter);
process.env.TS_NODE_SKIP_PROJECT = 'true';
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  ...resolvedCompilerOptions,
  ...existingCompilerOptions,
  ...hookCompilerOptions,
});

(Module as ModuleWithInitPaths)._initPaths();

const result = spawnSync(process.execPath, [require.resolve('mocha/bin/mocha.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
