export function toParamString(value: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function getRouteParam(req: Pick<import('express').Request, 'params'>, name: string, fallback = ''): string {
  return toParamString(req.params[name], fallback);
}
