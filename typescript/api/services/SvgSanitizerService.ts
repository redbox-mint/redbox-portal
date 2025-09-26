import { PopulateExportedMethods, Services as coreServices } from '@researchdatabox/redbox-core-types';

declare var sails: any;
declare var _: any;

/**
 * SvgSanitizerService
 * Sanitize uploaded SVGs.
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
      
      // Enhanced input validation
      if (!_.isString(svg)) {
        errors.push('not-a-string');
        return { safe: false, sanitized: '', errors, warnings, info: { originalBytes: 0, sanitizedBytes: 0 } };
      }
      
      // Check for null bytes and other control characters
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(svg)) {
        errors.push('contains-control-characters');
      }
      
      const originalBytes = Buffer.byteLength(svg, 'utf8');
      const max = this.getMaxBytes();
      if (originalBytes > max) {
        errors.push('too-large');
      }
      
      // Additional size check - prevent extremely long strings
      if (svg.length > max) {
        errors.push('string-too-long');
      }
      // Basic structural check
      if (!/<svg[\s>]/i.test(svg)) {
        errors.push('missing-svg-root');
      }

      // Check for excessive nesting (prevent billion laughs attack)
      const nestingLevel = (svg.match(/<[^\/][^>]*>/g) || []).length;
      if (nestingLevel > 1000) {
        errors.push('excessive-nesting');
      }

      // Check for suspicious CDATA sections
      if (/<!\[CDATA\[/i.test(svg)) {
        errors.push('cdata-section');
      }

      // Check for processing instructions
      if (/<\?\w+/i.test(svg)) {
        warnings.push('processing-instructions');
      }

      let working = svg;
      // Remove XML declaration & DOCTYPE for safety
      working = working.replace(/<\?xml[^>]*\?>/gi, '');
      working = working.replace(/<!DOCTYPE[^>]*>/gi, '');
      
      // Remove CDATA sections which can contain executable content
      working = working.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '');
      
      // Remove processing instructions
      working = working.replace(/<\?\w+[^>]*\?>/gi, '');
      
      // Remove comments that might contain executable content
      working = working.replace(/<!--[\s\S]*?-->/g, '');

      // Detect data URL embeds in href / xlink:href (more comprehensive)
      const dataUrlPattern = /(?:xlink:)?href\s*=\s*["']?data:/i;
      if (dataUrlPattern.test(working)) {
        errors.push('data-url-embed');
      }

      // Reject external references in href / xlink:href (more comprehensive)
      const externalRefPattern = /(?:xlink:)?href\s*=\s*["']?(?:https?:|\/\/|ftp:|ftps:)/i;
      if (externalRefPattern.test(working)) {
        errors.push('external-ref');
      }

      // Check for other dangerous protocols
      const dangerousProtocolPattern = /(?:xlink:)?href\s*=\s*["']?(?:javascript:|vbscript:|file:|chrome:|resource:)/i;
      if (dangerousProtocolPattern.test(working)) {
        errors.push('dangerous-protocol');
      }

      // Remove script & foreignObject elements entirely
      if (/<script[\s>]/i.test(working)) {
        errors.push('script-element');
      }
      if (/<foreignObject[\s>]/i.test(working)) {
        errors.push('foreign-object');
      }
      // Remove <script> and <foreignObject> elements repeatedly until gone
      // Use non-greedy matching and limit iterations to prevent ReDoS attacks
      let prevWorking;
      let iterations = 0;
      const maxIterations = 100; // Prevent infinite loops
      do {
        prevWorking = working;
        // More robust regex patterns to avoid ReDoS
        working = working
          .replace(/<script(?:\s[^>]*)?>/gi, '')
          .replace(/<\/script\s*>/gi, '')
          .replace(/<foreignObject(?:\s[^>]*)?>/gi, '')
          .replace(/<\/foreignObject\s*>/gi, '');
        iterations++;
      } while (working !== prevWorking && iterations < maxIterations);

      // Strip event handler attributes (on*)
      if (/ on[a-z]+=/i.test(working)) {
        warnings.push('event-handlers-removed');
      }
      // Remove all event handler attributes in a loop until none remain
      // Use safer regex patterns to prevent ReDoS and catch more variations
      let prevWorkingAttrs;
      let attrIterations = 0;
      const maxAttrIterations = 50;
      do {
        prevWorkingAttrs = working;
        // More comprehensive event handler removal
        working = working
          .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
          .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
          .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, ''); // Handle unquoted attributes
        attrIterations++;
      } while (working !== prevWorkingAttrs && attrIterations < maxAttrIterations);

      // Strip potentially dangerous namespace script references (multiple protocols)
      const scriptProtocols = ['javascript:', 'vbscript:', 'data:text/html', 'data:application/'];
      let foundDangerousProtocol = false;
      
      for (const protocol of scriptProtocols) {
        const regex = new RegExp(protocol.replace(':', '\\s*:'), 'gi');
        if (regex.test(working)) {
          foundDangerousProtocol = true;
          working = working.replace(regex, '');
        }
      }
      
      if (foundDangerousProtocol) {
        errors.push('dangerous-script-protocol');
      }

      // Remove any remaining suspicious attributes that could execute code
      const dangerousAttrs = ['onload', 'onerror', 'onmouseover', 'onmouseout', 'onclick', 'onfocus', 'onblur'];
      dangerousAttrs.forEach(attr => {
        const attrRegex = new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>]+`, 'gi');
        working = working.replace(attrRegex, '');
      });

      // Remove any <use> elements with external references
      if (/<use[\s\S]*?xlink:href\s*=\s*["']?(?:https?:|\/\/)/i.test(working)) {
        errors.push('external-use-element');
        working = working.replace(/<use[\s\S]*?\/?>|<use[\s\S]*?<\/use>/gi, '');
      }

      // Collapse excessive whitespace
      working = working.replace(/\s{2,}/g, ' ').trim();

      // Final security check - ensure no dangerous patterns remain
      const finalDangerousPatterns = [
        /javascript\s*:/i,
        /vbscript\s*:/i,
        /data\s*:\s*text\/html/i,
        /<script[\s>]/i,
        /<iframe[\s>]/i,
        /<embed[\s>]/i,
        /<object[\s>]/i,
        /<applet[\s>]/i,
        /<meta[\s>]/i,
        /<link[\s>]/i,
        /<style[\s>]/i
      ];

      for (const pattern of finalDangerousPatterns) {
        if (pattern.test(working)) {
          errors.push('dangerous-content-detected');
          // Remove the dangerous content
          working = working.replace(pattern, '');
          break;
        }
      }

      const sanitizedBytes = Buffer.byteLength(working, 'utf8');
      const safe = errors.length === 0;
      return { safe, sanitized: working, errors, warnings, info: { originalBytes, sanitizedBytes } };
    }
  }
}

module.exports = new Services.SvgSanitizer().exports();
