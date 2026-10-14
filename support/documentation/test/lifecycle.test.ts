import { strict as assert } from 'node:assert';
import ts from 'typescript';
import { lifecycleFor, parseDocumentation } from '../src/lifecycle';

function classFrom(source: string): ts.ClassDeclaration {
  const file = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = file.statements.find(ts.isClassDeclaration);
  if (!declaration) throw new Error('Fixture did not contain a class declaration.');
  return declaration;
}

describe('documentation lifecycle parsing', () => {
  it('parses the custom extension point tag and TypeDoc lifecycle modifiers', () => {
    const supported = classFrom(
      '/** Supported.\n * @extensionPoint Hooks may replace this.\n */ export class Supported {}'
    );
    const experimental = classFrom(
      '/** Trial.\n * @extensionPoint Hooks may try this.\n * @experimental\n */ export class Trial {}'
    );
    const deprecated = classFrom(
      '/** Old.\n * @extensionPoint Hooks may replace this.\n * @deprecated Use NewSurface.\n */ export class Old {}'
    );
    const internal = classFrom('/** Hidden.\n * @internal\n */ export class Hidden {}');

    assert.equal(lifecycleFor(supported), 'supported');
    assert.equal(parseDocumentation(supported).extensionSemantics, 'Hooks may replace this.');
    assert.equal(lifecycleFor(experimental), 'experimental');
    assert.equal(lifecycleFor(deprecated), 'deprecated');
    assert.equal(lifecycleFor(internal), 'internal');
  });

  it('inherits a container lifecycle and lets members override it', () => {
    const declaration = classFrom(`/** @extensionPoint Supported container. */
      export class Container {
        /** Inherits. */ inherited(): void {}
        /** @experimental @extensionPoint Trial member. */ trial(): void {}
        /** @internal */ hidden(): void {}
      }`);
    const inherited = declaration.members[0];
    const trial = declaration.members[1];
    const hidden = declaration.members[2];

    assert.equal(lifecycleFor(declaration), 'supported');
    assert.equal(lifecycleFor(inherited, lifecycleFor(declaration)), 'supported');
    assert.equal(lifecycleFor(trial, lifecycleFor(declaration)), 'experimental');
    assert.equal(lifecycleFor(hidden, lifecycleFor(declaration)), 'internal');
  });

  it('omits legacy author attributions from published summaries', () => {
    const declaration = classFrom(`/**
      * A useful contract summary.
      *
      * Author: <a href="https://example.com/profile">Example Person</a>
      *
      * @extensionPoint Hooks may replace this.
      */
      export class Container {}`);

    assert.equal(parseDocumentation(declaration).summary, 'A useful contract summary.');
  });
});
