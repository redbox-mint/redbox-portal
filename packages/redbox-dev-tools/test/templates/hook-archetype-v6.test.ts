import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ApplicationModule } from '@researchdatabox/redbox-core/application';
import type { RedboxExtension } from '@researchdatabox/redbox-core/extensions';

const { generateHookArchetype } = require('../../src/templates/hook-archetype');

describe('v6 hook archetype', () => {
  it('compiles generated public declarations and owns a native file through activation and drain', async function () {
    this.timeout(30000);
    const parent = path.resolve(__dirname, '../.tmp');
    fs.mkdirSync(parent, { recursive: true });
    const output = fs.mkdtempSync(path.join(parent, 'v6-archetype-'));
    try {
      generateHookArchetype({ cwd: output, packageName: 'redbox-hook-123-demo', templateName: 'v6' });
      const configPath = path.join(output, 'tsconfig.json');
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      assert.equal(config.error, undefined);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, output);
      const program = ts.createProgram(parsed.fileNames, parsed.options);
      const emitted = program.emit();
      const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
      assert.equal(
        diagnostics.length,
        0,
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: file => file,
          getCurrentDirectory: () => output,
          getNewLine: () => '\n',
        })
      );
      const pkg = JSON.parse(fs.readFileSync(path.join(output, 'package.json'), 'utf8'));
      assert.equal(pkg.redbox.extension, '.');
      assert.equal(pkg.sails, undefined);
      for (const value of Object.values({ ...pkg.devDependencies, ...pkg.peerDependencies }))
        assert.match(String(value), /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);

      const hook = require(path.join(output, 'dist/index.js')) as {
        registerRedboxExtension(): RedboxExtension;
        Example: new (input: {
          auditPath: string;
          greeting: string;
        }) => ApplicationModule & { greet(): Promise<string> };
      };
      const declaration = hook.registerRedboxExtension();
      assert.equal(declaration.modules?.length, 1);
      assert.equal(declaration.routes?.[0].access, 'public');
      const auditPath = path.join(output, 'audit.log');
      const instance = new hook.Example({ auditPath, greeting: 'hello' });
      assert.equal(fs.existsSync(auditPath), false);
      await instance.initialize();
      await assert.rejects(instance.greet(), /not accepting/);
      await instance.activate!();
      const accepted = instance.greet();
      await instance.drain!();
      assert.equal(await accepted, 'hello');
      await assert.rejects(instance.greet(), /not accepting/);
      await instance.close();
      assert.equal(fs.readFileSync(auditPath, 'utf8'), 'hello\n');
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});
