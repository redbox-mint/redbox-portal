import { PopulateExportedMethods, Services as coreServices } from '@researchdatabox/redbox-core-types';

declare var sails: any;
declare var _: any;

/**
 * SvgSanitizerService
 * Task 4: Sanitize uploaded SVGs.
 * - Remove <script>, <foreignObject> elements
 * - Reject external references (http/https protocol or //) in href/xlink:href
 * - Detect data: URL embeds
 * - Strip event handler attributes (on*)
 * - Enforce maximum size (default 512 KB unless sails.config.branding.svgMaxBytes overrides)
 */
export module Services {
  @PopulateExportedMethods
  export class SvgSanitizer extends coreServices.Core.Service {
    getMaxBytes(): number {
      return _.get(sails, 'config.branding.svgMaxBytes', 512 * 1024);
    }

    /**
     * Sanitize an SVG string.
     * Returns object with safety status, sanitized markup, and errors/warnings.
     */
    sanitize(svg: string): {
      safe: boolean;
      sanitized: string;
      errors: string[];
      warnings: string[];
      info: { originalBytes: number; sanitizedBytes: number };
    } {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!_.isString(svg)) {
        errors.push('not-a-string');
        return { safe: false, sanitized: '', errors, warnings, info: { originalBytes: 0, sanitizedBytes: 0 } };
      }
      const originalBytes = Buffer.byteLength(svg, 'utf8');
      const max = this.getMaxBytes();
      if (originalBytes > max) {
        errors.push('too-large');
      }
      // Basic structural check
      if (!/<svg[\s>]/i.test(svg)) {
        errors.push('missing-svg-root');
      }

      let working = svg;
      // Remove XML declaration & DOCTYPE for safety
      working = working.replace(/<\?xml[^>]*>/gi, '');
      working = working.replace(/<!DOCTYPE[^>]*>/gi, '');

      // Detect data URL embeds in href / xlink:href
      const dataUrlPattern = /(xlink:href|href)\s*=\s*"data:/i;
      if (dataUrlPattern.test(working)) {
        errors.push('data-url-embed');
      }

      // Reject external references in href / xlink:href
      const externalRefPattern = /(xlink:href|href)\s*=\s*"(?:https?:|\/\/)/i;
      if (externalRefPattern.test(working)) {
        errors.push('external-ref');
      }

      // Remove script & foreignObject elements entirely
      if (/<script[\s>]/i.test(working)) {
        errors.push('script-element');
      }
      if (/<foreignObject[\s>]/i.test(working)) {
        errors.push('foreign-object');
      }
      working = working
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

      // Strip event handler attributes (on*)
      if (/ on[a-z]+=/i.test(working)) {
        warnings.push('event-handlers-removed');
      }
      working = working.replace(/\s+on[a-z]+="[^"]*"/gi, '');
      working = working.replace(/\s+on[a-z]+='[^']*'/gi, '');

      // Strip potentially dangerous namespace script references (javascript: URLs)
      if (/javascript:/i.test(working)) {
        errors.push('javascript-url');
        working = working.replace(/javascript:/gi, '');
      }

      // Collapse excessive whitespace
      working = working.replace(/\s{2,}/g, ' ').trim();

      const sanitizedBytes = Buffer.byteLength(working, 'utf8');
      const safe = errors.length === 0;
      return { safe, sanitized: working, errors, warnings, info: { originalBytes, sanitizedBytes } };
    }
  }
}

module.exports = new Services.SvgSanitizer().exports();
