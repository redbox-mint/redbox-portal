import crypto from 'crypto';
import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import { Services as services } from '../CoreService';
import {
  brandingThemeEditableAliasMap,
  brandingThemeEditableTokenMap,
  brandingThemeTokens,
  type BrandingThemeToken,
} from './BrandingThemeTokens';

const compatTokenKeys = ['primary', 'secondary', 'success', 'info', 'warning', 'danger', 'light', 'dark'];
const compatTokens = brandingThemeTokens.filter(token => compatTokenKeys.includes(token.key));

export namespace Services {
  @PopulateExportedMethods
  export class BrandingThemeCss extends services.Core.Service {
    getAllowedVariableKeys(): string[] {
      return Array.from(brandingThemeEditableTokenMap.keys());
    }

    normalizeHex(value: string): string {
      const trimmed = value.trim();
      const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
      if (!match) {
        return trimmed;
      }
      const hex = match[1].toLowerCase();
      if (hex.length === 3) {
        return `#${hex.split('').map(char => char + char).join('')}`;
      }
      return `#${hex}`;
    }

    private resolveToken(rawKey: string): BrandingThemeToken | undefined {
      const key = rawKey.startsWith('$') ? rawKey.slice(1) : rawKey;
      return brandingThemeEditableTokenMap.get(key) || brandingThemeEditableAliasMap.get(key);
    }

    validateVariables(variables: Record<string, string>): Record<string, string> {
      const normalized: Record<string, string> = {};
      for (const [rawKey, rawValue] of Object.entries(variables || {})) {
        const token = this.resolveToken(rawKey);
        if (!token) {
          throw new Error(`Invalid variable key: ${rawKey.startsWith('$') ? rawKey.slice(1) : rawKey}`);
        }
        if (typeof rawValue !== 'string') {
          throw new Error(`Invalid variable value: ${token.key}`);
        }
        const value = this.normalizeHex(rawValue);
        if (!/^#[0-9a-f]{6}$/.test(value)) {
          throw new Error(`Invalid variable value: ${token.key}`);
        }
        normalized[token.key] = value;
      }
      return normalized;
    }

    private getVariableValue(normalized: Record<string, string>, token: BrandingThemeToken): string {
      return normalized[token.key] || token.defaultValue;
    }

    private buildRootCss(normalized: Record<string, string>): string {
      const variableLines = brandingThemeTokens.map(token => {
        const value = this.getVariableValue(normalized, token);
        return `  ${token.cssVar}: ${value};`;
      });
      const lines: string[] = [':root {'];
      lines.push(...variableLines);
      lines.push('}', '', ':host {');
      lines.push(...variableLines);
      lines.push('}');
      return lines.join('\n');
    }

    private buildCompatibilityCss(): string {
      return compatTokens.flatMap(token => [
        `.btn-${token.key} {`,
        `  --bs-btn-bg: var(--rb-${token.key});`,
        `  --bs-btn-border-color: var(--rb-${token.key});`,
        `  --bs-btn-hover-bg: var(--rb-${token.key});`,
        `  --bs-btn-hover-border-color: var(--rb-${token.key});`,
        `  --bs-btn-active-bg: var(--rb-${token.key});`,
        `  --bs-btn-active-border-color: var(--rb-${token.key});`,
        '}',
        `.text-${token.key} {`,
        `  color: var(--rb-${token.key}) !important;`,
        '}',
        `.bg-${token.key} {`,
        `  background-color: var(--rb-${token.key}) !important;`,
        '}',
      ]).join('\n');
    }

    generate(variables: Record<string, string>): { css: string; hash: string } {
      const normalized = this.validateVariables(variables || {});
      const css = [this.buildRootCss(normalized), this.buildCompatibilityCss()].join('\n\n');
      const hash = crypto.createHash('sha256').update(css).digest('hex').slice(0, 32);
      return { css, hash };
    }
  }
}

declare global {
  let BrandingThemeCssService: Services.BrandingThemeCss;
}
