import get from 'lodash/get';

export interface BrandConfigurationDependencies {
  readonly defaultBrand: string;
  /** Read the current hydrated AppConfig/Branding state on every operation. */
  readonly readBrand: (name: string) => unknown;
  readonly defaults: unknown;
  /** Only the comparison adapter supplies the old per-brand startup map. */
  readonly legacy?: unknown;
}

/** Request-time resolution, with no extra cache or mutation of startup settings. */
export function resolveBrandConfiguration(
  brandName: string,
  block: string,
  input: BrandConfigurationDependencies
): unknown {
  for (const name of [brandName, input.defaultBrand]) {
    if (!name) continue;
    const value: unknown = get(input.readBrand(name), block);
    if (value !== undefined) return value;
  }
  const fallback: unknown = get(input.defaults, block);
  if (fallback !== undefined) return fallback;
  const legacy: unknown = get(input.legacy, block);
  const value: unknown = get(legacy, brandName);
  return value === undefined ? get(legacy, input.defaultBrand) : value;
}

export class AppConfigAlreadyExistsError extends Error {
  public constructor(key: string, brand: string) {
    super(`Config with key ${key} for branding ${brand} already exists`);
    this.name = 'AppConfigAlreadyExistsError';
  }
}
