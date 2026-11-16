import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { repositoryRoot } from './source';

export interface DocumentationBlock {
  file: string;
  line: number;
  code: string;
  skip?: { kind: 'partial' | 'legacy'; reason: string };
  /** Repository-relative directory used for normal workspace dependency resolution. */
  context?: string;
}

/** Scan repository documentation, including new nonignored files before staging. */
export function documentationFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(file => {
      if (!file || !fs.existsSync(path.join(root, file))) return false;
      const parts = file.split('/');
      const readme = /^readme(?:\.|$)/i.test(path.basename(file));
      const markdown = /\.(md|mdx|markdown)$/i.test(file);
      return (
        readme ||
        (markdown &&
          (parts.some(part => /^(docs?|documentation|wiki)$/i.test(part)) ||
            file === 'support/specs/fastify-migration/extension-api2.md'))
      );
    })
    .filter((file, index, files) => files.indexOf(file) === index)
    .sort();
}

/** Each skip applies to exactly the next fence; historical pages are not implicitly exempt. */
export function extractBlocks(file: string, markdown: string): DocumentationBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: DocumentationBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const opening = lines[index].match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!opening) continue;
    const fence = opening[1];
    const start = index;
    while (++index < lines.length && !new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(lines[index])) {}
    if (!/^(ts|typescript)(?:\s|$)/i.test(opening[2].trim())) continue;
    if (index === lines.length) throw new Error(`${file}:${start + 1}: unclosed TypeScript fence`);
    const block: DocumentationBlock = { file, line: start + 2, code: lines.slice(start + 1, index).join('\n') };
    let previous = start - 1;
    while (previous >= 0 && !lines[previous].trim()) previous--;
    const marker = lines[previous] ?? '';
    if (marker.includes('docs-example:')) {
      const context = marker.match(/^\s*<!-- docs-example:context ([A-Za-z0-9_./-]+) -->\s*$/);
      const skip = marker.match(/^\s*<!-- docs-example:skip (partial|legacy): (\S.*\S) -->\s*$/);
      if (context) {
        if (path.isAbsolute(context[1]) || context[1].split('/').includes('..'))
          throw new Error(`${file}:${previous + 1}: compilation context must stay inside the repository`);
        block.context = context[1];
      } else if (skip) {
        block.skip = { kind: skip[1] as 'partial' | 'legacy', reason: skip[2] };
      } else {
        throw new Error(
          `${file}:${previous + 1}: use docs-example:skip partial|legacy: <reason> or docs-example:context <directory>`
        );
      }
      if (block.skip?.kind === 'legacy') {
        // Require a visible legacy label in the immediately preceding prose paragraph.
        const prose =
          lines
            .slice(0, previous)
            .join('\n')
            .trim()
            .split(/\n\s*\n/)
            .at(-1) ?? '';
        if (!/\blegacy\b/i.test(prose.replace(/<!--[\s\S]*?-->/g, '')))
          throw new Error(`${file}:${start + 1}: legacy skip requires preceding prose labelled legacy`);
      }
    }
    if (!block.skip && /@ts-(?:nocheck|ignore|expect-error)\b/.test(block.code))
      throw new Error(`${file}:${block.line}: type-check suppression is not allowed in current examples`);
    blocks.push(block);
  }
  return blocks;
}

export function checkBlocks(root: string, blocks: DocumentationBlock[]): string[] {
  // Virtual sibling files preserve relative-import resolution and diagnostic locations.
  // .mts supports top-level await; export {} prevents snippets sharing globals.
  const virtual = new Map<string, { block: DocumentationBlock; text: string }>();
  blocks
    .filter(block => !block.skip)
    .forEach((block, index) => {
      const directory = block.context
        ? path.resolve(root, block.context)
        : path.dirname(path.resolve(root, block.file));
      if (block.context && !fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory())
        throw new Error(`${block.file}:${block.line}: compilation context directory does not exist: ${block.context}`);
      virtual.set(path.join(directory, `${path.basename(block.file)}.example-${index}.mts`), {
        block,
        text: `${block.code}\nexport {};\n`,
      });
    });
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    types: ['node'],
    typeRoots: [path.join(root, 'node_modules/@types')],
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  host.readFile = file => virtual.get(file)?.text ?? read(file);
  const exists = host.fileExists.bind(host);
  host.fileExists = file => virtual.has(file) || exists(file);
  host.getSourceFile = (file, languageVersion) => {
    const text = host.readFile(file);
    return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true);
  };
  const program = ts.createProgram({ rootNames: [...virtual.keys()], options, host });
  return ts.getPreEmitDiagnostics(program).map(diagnostic => {
    const item = diagnostic.file && virtual.get(diagnostic.file.fileName);
    const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const location =
      item && position
        ? `${item.block.file}:${item.block.line + position.line}:${position.character + 1}`
        : diagnostic.file
          ? `${path.relative(root, diagnostic.file.fileName)}:${(position?.line ?? 0) + 1}`
          : 'compiler';
    return `${location}: TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  });
}

export function checkDocumentationExamples(root = repositoryRoot): void {
  const files = documentationFiles(root);
  const blocks = files.flatMap(file => extractBlocks(file, fs.readFileSync(path.join(root, file), 'utf8')));
  const diagnostics = checkBlocks(root, blocks);
  const report = {
    files: files.length,
    checked: blocks.filter(block => !block.skip).length,
    optedOut: blocks.filter(block => block.skip).length,
    blocks,
    diagnostics,
  };
  const output = path.join(root, '.tmp/documentation-health/typescript-examples.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Documentation TypeScript blocks: ${report.checked} checked, ${report.optedOut} opted out (${files.length} files scanned).`
  );
  if (diagnostics.length) throw new Error(`Documentation TypeScript examples failed:\n${diagnostics.join('\n')}`);
}

if (require.main === module) checkDocumentationExamples();
