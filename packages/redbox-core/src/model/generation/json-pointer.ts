import { GenerationError } from './errors';

export function decodeJsonPointer(pointer: string): string[] {
  if (!pointer.startsWith('/') || pointer.includes('..') || pointer.includes('\\')) {
    throw new GenerationError('GENERATION_PROFILE_INVALID', 'Invalid JSON pointer');
  }
  const parts = pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (parts.some(part => part === '__proto__' || part === 'constructor' || part === 'prototype')) {
    throw new GenerationError('GENERATION_PROFILE_INVALID', 'JSON pointer contains a reserved property');
  }
  return parts;
}

export function getJsonPointer(value: unknown, pointer: string): unknown {
  return decodeJsonPointer(pointer).reduce<unknown>((current, key) =>
    current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value);
}

export function setJsonPointer(target: Record<string, unknown>, pointer: string, value: unknown): void {
  const parts = decodeJsonPointer(pointer);
  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) current[part] = value;
    else {
      const child = current[part];
      current[part] = child && typeof child === 'object' && !Array.isArray(child) ? child : {};
      current = current[part] as Record<string, unknown>;
    }
  });
}
