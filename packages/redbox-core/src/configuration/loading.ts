import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ConfigurationError,
  isConfigurationObject,
  resolveStartupConfiguration,
  type ConfigurationLayer,
  type StartupConfigurationOptions,
} from './resolution';

async function load(file: string | undefined, source: string): Promise<ConfigurationLayer | undefined> {
  if (file === undefined) return;
  let values: unknown;
  try {
    const loaded: Record<string, unknown> = await import(pathToFileURL(path.resolve(file)).href);
    values = loaded.default;
  } catch {
    throw new ConfigurationError(source, 'root', 'cannot asynchronously load the selected configuration module');
  }
  if (!isConfigurationObject(values))
    throw new ConfigurationError(source, 'root', 'module must default-export configuration data');
  return { source, values };
}

/** Explicit v6 files; never scans generated config shims or executes legacy bootstrap. */
export async function loadStartupConfiguration<T extends Record<string, unknown>>(
  options: Omit<StartupConfigurationOptions<T>, 'application' | 'environment' | 'local'> & {
    readonly files?: { readonly application?: string; readonly environment?: string; readonly local?: string };
  }
): Promise<Readonly<T>> {
  const application = await load(options.files?.application, 'application file');
  const environment = await load(options.files?.environment, 'selected environment file');
  const local = await load(options.files?.local, 'local file');
  return resolveStartupConfiguration({ ...options, application, environment, local });
}
