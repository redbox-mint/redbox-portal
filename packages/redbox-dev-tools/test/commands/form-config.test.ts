const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const commander = require('commander');
const loadTs = require('../support/load-ts.cjs');
const formConfigCommands = loadTs(module, '../../src/commands/form-config');
const packageRoot = fs.existsSync(path.resolve(__dirname, '..', '..', 'package.json'))
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..', '..', '..');
const testRoot = path.join(packageRoot, 'test');

describe('form-config commands', () => {
  let tempRoot: string;
  let inputLegacyFormPath: string;
  let inputLegacyDataClassifyDefFormPath: string;

  beforeEach(() => {
    tempRoot = path.join(testRoot, '.tmp', 'migrate-form-config');
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    inputLegacyFormPath = path.join(testRoot, 'resources', 'migrate-form-config', 'legacy-form.js');
    inputLegacyDataClassifyDefFormPath = path.join(testRoot, 'resources', 'migrate-form-config', 'legacy-data-classification-definition.js');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function buildProgram() {
    const program = new commander.Command();
    program
      .name('redbox-dev-tools')
      .option('--root <path>')
      .option('--core-types-root <path>')
      .option('--angular-root <path>')
      .option('--dry-run', 'Print intended changes without writing files', false);
    formConfigCommands.registerMigrateFormConfigCommand(program);
    formConfigCommands.registerMigrateDataClassificationCommand(program);
    formConfigCommands.registerClientFormConfigCommand(program);
    formConfigCommands.registerQuestionTreeDiagramCommand(program);
    return program;
  }

  describe('migrate-form-config', () => {
    it('should migrate a legacy form config and write TS output', async () => {
      const program = buildProgram();
      const outputPath = path.join(tempRoot, 'fixture-1.0-draft.ts');

      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'migrate-form-config', '--input', inputLegacyFormPath, '--output', outputPath],
        { from: 'node' }
      );

      expect(fs.existsSync(outputPath)).to.be.true;
      const content = fs.readFileSync(outputPath, 'utf8');
      expect(content).to.contain("import { FormConfigFrame } from '@researchdatabox/sails-ng-common';");
      expect(content).to.contain('const formConfig: FormConfigFrame = ');
      expect(content).to.contain('export default formConfig;');
    });

    it('should migrate a legacy form config and write cjs format TS output', async () => {
      const program = buildProgram();
      const outputPath = path.join(tempRoot, 'fixture-1.0-draft-cjs.ts');

      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'migrate-form-config', '--input', inputLegacyFormPath, '--output', outputPath, '--format', 'cjs'],
        { from: 'node' }
      );

      expect(fs.existsSync(outputPath)).to.be.true;
      const content = fs.readFileSync(outputPath, 'utf8');
      expect(content).to.contain("const dataClassification = require(\"./data-classification\");");
      expect(content).to.contain('const QuestionTreeOutcomeInfoKey = \'questiontree-outcome-info\';');
      expect(content).to.contain('module.exports =');
    });

    it('should respect global --dry-run and not write output file', async () => {
      const program = buildProgram();
      const outputPath = path.join(tempRoot, 'dry-run-fixture-1.0-draft.ts');

      await program.parseAsync(
        ['node', 'redbox-dev-tools', '--dry-run', 'migrate-form-config', '--input', inputLegacyFormPath, '--output', outputPath],
        { from: 'node' }
      );

      expect(fs.existsSync(outputPath)).to.be.false;
    });
  });

  describe('migrate-data-classification', () => {
    it('should migrate a legacy data classification and write question tree config TS output', async () => {
      const program = buildProgram();
      const outputPath = path.join(tempRoot, 'fixture-migrate-question-tree.ts');

      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'migrate-data-classification', '--input', inputLegacyDataClassifyDefFormPath, '--output', outputPath],
        { from: 'node' }
      );

      expect(fs.existsSync(outputPath)).to.be.true;
      const content = fs.readFileSync(outputPath, 'utf8');
      expect(content).to.contain('import {QuestionTreeFieldComponentConfigFrame} from "@researchdatabox/sails-ng-common";');
      expect(content).to.contain('const questionTreeConfig: QuestionTreeFieldComponentConfigFrame = ');
      expect(content).to.contain('export default questionTreeConfig;');
    });

    it('should migrate a legacy data classification and write question tree config cjs TS output', async () => {
      const program = buildProgram();
      const outputPath = path.join(tempRoot, 'fixture-migrate-question-tree-cjs.ts');

      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'migrate-data-classification', '--input', inputLegacyDataClassifyDefFormPath, '--output', outputPath, '--format', 'cjs'],
        { from: 'node' }
      );

      expect(fs.existsSync(outputPath)).to.be.true;
      const content = fs.readFileSync(outputPath, 'utf8');
      expect(content).to.contain('module.exports = {');
    });

    it('should respect global --dry-run and not write output file', async () => {
      const program = buildProgram();
      const outputPath = path.join(tempRoot, 'dry-run-fixture-migrate-question-tree.ts');

      await program.parseAsync(
        ['node', 'redbox-dev-tools', '--dry-run', 'migrate-data-classification', '--input', inputLegacyDataClassifyDefFormPath, '--output', outputPath],
        { from: 'node' }
      );

      expect(fs.existsSync(outputPath)).to.be.false;
    });
  });
  describe('client-form-config', () => {
    it('should create a client form config from a server form config', async () => {
      const program = buildProgram();

      // create server form config
      const outputFormConfigPath = path.join(tempRoot, 'fixture-server-form-config.ts');
      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'migrate-form-config', '--input', inputLegacyFormPath, '--output', outputFormConfigPath],
        { from: 'node' }
      );
      expect(fs.existsSync(outputFormConfigPath)).to.be.true;

      // create client form config
      const outputClientPath = path.join(tempRoot, 'fixture-client-form-config.ts');
      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'client-form-config', '--input', outputFormConfigPath, '--output', outputClientPath],
        { from: 'node' }
      );

      expect(fs.existsSync(outputClientPath)).to.be.true;
      const content = fs.readFileSync(outputClientPath, 'utf8');
      expect(content).to.contain("import { FormConfigFrame } from '@researchdatabox/sails-ng-common';");
      expect(content).to.contain('const clientFormConfig: FormConfigFrame = ');
      expect(content).to.contain('export default clientFormConfig;');
    });
  });
  describe('question-tree-diagram', () => {
    it('should create a diagram from a question tree config', async () => {
      const program = buildProgram();

      // create question tree config
      const outputQuestionTreeConfigPath = path.join(tempRoot, 'fixture-migrate-question-tree-for-diagram-cjs.ts');
      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'migrate-data-classification', '--input', inputLegacyDataClassifyDefFormPath, '--output', outputQuestionTreeConfigPath, '--format', 'cjs'],
        { from: 'node' }
      );
      expect(fs.existsSync(outputQuestionTreeConfigPath)).to.be.true;

      // create diagram
      const outputDiagramPath = path.join(tempRoot, 'fixture-question-tree-diagram.txt');
      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'question-tree-diagram', '--input', outputQuestionTreeConfigPath, '--output', outputDiagramPath],
        { from: 'node' }
      );

      expect(fs.existsSync(outputDiagramPath)).to.be.true;
      const content = fs.readFileSync(outputDiagramPath, 'utf8');
      expect(content).to.contain("flowchart LR");
    });
  });
});
