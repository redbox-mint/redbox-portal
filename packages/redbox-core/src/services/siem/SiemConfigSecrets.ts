import { isSiemSecretHeader, SiemConfigurationError } from '../../configmodels/SiemConfiguration';

/** A destination ID is identity, not authorization to move its credentials. */
export function assertSiemCredentialTarget(incoming: unknown, existing: unknown): void {
  const endpoint = (destination: unknown): unknown => {
    const value: unknown = Reflect.get(Object(destination), 'endpointUrl');
    if (typeof value !== 'string') return value;
    try { return new URL(value).href; } catch { return value; }
  };
  if (endpoint(incoming) !== endpoint(existing) ||
      Reflect.get(Object(incoming), 'adapterType') !== Reflect.get(Object(existing), 'adapterType')) {
    throw new SiemConfigurationError(
      `Destination "${Reflect.get(Object(incoming), 'id')}" changed endpoint or adapter. Replace or explicitly clear every masked credential before saving or testing.`
    );
  }
}

// Paths are segment arrays so header names containing dots cannot change traversal.
export function siemSecretPaths(config: unknown): string[][] {
  const destinations: unknown = Reflect.get(Object(config), 'destinations');
  if (!Array.isArray(destinations)) return [];
  return destinations.flatMap((destination, index) => {
    const paths = [
      ['destinations', String(index), 'token'],
      ['destinations', String(index), 'password'],
    ];
    const headers: unknown = Reflect.get(Object(destination), 'headers');
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const name of Object.keys(headers))
        if (isSiemSecretHeader(name)) paths.push(['destinations', String(index), 'headers', name]);
    }
    return paths;
  });
}
export function existingSiemSecretPath(incoming: unknown, existing: unknown, path: string[]): string[] | undefined {
  const incomingDestinations: unknown = Reflect.get(Object(incoming), 'destinations');
  const existingDestinations: unknown = Reflect.get(Object(existing), 'destinations');
  if (!Array.isArray(incomingDestinations) || !Array.isArray(existingDestinations)) return undefined;
  const id: unknown = Reflect.get(Object(incomingDestinations[Number(path[1])]), 'id');
  if (typeof id !== 'string' || !id.trim()) return undefined;
  const index = existingDestinations.findIndex(d => Reflect.get(Object(d), 'id') === id);
  if (index < 0) return undefined;
  assertSiemCredentialTarget(incomingDestinations[Number(path[1])], existingDestinations[index]);
  if (path[2] !== 'headers') return ['destinations', String(index), path[2]];
  const headers: unknown = Reflect.get(Object(existingDestinations[index]), 'headers');
  if (!headers || typeof headers !== 'object') return undefined;
  const key = Object.keys(headers).find(key => key.toLowerCase() === path[3].toLowerCase());
  return key === undefined ? undefined : ['destinations', String(index), 'headers', key];
}

/** Collector responses may echo credentials; never return those values to the browser. */
export function sanitizeSiemTestResponse(value: unknown, destination: unknown): unknown {
  const secrets: string[] = [];
  for (const path of siemSecretPaths({ destinations: [destination] })) {
    let current: unknown = { destinations: [destination] };
    for (const segment of path) current = Reflect.get(Object(current), segment);
    if (typeof current === 'string' && current) secrets.push(current);
  }
  const username: unknown = Reflect.get(Object(destination), 'username');
  const password: unknown = Reflect.get(Object(destination), 'password');
  if (typeof username === 'string' && typeof password === 'string' && password)
    secrets.push(Buffer.from(`${username}:${password}`).toString('base64'));
  function sanitize(item: unknown): unknown {
    if (typeof item === 'string') {
      let result = item;
      for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
      return result;
    }
    if (Array.isArray(item)) return item.map(sanitize);
    if (item && typeof item === 'object')
      return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, sanitize(value)]));
    return item;
  }
  return sanitize(value);
}
