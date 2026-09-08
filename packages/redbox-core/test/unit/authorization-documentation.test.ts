import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Script } from 'node:vm';
import { describe, it } from 'mocha';
import ts from 'typescript';
import type { AuthorizationReleaseEvidence } from '../../src/config/authorization.config';
import { computeAuthorizationReleaseEvidenceFingerprint } from '../../src/services/AuthorizationReadinessService';

const root = resolve(__dirname, '../../../..');
const wiki = resolve(root, 'support/wiki');
const pages = [
  'Application-Authorization-and-Permission-Model',
  'Authorization-Operations',
  'Authorization-Migration-and-Rollout',
  'Authorization-Hook-Contract',
  'Authorization-Route-Scope-Inventory',
  'Legacy-Bearer-Token-Migration',
  'Configuration-Guide',
  'Home',
  'Architecture-Overview',
  'Development-Guide',
  'Redbox-Core-Types',
  'Redbox-Hook-Kit',
  'Redbox-Loader',
  'Services-Architecture',
  'Using-a-Sails-Hook-to-customise-ReDBox',
];
const documents = new Map([
  ...pages.map((name): [string, string] => {
    const path = resolve(wiki, `${name}.md`);
    return [path, readFileSync(path, 'utf8')];
  }),
  [resolve(root, 'CHANGELOG.md'), readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')],
  [resolve(root, 'AGENTS.md'), readFileSync(resolve(root, 'AGENTS.md'), 'utf8')],
]);

function page(name: string): string {
  const content = documents.get(resolve(wiki, `${name}.md`));
  assert.ok(content);
  return content;
}

function fences(content: string) {
  return [...content.matchAll(/^\s*```(\w+)\n([\s\S]*?)^\s*```/gm)];
}

function headingIds(content: string): Set<string> {
  const seen = new Map<string, number>();
  return new Set(
    [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) => {
      const slug = heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
        .replace(/\s/g, '-');
      const count = seen.get(slug) ?? 0;
      seen.set(slug, count + 1);
      return count === 0 ? slug : `${slug}-${count}`;
    })
  );
}

describe('Authorization documentation', function () {
  it('resolves local links and maintained GitHub wiki links, including heading anchors', function () {
    const failures: string[] = [];
    for (const [path, markdown] of documents) {
      const prose = markdown.replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```/gm, '');
      for (const [, raw] of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const link = decodeURIComponent(raw).replace(/^https:\/\/github.com\/redbox-mint\/redbox-portal\/wiki\//, '');
        if (/^[a-z]+:/i.test(link)) continue;
        const [target, fragment] = link.split('#');
        let file = target ? resolve(dirname(path), target) : path;
        if (!existsSync(file) && !/\.[a-z]+$/i.test(file)) file += '.md';
        if (!existsSync(file)) failures.push(`${path}: missing ${raw}`);
        else if (fragment && !headingIds(readFileSync(file, 'utf8')).has(fragment)) {
          failures.push(`${path}: missing anchor ${raw}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  for (const name of ['Configuration-Guide', 'Authorization-Operations', 'Authorization-Migration-and-Rollout']) {
    it(`keeps ${name} shell, JavaScript and JSON examples syntactically valid`, function () {
      for (const [, language, source] of fences(page(name))) {
        if (language === 'bash' || language === 'javascript') {
          const checked = spawnSync(language === 'bash' ? 'bash' : 'node', language === 'bash' ? ['-n'] : ['--check'], {
            input: source,
            encoding: 'utf8',
          });
          assert.ifError(checked.error);
          assert.equal(checked.status, 0, checked.stderr);
          if (language === 'bash') assert.doesNotMatch(source, /(?:=|\[)<[^>]+>/, 'Unquoted shell placeholder');
        } else if (language === 'json') assert.doesNotThrow(() => JSON.parse(source));
      }
    });
  }

  it('executes the release-evidence example and matches the runtime canonical fingerprint', function () {
    const source = fences(page('Authorization-Operations')).find(([, language]) => language === 'javascript')?.[2];
    assert.ok(source);
    const context = { require, module: { exports: {} } };
    new Script(source).runInNewContext(context);
    const { releaseEvidence } = context.module.exports as { releaseEvidence: AuthorizationReleaseEvidence };
    assert.match(releaseEvidence.durableFingerprint ?? '', /^[a-f0-9]{64}$/u);
    assert.equal(releaseEvidence.durableFingerprint, computeAuthorizationReleaseEvidenceFingerprint(releaseEvidence));
    // Exercise recursion, undefined fields and array ordering against the runtime helper,
    // so an example simplified to a top-level sort cannot silently become incorrect.
    const nested = {
      z: [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ],
      a: { b: undefined, a: 5 },
    };
    const sandbox = { require, module: { exports: {} }, nested, digest: '' };
    new Script(`${source}\ndigest = durableFingerprint(nested);`).runInNewContext(sandbox);
    assert.equal(
      sandbox.digest,
      computeAuthorizationReleaseEvidenceFingerprint(nested as AuthorizationReleaseEvidence)
    );
    const reversed = { z: [...nested.z].reverse(), a: nested.a };
    assert.notEqual(
      sandbox.digest,
      computeAuthorizationReleaseEvidenceFingerprint(reversed as AuthorizationReleaseEvidence)
    );
  });

  it('typechecks the complete hook example against the current exported source contract', function () {
    this.timeout(30_000);
    const source = fences(page('Authorization-Hook-Contract')).find(
      ([, language, code]) => language === 'ts' && code.includes('const command: ReplaceExternalAssignmentsCommand')
    )?.[2];
    assert.ok(source);
    const filename = resolve(__dirname, 'authorization-hook-example.ts');
    const config = ts.readConfigFile(resolve(root, 'packages/redbox-core/test/tsconfig.json'), ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(root, 'packages/redbox-core/test'));
    assert.deepEqual(parsed.errors, []);
    const options = {
      ...parsed.options,
      noEmit: true,
      baseUrl: root,
      paths: { '@researchdatabox/redbox-core': ['packages/redbox-core/src/index.ts'] },
    };
    const host = ts.createCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (path, version, onError, fresh) =>
      path === filename
        ? ts.createSourceFile(path, source, version, true)
        : originalGetSourceFile(path, version, onError, fresh);
    const program = ts.createProgram(
      [filename, ...parsed.fileNames.filter(path => path.endsWith('.d.ts'))],
      options,
      host
    );
    const example = program.getSourceFile(filename);
    assert.ok(example);
    const diagnostics = [...program.getSyntacticDiagnostics(example), ...program.getSemanticDiagnostics(example)];
    assert.deepEqual(
      diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')),
      []
    );
  });
});
