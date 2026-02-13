import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { FormFieldGenerator } from '../../src/generators/form-field';

describe('FormFieldGenerator', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    fs.mkdirSync(path.join(tempRoot, 'form-config'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should generate a form configuration file', async () => {
    const generator = new FormFieldGenerator({
      name: 'test-1.0-draft',
      type: 'test',
      root: tempRoot
    });

    await generator.generate();

    const formPath = path.join(tempRoot, 'form-config', 'test-1.0-draft.js');
    expect(fs.existsSync(formPath)).to.be.true;
    
    const content = fs.readFileSync(formPath, 'utf-8');
    expect(content).to.contain("name: 'test-1.0-draft'");
    expect(content).to.contain("type: 'test'");
    expect(content).to.contain("class: 'TextField'");
    expect(content).to.contain("class: 'TextArea'");
    expect(content).to.contain("class: \"ButtonBarContainer\"");
  });

  it('should respect dry-run option', async () => {
    const generator = new FormFieldGenerator({
      name: 'dryrun-1.0-draft',
      type: 'test',
      dryRun: true,
      root: tempRoot
    });

    await generator.generate();

    const formPath = path.join(tempRoot, 'form-config', 'dryrun-1.0-draft.js');
    expect(fs.existsSync(formPath)).to.be.false;
  });
});
