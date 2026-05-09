const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const commander = require('commander');
const loadTs = require('../support/load-ts.cjs');

const formComponentDocs = loadTs(module, '../../src/commands/form-component-docs');
type FormComponentDocEntry = import('../../src/commands/form-component-docs').FormComponentDocEntry;
type DocProperty = import('../../src/commands/form-component-docs').DocProperty;

const packageRoot = fs.existsSync(path.resolve(__dirname, '..', '..', 'package.json'))
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..', '..', '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const testRoot = path.join(packageRoot, 'test');

describe('form-component-docs command', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = path.join(testRoot, '.tmp', 'form-component-docs');
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
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
    formComponentDocs.registerFormComponentDocsCommand(program);
    return program;
  }

  it('collects known built-in components', () => {
    const entries: FormComponentDocEntry[] = formComponentDocs.collectCoreFormComponentDocs({ rootDir: repoRoot });
    const classNames = entries.map((entry: FormComponentDocEntry) => entry.componentClass);

    expect(classNames).to.include('SimpleInputComponent');
    expect(classNames).to.include('CheckboxTreeComponent');
    expect(classNames).to.include('RepeatableComponent');
    expect(classNames).to.include('PublishDataLocationRefreshComponent');
  });

  it('excludes ReusableComponent by default', () => {
    const entries: FormComponentDocEntry[] = formComponentDocs.collectCoreFormComponentDocs({ rootDir: repoRoot });
    expect(entries.some((entry: FormComponentDocEntry) => entry.componentClass === 'ReusableComponent')).to.equal(false);
  });

  it('excludes nested/internal components by default and includes them when requested', () => {
    const defaultEntries: FormComponentDocEntry[] = formComponentDocs.collectCoreFormComponentDocs({ rootDir: repoRoot });
    const allEntries: FormComponentDocEntry[] = formComponentDocs.collectCoreFormComponentDocs({ rootDir: repoRoot, includeInternal: true });

    expect(defaultEntries.some((entry: FormComponentDocEntry) => entry.componentClass === 'TabContentComponent')).to.equal(false);
    expect(defaultEntries.some((entry: FormComponentDocEntry) => entry.componentClass === 'AccordionPanelComponent')).to.equal(false);
    expect(allEntries.some((entry: FormComponentDocEntry) => entry.componentClass === 'TabContentComponent')).to.equal(true);
    expect(allEntries.some((entry: FormComponentDocEntry) => entry.componentClass === 'AccordionPanelComponent')).to.equal(true);
  });

  it('extracts SimpleInput component config properties and defaults', () => {
    const entries: FormComponentDocEntry[] = formComponentDocs.collectCoreFormComponentDocs({ rootDir: repoRoot, includeInternal: true });
    const simpleInput = entries.find((entry: FormComponentDocEntry) => entry.componentClass === 'SimpleInputComponent');

    expect(simpleInput).to.exist;
    const typeProperty = simpleInput.componentConfigProperties.find((property: DocProperty) => property.name === 'type');
    const placeholderProperty = simpleInput.componentConfigProperties.find((property: DocProperty) => property.name === 'placeholder');

    expect(typeProperty).to.exist;
    expect(typeProperty.defaultValue).to.equal('"text"');
    expect(placeholderProperty).to.exist;
    expect(placeholderProperty.defaultValue).to.equal("''");
  });

  it('extracts CheckboxTree model value type', () => {
    const entries: FormComponentDocEntry[] = formComponentDocs.collectCoreFormComponentDocs({ rootDir: repoRoot });
    const checkboxTree = entries.find((entry: FormComponentDocEntry) => entry.componentClass === 'CheckboxTreeComponent');

    expect(checkboxTree).to.exist;
    expect(checkboxTree.valueType).to.equal('CheckboxTreeSelectedItem[]');
  });

  it('renders markdown with generated warning, shared sections, components, and examples', () => {
    const entries: FormComponentDocEntry[] = formComponentDocs.collectCoreFormComponentDocs({ rootDir: repoRoot });
    const markdown = formComponentDocs.renderFormComponentDocsMarkdown(entries);

    expect(markdown).to.contain('> Generated from `packages/sails-ng-common/src/config`. Do not edit component tables by hand.');
    expect(markdown).to.contain('## Shared Form Component Properties');
    expect(markdown).to.contain('## Shared Component Config Properties');
    expect(markdown).to.contain('## Shared Model Config Properties');
    expect(markdown).to.contain('### SimpleInputComponent');
    expect(markdown).to.contain('#### Example');
    expect(markdown).to.contain('```ts');
  });

  it('writes the configured output file through the CLI', async () => {
    const outputPath = path.join(tempRoot, 'Configurable-Form-Components.md');
    const program = buildProgram();

    await program.parseAsync(
      ['node', 'redbox-dev-tools', '--root', repoRoot, 'form-component-docs', '--output', outputPath],
      { from: 'node' }
    );

    expect(fs.existsSync(outputPath)).to.equal(true);
    const content = fs.readFileSync(outputPath, 'utf8');
    expect(content).to.contain('# Configurable Form Components');
    expect(content).to.contain('### SimpleInputComponent');
  });

  it('passes --check when the output is current', async () => {
    const outputPath = path.join(tempRoot, 'Configurable-Form-Components.md');
    const program = buildProgram();

    await program.parseAsync(
      ['node', 'redbox-dev-tools', '--root', repoRoot, 'form-component-docs', '--output', outputPath],
      { from: 'node' }
    );

    await program.parseAsync(
      ['node', 'redbox-dev-tools', '--root', repoRoot, 'form-component-docs', '--output', outputPath, '--check'],
      { from: 'node' }
    );
  });

  it('fails --check when the output file is stale', async () => {
    const outputPath = path.join(tempRoot, 'Configurable-Form-Components.md');
    const program = buildProgram();

    await program.parseAsync(
      ['node', 'redbox-dev-tools', '--root', repoRoot, 'form-component-docs', '--output', outputPath],
      { from: 'node' }
    );

    fs.writeFileSync(outputPath, '# stale\n', 'utf8');

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit:${code}`);
    }) as typeof process.exit;

    try {
      await program.parseAsync(
        ['node', 'redbox-dev-tools', '--root', repoRoot, 'form-component-docs', '--output', outputPath, '--check'],
        { from: 'node' }
      );
      throw new Error('expected check to fail');
    } catch (error: any) {
      expect(String(error.message)).to.equal('process.exit:1');
      expect(exitCode).to.equal(1);
    } finally {
      process.exit = originalExit;
    }
  });

  it('produces deterministic ordering', () => {
    const first = formComponentDocs
      .collectCoreFormComponentDocs({ rootDir: repoRoot, includeInternal: true })
      .map((entry: FormComponentDocEntry) => entry.componentClass);
    const second = formComponentDocs
      .collectCoreFormComponentDocs({ rootDir: repoRoot, includeInternal: true })
      .map((entry: FormComponentDocEntry) => entry.componentClass);

    expect(first).to.deep.equal(second);
  });
});
