import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { registerMigrateFormConfigCommand } from '../../src/commands/migrate-form-config';

describe('migrate-form-config command', () => {
  let tempRoot: string;
  let inputPath: string;

  beforeEach(() => {
    tempRoot = path.resolve(__dirname, '..', '.tmp', 'migrate-form-config');
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    inputPath = path.resolve(__dirname, '..', 'resources', 'migrate-form-config', 'legacy-form.js');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function buildProgram(): Command {
    const program = new Command();
    program
      .name('redbox-hook-kit')
      .option('--root <path>')
      .option('--core-types-root <path>')
      .option('--angular-root <path>')
      .option('--dry-run', 'Print intended changes without writing files', false);
    registerMigrateFormConfigCommand(program);
    return program;
  }

  it('should migrate a legacy form config and write TS output', async () => {
    const program = buildProgram();
    const outputPath = path.join(tempRoot, 'fixture-1.0-draft.ts');

    await program.parseAsync(
      ['node', 'redbox-hook-kit', 'migrate-form-config', '--input', inputPath, '--output', outputPath],
      { from: 'node' }
    );

    expect(fs.existsSync(outputPath)).to.be.true;
    const content = fs.readFileSync(outputPath, 'utf8');
    expect(content).to.contain("import { FormConfigFrame } from '@researchdatabox/sails-ng-common';");
    expect(content).to.contain('const formConfig: FormConfigFrame = ');
    expect(content).to.contain('export default formConfig;');
  });

  it('should respect global --dry-run and not write output file', async () => {
    const program = buildProgram();
    const outputPath = path.join(tempRoot, 'dry-run-fixture-1.0-draft.ts');

    await program.parseAsync(
      ['node', 'redbox-hook-kit', '--dry-run', 'migrate-form-config', '--input', inputPath, '--output', outputPath],
      { from: 'node' }
    );

    expect(fs.existsSync(outputPath)).to.be.false;
  });
});
