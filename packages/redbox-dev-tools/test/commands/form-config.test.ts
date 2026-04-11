import {expect} from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {Command} from 'commander';
import {
  registerClientFormConfigCommand,
  registerMigrateDataClassificationCommand,
  registerMigrateFigshareConfigCommand,
  registerMigrateFormConfigCommand,
  registerQuestionTreeDiagramCommand
} from '../../src/commands/form-config';

describe('form-config commands', () => {
  let tempRoot: string;
  let inputLegacyFormPath: string;
  let inputLegacyDataClassifyDefFormPath: string;

  beforeEach(() => {
    tempRoot = path.resolve(__dirname, '..', '.tmp', 'migrate-form-config');
    fs.rmSync(tempRoot, {recursive: true, force: true});
    fs.mkdirSync(tempRoot, {recursive: true});
    inputLegacyFormPath = path.resolve(__dirname, '..', 'resources', 'migrate-form-config', 'legacy-form.js');
    inputLegacyDataClassifyDefFormPath = path.resolve(__dirname, '..', 'resources', 'migrate-form-config', 'legacy-data-classification-definition.js');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, {recursive: true, force: true});
  });

  function buildProgram(): Command {
    const program = new Command();
    program
      .name('redbox-dev-tools')
      .option('--root <path>')
      .option('--core-types-root <path>')
      .option('--angular-root <path>')
      .option('--dry-run', 'Print intended changes without writing files', false);
    registerMigrateFormConfigCommand(program);
    registerMigrateDataClassificationCommand(program);
    registerMigrateFigshareConfigCommand(program);
    registerClientFormConfigCommand(program);
    registerQuestionTreeDiagramCommand(program);
    return program;
  }

  describe('migrate-form-config', () => {
    it('should migrate a legacy form config and write TS output', async () => {
      const program = buildProgram();
      const outputPath = path.join(tempRoot, 'fixture-1.0-draft.ts');

      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'migrate-form-config', '--input', inputLegacyFormPath, '--output', outputPath],
        {from: 'node'}
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
        {from: 'node'}
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
        {from: 'node'}
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
        {from: 'node'}
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
        {from: 'node'}
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
        {from: 'node'}
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
        {from: 'node'}
      );
      expect(fs.existsSync(outputFormConfigPath)).to.be.true;

      // create client form config
      const outputClientPath = path.join(tempRoot, 'fixture-client-form-config.ts');
      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'client-form-config', '--input', outputFormConfigPath, '--output', outputClientPath],
        {from: 'node'}
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
        {from: 'node'}
      );
      expect(fs.existsSync(outputQuestionTreeConfigPath)).to.be.true;

      // create diagram
      const outputDiagramPath = path.join(tempRoot, 'fixture-question-tree-diagram.txt');
      await program.parseAsync(
        ['node', 'redbox-dev-tools', 'question-tree-diagram', '--input', outputQuestionTreeConfigPath, '--output', outputDiagramPath],
        {from: 'node'}
      );

      expect(fs.existsSync(outputDiagramPath)).to.be.true;
      const content = fs.readFileSync(outputDiagramPath, 'utf8');
      expect(content).to.contain("flowchart LR");
    });
  });

  describe('migrate-figshare-config', () => {
    function writeLegacyFigshareFixtures() {
      const figshareApiPath = path.join(tempRoot, 'figshareAPI.js');
      const figshareApiEnvPath = path.join(tempRoot, 'figshareAPIEnv.js');
      const figshareForMappingPath = path.join(tempRoot, 'figshareReDBoxFORMapping.js');

      fs.writeFileSync(figshareApiPath, `module.exports.figshareAPI = {
  APIToken: 'secret-token',
  baseURL: 'https://api.figshare.com',
  frontEndURL: 'https://figshare.com',
  attachmentsFigshareTempDir: '/tmp/figshare',
  retry: { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 500, retryOnStatusCodes: [429, 500] },
  mapping: {
    figshareItemType: 'dataset',
    figshareItemGroupId: 42,
    figshareNeedsPublishAfterFileUpload: true,
    recordFigArticleId: 'metadata.figshare_article_id',
    recordFigArticleURL: ['metadata.figshare_article_location'],
    recordDataLocations: 'metadata.dataLocations',
    recordAllFilesUploaded: 'metadata.figshare_all_files_uploaded',
    recordAuthorUniqueBy: 'email',
    recordAuthorExternalName: 'text_full_name',
    figshareOnlyPublishSelectedAttachmentFiles: true,
    figshareOnlyPublishSelectedLocationURLs: false,
    figshareForceEmbargoUpdateAlways: true,
    schedulePublishAfterUploadJob: 'immediate',
    scheduleUploadedFilesCleanupJob: 'in 10 minutes',
    figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob: {
      enabled: 'true',
      namedQuery: 'queued-records',
      targetStep: 'published',
      paramMap: { status: 'queued' },
      figshareTargetFieldKey: 'status',
      figshareTargetFieldValue: 'public',
      username: 'job-user',
      userType: 'admin'
    },
    templates: {
      customField: '<% legacyTemplate %>'
    }
  },
  testMode: true
};`, 'utf8');

      fs.writeFileSync(figshareApiEnvPath, `module.exports.figshareAPIEnv = {
  overrideArtifacts: {
    APIToken: 'override-token',
    baseURL: 'https://override.api.figshare.com',
    frontEndURL: 'https://override.figshare.com'
  }
};`, 'utf8');

      fs.writeFileSync(figshareForMappingPath, `module.exports.figshareReDBoxFORMapping = {
  FORMapping: [
    { redboxCode: '0101', figshareCategoryId: 100 }
  ]
};`, 'utf8');

      return { figshareApiPath, figshareApiEnvPath, figshareForMappingPath };
    }

    it('should migrate explicit legacy figshare config files into figsharePublishing JSON', async () => {
      const program = buildProgram();
      const outputDir = path.join(tempRoot, 'figshare-output');
      const { figshareApiPath, figshareApiEnvPath, figshareForMappingPath } = writeLegacyFigshareFixtures();

      await program.parseAsync(
        [
          'node',
          'redbox-dev-tools',
          'migrate-figshare-config',
          '--figshare-api',
          figshareApiPath,
          '--figshare-api-env',
          figshareApiEnvPath,
          '--figshare-for-mapping',
          figshareForMappingPath,
          '--output',
          outputDir,
          '--brands',
          'default'
        ],
        { from: 'node' }
      );

      const outputPath = path.join(outputDir, 'default.figsharePublishing.json');
      expect(fs.existsSync(outputPath)).to.equal(true);
      const migrated = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

      expect(migrated.connection.baseUrl).to.equal('https://override.api.figshare.com');
      expect(migrated.connection.token).to.equal('override-token');
      expect(migrated.categories.mappingTable[0].figshareCategoryId).to.equal(100);
      expect(migrated.record.allFilesUploadedPath).to.equal('metadata.figshare_all_files_uploaded');
      expect(migrated.queue.publishAfterUploadDelay).to.equal('immediate');
      expect(migrated.queue.uploadedFilesCleanupDelay).to.equal('in 10 minutes');
      expect(migrated.workflow.transitionJob.username).to.equal('job-user');
      expect(migrated.testing.mode).to.equal('fixture');
      expect(migrated.migrationReport.unsupportedLegacyTemplates).to.deep.equal(['templates.customField']);
    });

    it('should support migrating with only the required figshare-api input', async () => {
      const program = buildProgram();
      const outputDir = path.join(tempRoot, 'figshare-output-minimal');
      const { figshareApiPath } = writeLegacyFigshareFixtures();

      await program.parseAsync(
        [
          'node',
          'redbox-dev-tools',
          'migrate-figshare-config',
          '--figshare-api',
          figshareApiPath,
          '--output',
          outputDir
        ],
        { from: 'node' }
      );

      const outputPath = path.join(outputDir, 'default.figsharePublishing.json');
      const migrated = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(migrated.connection.baseUrl).to.equal('https://api.figshare.com');
      expect(migrated.categories.mappingTable).to.deep.equal([]);
    });
  });
});
