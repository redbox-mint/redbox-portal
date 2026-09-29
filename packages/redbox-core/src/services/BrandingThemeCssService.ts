import crypto from 'crypto';
import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import { Services as services } from '../CoreService';
import {
  brandingThemeEditableAliasMap,
  brandingThemeEditableTokenMap,
  brandingThemeTokens,
  type BrandingThemeToken,
} from './BrandingThemeTokens';
import {
  BRANDING_TYPEFACE_SLOTS,
  normalizeTypefaceState,
  type BrandingTypefaceSlot,
  type BrandingTypefaceState,
} from '../model/BrandingTypeface';

const compatTokenKeys = ['primary', 'secondary', 'success', 'info', 'warning', 'danger', 'light', 'dark'];
const compatTokens = brandingThemeTokens.filter(token => compatTokenKeys.includes(token.key));

/** Fixed internal CSS family alias for an active Brand Typeface (design.md section 9). */
export const BRAND_TYPEFACE_CSS_FAMILY = 'ReDBox Brand Typeface';
const BRAND_TYPEFACE_FALLBACK_STACK = `'ReDBox Brand Typeface', 'Helvetica Neue', Arial, sans-serif`;
/** Relative @font-face URL: normal and preview CSS share the same path depth below rootContext. */
const TYPEFACE_CSS_URL_PREFIX = '../../../fonts/branding';

const SLOT_CSS_DESCRIPTORS: Record<BrandingTypefaceSlot, { weight: number; style: string }> = {
  regular: { weight: 400, style: 'normal' },
  bold: { weight: 700, style: 'normal' },
  italic: { weight: 400, style: 'italic' },
  boldItalic: { weight: 700, style: 'italic' },
};

export interface BrandingThemeCssOptions {
  /** Normalised-or-raw typeface snapshot; absent/null means Default Typography. */
  typeface?: BrandingTypefaceState | null;
  /** Brand name for the same-origin font URL (required for custom snapshots). */
  brandName?: string;
}

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
        return `#${hex
          .split('')
          .map(char => char + char)
          .join('')}`;
      }
      return `#${hex}`;
    }

    private resolveToken(rawKey: string): BrandingThemeToken | undefined {
      const key = rawKey.startsWith('$') ? rawKey.slice(1) : rawKey;
      return brandingThemeEditableTokenMap.get(key) || brandingThemeEditableAliasMap.get(key);
    }

    private normalizeVariables(
      variables: Record<string, string>,
      opts?: { ignoreUnknownKeys?: boolean }
    ): Record<string, string> {
      const normalized: Record<string, string> = {};
      for (const [rawKey, rawValue] of Object.entries(variables || {})) {
        const token = this.resolveToken(rawKey);
        if (!token) {
          if (opts?.ignoreUnknownKeys) {
            continue;
          }
          throw new Error(`Invalid variable key: ${rawKey.startsWith('$') ? rawKey.slice(1) : rawKey}`);
        }
        if (typeof rawValue !== 'string') {
          throw new Error(`Invalid variable value: ${token.key}`);
        }
        const value = this.normalizeHex(rawValue);
        if (!/^#[0-9a-f]{6}$/.test(value)) {
          if (opts?.ignoreUnknownKeys) {
            continue;
          }
          throw new Error(`Invalid variable value: ${token.key}`);
        }
        normalized[token.key] = value;
      }
      return normalized;
    }

    validateVariables(variables: Record<string, string>): Record<string, string> {
      return this.normalizeVariables(variables);
    }

    private getVariableValue(normalized: Record<string, string>, token: BrandingThemeToken): string {
      return normalized[token.key] || token.defaultValue;
    }

    private buildRootCss(normalized: Record<string, string>, customTypeface = false): string {
      const variableLines = brandingThemeTokens.map(token => {
        const value =
          customTypeface && token.key === 'print-font-family'
            ? 'var(--rb-brand-font-family)'
            : this.getVariableValue(normalized, token);
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
      return compatTokens
        .flatMap(token => [
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
        ])
        .join('\n');
    }

    generate(variables: Record<string, string>, opts?: BrandingThemeCssOptions): { css: string; hash: string } {
      const normalized = this.normalizeVariables(variables || {}, { ignoreUnknownKeys: true });
      const typefaceCss = this.buildTypefaceCss(opts?.typeface ?? null, opts?.brandName);
      const css = [
        typefaceCss,
        this.buildRootCss(normalized, normalizeTypefaceState(opts?.typeface).mode === 'custom'),
        this.buildCompatibilityCss(),
      ]
        .filter(block => block.length > 0)
        .join('\n\n');
      const hash = crypto.createHash('sha256').update(css).digest('hex').slice(0, 32);
      return { css, hash };
    }

    /**
     * Fixed @font-face declarations plus the internal brand font-family variable.
     * Returns '' for Default Typography so no-custom output stays byte-identical.
     * Only server-derived slot descriptors, hashes, and the fixed alias enter CSS:
     * filenames and embedded family names never do.
     */
    private buildTypefaceCss(typeface: BrandingTypefaceState | null | undefined, brandName?: string): string {
      const state = normalizeTypefaceState(typeface);
      if (state.mode !== 'custom') {
        return '';
      }
      if (!brandName) {
        throw new Error('Brand name is required for custom typeface CSS');
      }
      const encodedBrand = encodeURIComponent(brandName);
      const faces = BRANDING_TYPEFACE_SLOTS.flatMap(slot => {
        const face = state.faces?.[slot];
        if (!face) {
          return [];
        }
        const descriptor = SLOT_CSS_DESCRIPTORS[slot];
        return [
          [
            '@font-face {',
            `  font-family: '${BRAND_TYPEFACE_CSS_FAMILY}';`,
            `  font-style: ${descriptor.style};`,
            `  font-weight: ${descriptor.weight};`,
            '  font-display: swap;',
            `  src: url('${TYPEFACE_CSS_URL_PREFIX}/${encodedBrand}/${face.sha256}.woff2') format('woff2');`,
            '}',
          ].join('\n'),
        ];
      });
      const variable = [':root,', ':host {', `  --rb-brand-font-family: ${BRAND_TYPEFACE_FALLBACK_STACK};`, '}'].join(
        '\n'
      );
      return [...faces, variable].join('\n\n');
    }
  }
}

declare global {
  let BrandingThemeCssService: Services.BrandingThemeCss;
}
