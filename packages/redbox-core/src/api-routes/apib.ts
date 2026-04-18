import { ApiRouteDefinition } from './types';
import { ensureUniqueApiRoutes, getFileConstraintDescription } from './helpers';

export interface ApiBlueprintBuildOptions {
  branding?: string;
  portal?: string;
}

function toApibPath(path: string): string {
  return path
    .replace(/:([A-Za-z0-9_]+)\*/g, '{$1}')
    .replace(/:([A-Za-z0-9_]+)\?/g, '{$1}')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function specializeApibPath(path: string, options: ApiBlueprintBuildOptions): string {
  const branding = options.branding?.trim();
  const portal = options.portal?.trim();
  if (!branding && !portal) {
    return path;
  }

  const genericPrefix = '/{branding}/{portal}';
  if (!path.startsWith(genericPrefix)) {
    return path;
  }

  const specializedPrefix = `/${branding || '{branding}'}/${portal || '{portal}'}`;
  return `${specializedPrefix}${path.slice(genericPrefix.length)}`;
}

export function buildApiBlueprint(routes: readonly ApiRouteDefinition[], options: ApiBlueprintBuildOptions = {}): string {
  const lines: string[] = ['FORMAT: 1A', 'HOST: http://localhost'];
  for (const route of ensureUniqueApiRoutes(routes, 'APIB blueprint')) {
    lines.push('');
    lines.push(`${route.method.toUpperCase()} ${specializeApibPath(toApibPath(route.path), options)}`);
    if (route.summary) {
      lines.push(`+ Summary: ${route.summary}`);
    }
    if (route.description) {
      lines.push(`+ Description: ${route.description}`);
    }
    if (route.request?.files) {
      for (const [name, constraint] of Object.entries(route.request.files)) {
        lines.push(`+ File ${name}: ${getFileConstraintDescription(name, constraint)}`);
      }
    }
  }
  return lines.join('\n');
}
