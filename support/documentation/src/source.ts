import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { SourceLocation } from './catalogue';

export const repositoryRoot = path.resolve(__dirname, '../../..');

export function repositoryFiles(): string[] {
  const roots = ['packages/redbox-core/src', 'packages/sails-ng-common/src'];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(absolute);
    }
  };
  roots.forEach(root => visit(path.join(repositoryRoot, root)));
  return files.sort();
}

export function createProgram(): ts.Program {
  const configPath = path.join(repositoryRoot, 'support/documentation/tsconfig.typedoc.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  return ts.createProgram({ rootNames: repositoryFiles(), options: parsed.options });
}

export function sourceRef(): string {
  return process.env.DOCS_SOURCE_REF || process.env.CIRCLE_SHA1 || 'master';
}

export function sourceCommit(): string {
  if (process.env.CIRCLE_SHA1) return process.env.CIRCLE_SHA1;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function sourceLocation(node: ts.Node): SourceLocation {
  const sourceFile = node.getSourceFile();
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const file = path.relative(repositoryRoot, sourceFile.fileName).replaceAll(path.sep, '/');
  return {
    file,
    line,
    url: `https://github.com/redbox-mint/redbox-portal/blob/${sourceRef()}/${file}#L${line}`,
  };
}

export function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

export function sourceFile(program: ts.Program, relativePath: string): ts.SourceFile {
  const absolute = path.join(repositoryRoot, relativePath);
  const found = program.getSourceFile(absolute);
  if (!found) throw new Error(`TypeScript source file is not in the documentation program: ${relativePath}`);
  return found;
}
