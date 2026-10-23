import { brandingThemeAllowedVariableNames } from '../../services/BrandingThemeTokens';

/** Normal-write callback behavior, including one leading $ and collision insertion order. */
export function normalizeBrandingVariables(
  values: Record<string, unknown>,
  allowList: readonly string[] = brandingThemeAllowedVariableNames
): void {
  if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(values.variables)) {
      normalized[key.startsWith('$') ? key.slice(1) : key] = (values.variables as Record<string, unknown>)[key];
    }
    values.variables = normalized;
  }
  if (!values.variables) return;
  if (
    typeof values.variables !== 'object' ||
    Array.isArray(values.variables) ||
    !Object.keys(values.variables).every(key => allowList.includes(key.startsWith('$') ? key.slice(1) : key))
  ) {
    throw new Error('Invalid variable key supplied (not in allowlist)');
  }
}
