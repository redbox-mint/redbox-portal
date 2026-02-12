import { expect } from 'chai';
import { generateCompletionScript } from '../../src/completion';

describe('completion scripts', () => {
  it('should generate bash completion script', () => {
    const script = generateCompletionScript('bash');
    expect(script).to.contain('complete -F _redbox_hook_kit_completion redbox-hook-kit');
    expect(script).to.contain('migrate-form-config');
    expect(script).to.contain('form-component');
  });

  it('should generate zsh completion script', () => {
    const script = generateCompletionScript('zsh');
    expect(script).to.contain('#compdef redbox-hook-kit');
    expect(script).to.contain('bashcompinit');
  });

  it('should generate fish completion script', () => {
    const script = generateCompletionScript('fish');
    expect(script).to.contain('complete -c $__rbhk_cmd');
    expect(script).to.contain('migrate-form-config');
  });

  it('should generate powershell completion script', () => {
    const script = generateCompletionScript('powershell');
    expect(script).to.contain('Register-ArgumentCompleter');
    expect(script).to.contain('redbox-hook-kit');
  });

  it('should generate powershell completion script for pwsh alias', () => {
    const script = generateCompletionScript('pwsh');
    expect(script).to.contain('Register-ArgumentCompleter');
  });

  it('should throw for unsupported shell', () => {
    expect(() => generateCompletionScript('unknown-shell')).to.throw("Unsupported shell 'unknown-shell'");
  });
});
