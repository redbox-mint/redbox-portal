import * as _ from 'lodash';

/** The explicit, request-scoped template API, used by the Express host. */
export interface PageLocalsInput {
  root: string;
  origin: string;
  brand: { name?: string; hash?: string };
  portal: string;
  typeface: { regularUrl: string } | null;
  faviconUrl: string;
  settings: Record<string, unknown>;
  config: Record<string, unknown>;
  t(key: string, context?: Record<string, unknown>): string;
  param(name: string): unknown;
  bundleHash(app: string, prefix: string, before?: string, after?: string, evenEmpty?: boolean): string;
  hasRole(name: string): boolean;
}
export function pageLocals(
  input: PageLocalsInput,
  locals: Record<string, unknown>
): {
  page: PageLocalsInput & { base: string };
  _: Pick<_.LoDashStatic, 'isUndefined'>;
  hasAdminRole(): boolean;
  hasRole(req: unknown, name: string): boolean;
  displayValue(name: string, fallback?: unknown): unknown;
} {
  const base = input.root + '/' + input.brand.name + '/' + input.portal;
  return {
    page: { ...input, base },
    _,
    hasAdminRole: () => input.hasRole('Admin'),
    hasRole: (_req: unknown, name: string) => input.hasRole(name),
    displayValue: (name: string, fallback: unknown = '') => _.get(locals, name, fallback),
  };
}
