import { expect } from 'chai';
import * as completionModule from '../../src/completion';

describe('completion scripts', () => {
  it('should generate bash completion script', () => {
    const script = completionModule.generateCompletionScript('bash');
    expect(script).to.contain('complete -F _redbox_dev_tools_completion redbox-dev-tools');
    expect(script).to.contain('migrate-form-config');
    expect(script).to.contain('form-component');
  });

  it('should generate zsh completion script', () => {
    const script = completionModule.generateCompletionScript('zsh');
    expect(script).to.contain('#compdef redbox-dev-tools');
    expect(script).to.contain('bashcompinit');
  });

  it('should generate fish completion script', () => {
    const script = completionModule.generateCompletionScript('fish');
    expect(script).to.contain('complete -c $__rbhk_cmd');
    expect(script).to.contain('migrate-form-config');
  });

  it('should generate powershell completion script', () => {
    const script = completionModule.generateCompletionScript('powershell');
    expect(script).to.contain('Register-ArgumentCompleter');
    expect(script).to.contain('redbox-dev-tools');
  });

  it('should generate powershell completion script for pwsh alias', () => {
    const script = completionModule.generateCompletionScript('pwsh');
    expect(script).to.contain('Register-ArgumentCompleter');
  });

  it('should throw for unsupported shell', () => {
    expect(() => completionModule.generateCompletionScript('unknown-shell')).to.throw("Unsupported shell 'unknown-shell'");
  });
});
