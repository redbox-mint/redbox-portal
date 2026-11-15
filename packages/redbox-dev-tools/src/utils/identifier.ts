import { ts } from 'ts-morph';

/** One spelling for generated TypeScript symbols and API2 action identifiers. */
export function identifier(value: string, kind: 'action' | 'class' = 'action'): string {
  const name = value.trim().replace(/[-\s]+([A-Za-z0-9])/g, (_match, next: string) => next.toUpperCase());
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false);
  scanner.setText(name);
  if (
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ||
    (kind === 'class' && scanner.scan() !== ts.SyntaxKind.Identifier) ||
    [
      'constructor',
      '__proto__',
      'prototype',
      'input',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ].includes(name)
  )
    throw new Error(`Invalid generated identifier: ${JSON.stringify(value)}`);
  return name;
}
