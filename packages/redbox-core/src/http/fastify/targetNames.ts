import { createHash } from 'node:crypto';
import { ExtensionError } from '../../extensions/loading';
import { coreHttpNamespaces } from './coreNamespaces';

export const automaticOptionsTarget = 'portal.automatic-options';
const internalPrefixes = ['redbox.internal.', 'portal.automatic-', 'core-native-http-'] as const;
const internalName = (name: string) =>
  name.toLowerCase() === 'redbox.internal' || internalPrefixes.some(prefix => name.toLowerCase().startsWith(prefix));
export function assertPublicHttpName(provider: string, name: string): void {
  if (typeof name === 'string' && internalName(name))
    throw new ExtensionError(provider, 'reserved HTTP target name: ' + name);
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
export function nativeHttpTarget(method: string, url: string, constraints: Record<string, unknown> = {}) {
  return (
    'core-native-http-' +
    digest([method.toUpperCase(), url, Object.entries(constraints).sort(([a], [b]) => a.localeCompare(b))])
  );
}
export function automaticHeadTarget(name: string, path: string) {
  return 'redbox.internal.head.' + digest([name, path]);
}

/** Logical dispatch owners, shared by offline composition, hook resolution and
 * sealed registration. Method/path variants of one declared owner are references,
 * not new declarations. Dynamic native names live in a reserved prefix from the
 * outset; discovering a native route never makes it a public scoped-hook target. */
export class HttpTargetNamespace {
  private readonly targets = new Map<string, { readonly kind: 'route' | 'fallback' | 'internal' }>();
  constructor() {
    for (const name of [
      automaticOptionsTarget,
      'redbox.internal.head',
      'redbox.internal.probe.healthz',
      'redbox.internal.probe.readyz',
      'redbox.internal.native.authentication',
      'redbox.internal.native.provider',
      'redbox.internal.static',
      'redbox.internal.asset',
      'redbox.internal.error',
      'redbox.internal.not-found',
    ])
      this.internal(name);
    // All retained host/static/asset mount owners are reserved even before porting.
    for (const entry of coreHttpNamespaces)
      this.internal('redbox.internal.namespace.' + digest([entry.path, entry.kind, entry.global]));
  }
  declare(provider: string, name: string, kind: 'route' | 'fallback') {
    assertPublicHttpName(provider, name);
    if (this.targets.has(name)) throw new ExtensionError(provider, `${kind} name collides with HTTP target ${name}`);
    this.targets.set(name, Object.freeze({ kind }));
  }
  internal(name: string) {
    if (!internalName(name)) throw new TypeError('Internal HTTP target requires a reserved name');
    if (this.targets.has(name)) throw new TypeError('Duplicate internal HTTP target: ' + name);
    this.targets.set(name, Object.freeze({ kind: 'internal' }));
  }
  reference(name: string) {
    if (!this.targets.has(name)) throw new TypeError('Unregistered HTTP target: ' + name);
  }
  hookTarget(name: string): boolean {
    return (
      typeof name === 'string' &&
      !internalName(name) &&
      ['route', 'fallback'].includes(this.targets.get(name)?.kind ?? '')
    );
  }
  snapshot() {
    return Object.freeze([...this.targets].map(([name, entry]) => Object.freeze({ name, ...entry })));
  }
}
