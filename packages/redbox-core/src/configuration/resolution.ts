import { z } from 'zod';
import type { ResolvedExtensions } from '../extensions/resolution';

export class ConfigurationError extends Error {
  public constructor(
    public readonly source: string,
    public readonly path: string,
    reason: string
  ) {
    super(`Configuration ${safe(source)} at ${safe(path)}: ${reason}.`);
    this.name = 'ConfigurationError';
  }
}
function safe(value: string): string {
  return /^[A-Za-z0-9_:@./ -]{1,240}$/.test(value) ? value : '[redacted identifier]';
}
export interface ConfigurationLayer {
  readonly source: string;
  readonly values: Readonly<Record<string, unknown>>;
}
export interface ConfigurationInput {
  readonly path: readonly string[];
  /** Parsing errors are replaced with a value-free diagnostic. */
  parse(value: string): unknown;
}
export interface StartupConfigurationOptions<T extends Record<string, unknown>> {
  readonly schema: z.ZodType<T>;
  readonly core: ConfigurationLayer;
  readonly extensions?: Pick<ResolvedExtensions, 'providers'>;
  readonly application?: ConfigurationLayer;
  readonly environment?: ConfigurationLayer;
  readonly local?: ConfigurationLayer;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly argv?: readonly string[];
  readonly environmentInputs?: Readonly<Record<string, ConfigurationInput>>;
  readonly commandLineInputs?: Readonly<Record<string, ConfigurationInput>>;
  /** Exact dot paths, with * for one map key; only typed executable positions belong here. */
  readonly executablePaths?: readonly string[];
}

export function isConfigurationObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function jobs(value: unknown, source: string): Record<string, unknown> {
  if (!Array.isArray(value)) {
    if (!isConfigurationObject(value)) throw new ConfigurationError(source, 'agendaQueue.jobs', 'expected named jobs');
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const job of value) {
    if (
      !isConfigurationObject(job) ||
      typeof job.name !== 'string' ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(job.name) ||
      ['__proto__', 'constructor', 'prototype'].includes(job.name)
    )
      throw new ConfigurationError(source, 'agendaQueue.jobs', 'expected a bounded job name');
    if (Object.hasOwn(result, job.name)) throw new ConfigurationError(source, 'agendaQueue.jobs', 'duplicate job name');
    const { name, ...definition } = job;
    result[name] = definition;
  }
  return result;
}

/** Own the snapshot without JSON cloning, mutating declarations, or freezing caller objects. */
function copy(
  value: unknown,
  source: string,
  path: string[],
  executable: readonly string[],
  ancestors = new Set<object>()
): unknown {
  if (typeof value === 'function') {
    if (
      !executable.some(
        pattern =>
          pattern.split('.').length === path.length &&
          pattern.split('.').every((part, i) => part === '*' || part === path[i])
      )
    )
      throw new ConfigurationError(source, path.join('.'), 'executable value is not supported here');
    return value;
  }
  if (value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (!Array.isArray(value) && !isConfigurationObject(value))
    throw new ConfigurationError(source, path.join('.'), 'expected plain configuration data');
  if (ancestors.has(value)) throw new ConfigurationError(source, path.join('.'), 'cyclic configuration');
  ancestors.add(value);
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
  for (const [key, entry] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new ConfigurationError(source, path.join('.'), 'unsafe configuration key');
    Reflect.set(result, key, copy(entry, source, [...path, key], executable, ancestors));
  }
  ancestors.delete(value);
  return result;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Pure ordered resolution. No file discovery, repositories, asset writes or workers. */
export function resolveStartupConfiguration<T extends Record<string, unknown>>(
  options: StartupConfigurationOptions<T>
): Readonly<T> {
  const sources = new Map<string, string>();
  const result: Record<string, unknown> = {};
  const merge = (
    target: Record<string, unknown>,
    values: Record<string, unknown>,
    source: string,
    path: string[] = []
  ) => {
    for (const [key, raw] of Object.entries(values)) {
      if (raw === undefined) continue; // undefined contributes no override; null remains an explicit value.
      const location = [...path, key];
      const value = location.join('.') === 'agendaQueue.jobs' ? jobs(raw, source) : raw;
      sources.set(location.join('.'), source);
      if (isConfigurationObject(value)) {
        if (!isConfigurationObject(target[key])) target[key] = {};
        merge(target[key] as Record<string, unknown>, value, source, location);
      } else target[key] = value; // All ordinary arrays replace, including branding defaults.
    }
  };
  const layers = [
    options.core,
    ...(options.extensions?.providers ?? []).flatMap(provider => {
      const declaration = provider.declaration;
      return [
        { source: provider.name, values: declaration.config ?? {} },
        ...(declaration.workflows ? [{ source: provider.name, values: { workflow: declaration.workflows } }] : []),
        ...(declaration.jobs ? [{ source: provider.name, values: { agendaQueue: { jobs: declaration.jobs } } }] : []),
      ];
    }),
    options.application,
    options.environment,
    options.local,
  ].filter((layer): layer is ConfigurationLayer => !!layer);
  const inputs = (
    values: Readonly<Record<string, string | undefined>>,
    bindings: Readonly<Record<string, ConfigurationInput>>,
    source: string
  ) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const binding = bindings[name];
      if (!binding)
        throw new ConfigurationError(source, name, 'unsupported input; convert to the documented ReDBox interface');
      let parsed: unknown;
      try {
        parsed = binding.parse(value);
      } catch {
        throw new ConfigurationError(source, binding.path.join('.'), 'invalid input');
      }
      const contribution: Record<string, unknown> = {};
      let position = contribution;
      for (const key of binding.path.slice(0, -1)) {
        position[key] = {};
        position = position[key] as Record<string, unknown>;
      }
      position[binding.path.at(-1)!] = parsed;
      layers.push({ source, values: contribution });
    }
  };
  // Only the documented namespace is owned; unrelated process environment is ignored.
  inputs(
    Object.fromEntries(Object.entries(options.env ?? {}).filter(([name]) => /^(REDBOX_|sails_)/i.test(name))),
    options.environmentInputs ?? {},
    'environment inputs'
  );
  const cli: Record<string, string> = {};
  for (const argument of options.argv ?? []) {
    const match = /^--([^=]+)=(.*)$/s.exec(argument);
    if (!match || Object.hasOwn(cli, match[1]))
      throw new ConfigurationError('command line', 'arguments', 'expected unique --name=value inputs');
    cli[match[1]] = match[2];
  }
  inputs(cli, options.commandLineInputs ?? {}, 'command line');
  const validate = () => {
    const parsed = options.schema.safeParse(result);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const location = issue.path.map(String);
      if (issue.code === 'unrecognized_keys') location.push(issue.keys[0]);
      let source: string | undefined;
      for (let end = location.length; end > 0 && !source; end--) source = sources.get(location.slice(0, end).join('.'));
      throw new ConfigurationError(
        source ?? options.core.source,
        location.join('.') || 'root',
        `invalid configuration (${issue.code})`
      );
    }
    return parsed.data;
  };
  for (const layer of layers) {
    const values = copy(layer.values, layer.source, [], options.executablePaths ?? []);
    if (!isConfigurationObject(values)) throw new ConfigurationError(layer.source, 'root', 'expected an object');
    merge(result, values, layer.source);
    validate();
  }
  return freeze(validate());
}
