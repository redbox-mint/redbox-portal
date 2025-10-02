import { PopulateExportedMethods, Services as coreServices } from '@researchdatabox/redbox-core-types';
import createDOMPurify = require('isomorphic-dompurify');
import domPurify = require('dompurify');
import { Buffer } from 'buffer';
import { JSDOM } from 'jsdom';

declare var sails: any;
declare var _: any;

//TODO: Move to a shared place when we want to reuse dompurify 
type DomPurifyInstance = {
  sanitize: (input: string, config?: Record<string, any>) => string;
  addHook: (hook: string, cb: (...args: any[]) => void) => void;
  removeHook: (hook: string) => void;
};

const isDomPurifyInstance = (candidate: any): candidate is DomPurifyInstance => (
  candidate && typeof candidate.sanitize === 'function' && typeof candidate.addHook === 'function' && typeof candidate.removeHook === 'function'
);

const getWindow = () => {
  const globalWindow = (globalThis as any).window;
  if (globalWindow && typeof globalWindow.document !== 'undefined') {
    return globalWindow;
  }

  const cacheKey = '__svgSanitizerWindow';
  if (!(globalThis as any)[cacheKey]) {
    const { window } = new JSDOM('', { pretendToBeVisual: true });
    (globalThis as any)[cacheKey] = window;
  }

  return (globalThis as any)[cacheKey];
};

const instantiateDomPurify = (factoryModule: any): DomPurifyInstance | null => {
  if (!factoryModule) {
    return null;
  }

  const windowRef = getWindow();

  const tryGet = (candidate: any) => (isDomPurifyInstance(candidate) ? candidate : null);

  const candidates = [
    () => tryGet(factoryModule),
    () => tryGet(factoryModule?.default),
    () => tryGet(factoryModule?.DOMPurify),
    () => {
      if (typeof factoryModule?.createDOMPurify === 'function') {
        return tryGet(factoryModule.createDOMPurify(windowRef));
      }
      return null;
    },
    () => {
      if (typeof factoryModule === 'function') {
        return tryGet(factoryModule(windowRef));
      }
      return null;
    },
    () => {
      if (typeof factoryModule?.default === 'function') {
        return tryGet(factoryModule.default(windowRef));
      }
      return null;
    }
  ];

  for (const resolver of candidates) {
    try {
      const instance = resolver();
      if (instance) {
        return instance;
      }
    } catch (error) {
      sails?.log?.silly?.('SvgSanitizerService:: DOMPurify instantiation attempt failed', error);
    }
  }

  return null;
};

const initialiseDOMPurify = (): DomPurifyInstance => {
  const instanceFromIso = instantiateDomPurify(createDOMPurify);
  if (instanceFromIso) {
    return instanceFromIso;
  }

  const instanceFromDomPurify = instantiateDomPurify(domPurify);
  if (instanceFromDomPurify) {
    return instanceFromDomPurify;
  }

  throw new Error('SvgSanitizerService: Failed to initialise DOMPurify with hook support');
};

const DOMPurify = initialiseDOMPurify();

(globalThis as any).DOMPurify = DOMPurify;

export module Services {
  /**
   * SVG and DOM sanitization service using DOMPurify.
   * 
   * This service provides secure sanitization of SVG and other DOM content using
   * configurable DOMPurify profiles defined in config/dompurify.js.
   * 
   * Security Approach & OWASP References:
   * ======================================
   * This service implements defense-in-depth sanitization following OWASP recommendations:
   * 
   * 1. **DOMPurify Library** (OWASP Recommended):
   *    - Uses DOMPurify, an OWASP-recommended DOM sanitization library
   *    - Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#html-sanitization
   *    - DOMPurify GitHub: https://github.com/cure53/DOMPurify
   *    - Actively maintained with regular security audits
   * 
   * 2. **Multi-Layer Validation** (Defense in Depth):
   *    - Pre-sanitization validation: Size limits, structural checks, dangerous pattern detection
   *    - DOMPurify sanitization: Main sanitization pass with configurable profiles
   *    - Post-sanitization validation: Final security checks for remaining dangerous patterns
   *    - Reference: https://owasp.org/www-community/Defense_in_Depth
   * 
   * 3. **SVG-Specific Threats Addressed**:
   *    - Script injection via <script> tags, event handlers (onclick, onload, etc.)
   *    - JavaScript/VBScript protocols in href/xlink:href attributes
   *    - Data URLs that could contain malicious payloads
   *    - Foreign object elements allowing arbitrary HTML injection
   *    - CDATA sections and processing instructions
   *    - External resource references (http/https URLs)
   *    - Reference: https://owasp.org/www-community/attacks/Billion_laughs_attack
   *    - Reference: https://owasp.org/www-community/attacks/Cross-site_Scripting_(XSS)
   * 
   * 4. **Protocol Validation**:
   *    - Blocks dangerous protocols: javascript:, vbscript:, data:, file:, etc.
   *    - Blocks external references to prevent privacy leaks and SSRF
   *    - Reference: https://cheatsheetseries.owasp.org/cheatsheets/AJAX_Security_Cheat_Sheet.html
   * 
   * 5. **Content Security Policy (CSP) Compatible**:
   *    - Sanitized content is safe for use with strict CSP
   *    - No inline scripts or event handlers in output
   *    - Reference: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
   * 
   * 6. **Size & Complexity Limits**:
   *    - Prevents billion laughs attacks and resource exhaustion
   *    - Configurable maximum size limits
   *    - Nesting depth validation
   * 
   * Available profiles:
   * - 'svg': Strict SVG sanitization for user-uploaded SVG files
   * - 'html': General HTML content sanitization for rich text
   * - 'minimal': Light sanitization for trusted content
   * 
   * Usage:
   * - sanitize(svg): Sanitizes SVG content with full validation and error reporting
   * - sanitizeWithProfile(content, profile): Generic sanitization with any profile
   * 
   * Security Notes:
   * - Always validate sanitization results before rendering
   * - Review errors array for blocked threats
   * - Consider additional application-specific validation
   * - Keep DOMPurify updated for latest security patches
   */
  export class SvgSanitizer extends coreServices.Core.Service {

    constructor() {
      super();
      this.logHeader = "SvgSanitizerService::";
    }

    getMaxBytes(): number {
      return _.get(sails.config, 'record.form.svgMaxBytes', 1048576); // 1MB default
    }

    /**
     * Generic DOM sanitization method that can use any configured profile.
     * @param content - The content to sanitize
     * @param profileName - The DOMPurify profile to use
     * @returns Sanitized content
     */
    sanitizeWithProfile(content: string, profileName: string = 'html'): string {
      if (!_.isString(content)) {
        throw new Error('Content must be a string');
      }

      try {
        const config = this.getDOMPurifyConfig(profileName);
        const sanitized = DOMPurify.sanitize(content, config);
        return String(sanitized);
      } catch (error) {
        sails.log.error(`SvgSanitizerService: Error sanitizing content with profile '${profileName}':`, error);
        throw error;
      }
    }

    /**
     * Get DOMPurify configuration for the specified profile.
     * @param profileName - The configuration profile to use (defaults to 'svg')
     */
    private getDOMPurifyConfig(profileName: string = 'svg') {
      const dompurifyConfig = _.get(sails.config, 'dompurify', {});
      const profiles = dompurifyConfig.profiles || {};
      const globalSettings = dompurifyConfig.globalSettings || {};
      
      // Get the requested profile or fall back to default
      const profile = profiles[profileName] || profiles[dompurifyConfig.defaultProfile] || profiles.svg;
      
      if (!profile) {
        sails.log.error(`SvgSanitizerService: DOMPurify profile '${profileName}' not found and no fallback available`);
        throw new Error(`DOMPurify configuration profile '${profileName}' not found`);
      }
      
      // Merge profile settings with global settings
      return {
        ...globalSettings,
        ...profile
      };
    }

    /**
     * Validate href/xlink:href attributes to ensure they are safe.
     */
    private validateHrefAttributes(svg: string): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      // Check for dangerous protocols in href attributes
      const dangerousProtocols = [
        'javascript:', 'vbscript:', 'data:', 'file:', 'ftp:', 'ftps:',
        'chrome:', 'resource:', 'moz-extension:', 'chrome-extension:',
        'ms-appx:', 'ms-appx-web:', 'about:', 'blob:', 'filesystem:'
      ];
      
      // Check for external references (http/https/protocol-relative)
      const externalProtocols = ['http:', 'https:', '//'];
      
      const hrefPattern = /(?:href|xlink:href)\s*=\s*["']([^"']*)["']/gi;
      let match;
      
      while ((match = hrefPattern.exec(svg)) !== null) {
        const url = match[1].toLowerCase().trim();
        
        // Check for dangerous protocols
        for (const protocol of dangerousProtocols) {
          if (url.startsWith(protocol)) {
            if (protocol === 'javascript:') {
              errors.push('javascript-protocol');
            } else if (protocol === 'vbscript:') {
              errors.push('vbscript-protocol');
            } else if (protocol === 'data:') {
              errors.push('data-url-embed');
            } else {
              errors.push('dangerous-protocol');
            }
            break;
          }
        }
        
        // Check for external references
        for (const protocol of externalProtocols) {
          if (url.startsWith(protocol)) {
            errors.push('external-ref');
            break;
          }
        }
      }
      
      return { valid: errors.length === 0, errors };
    }

    /**
     * Sanitize an SVG string using DOMPurify.
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

      // Pre-validation: Check for dangerous patterns before sanitization
      const hrefValidation = this.validateHrefAttributes(svg);
      if (!hrefValidation.valid) {
        errors.push(...hrefValidation.errors);
      }

      // Check for script elements
      if (/<script[\s>]/i.test(svg)) {
        errors.push('script-element');
      }
      
      // Check for foreign object elements
      if (/<foreignObject[\s>]/i.test(svg)) {
        errors.push('foreign-object');
      }

      try {
        // Use DOMPurify to sanitize the SVG
        const config = this.getDOMPurifyConfig();

        const beforeSanitizeElementsHook = (node: any) => {
          if (node.tagName && /^(script|iframe|embed|object|applet)$/i.test(node.tagName)) {
            node.remove();
          }
        };

        const beforeSanitizeAttributesHook = (node: any) => {
          if (node.attributes) {
            const attrs = Array.from(node.attributes);
            attrs.forEach((attr: any) => {
              if (attr.name.toLowerCase().startsWith('on')) {
                node.removeAttribute(attr.name);
                warnings.push('event-handlers-removed');
              }
            });
          }

          const href = node.getAttribute('href') || node.getAttribute('xlink:href');
          if (!href) {
            return;
          }

          const lowerHref = href.toLowerCase().trim();
          const dangerousProtocols = [
            'javascript:', 'vbscript:', 'data:', 'file:', 'chrome:',
            'resource:', 'moz-extension:', 'chrome-extension:', 'ms-appx:',
            'about:', 'blob:', 'filesystem:'
          ];
          const externalProtocols = ['http:', 'https:', '//'];

          let shouldRemove = false;

          for (const protocol of dangerousProtocols) {
            if (lowerHref.startsWith(protocol)) {
              shouldRemove = true;
              break;
            }
          }

          if (!shouldRemove) {
            for (const protocol of externalProtocols) {
              if (lowerHref.startsWith(protocol)) {
                shouldRemove = true;
                errors.push('external-ref');
                break;
              }
            }
          }

          if (shouldRemove) {
            node.removeAttribute('href');
            node.removeAttribute('xlink:href');
          }
        };

        DOMPurify.addHook('beforeSanitizeElements', beforeSanitizeElementsHook);
        DOMPurify.addHook('beforeSanitizeAttributes', beforeSanitizeAttributesHook);

        let sanitized: any;
        try {
          sanitized = DOMPurify.sanitize(svg, config);
        } finally {
          // Remove hooks added in this invocation only (LIFO removal)
          DOMPurify.removeHook('beforeSanitizeAttributes');
          DOMPurify.removeHook('beforeSanitizeElements');
        }
        
        // Post-sanitization validation
        // Convert TrustedHTML to string for further processing
        let working = String(sanitized);
        
        // Final security checks for any remaining dangerous patterns
        const dangerousPatterns = [
          { pattern: /javascript\s*:/gi, error: 'javascript-protocol-found' },
          { pattern: /vbscript\s*:/gi, error: 'vbscript-protocol-found' },
          { pattern: /data\s*:[^#]/gi, error: 'data-protocol-found' },
          { pattern: /<script[\s>]/gi, error: 'script-element-found' },
          { pattern: /<\/script\s*>/gi, error: 'script-closing-tag-found' },
          { pattern: /on\w+\s*=/gi, error: 'event-handler-found' }
        ];
        
        dangerousPatterns.forEach(check => {
          if (check.pattern.test(working)) {
            errors.push(check.error);
            // Remove the dangerous content
            working = working.replace(check.pattern, '');
          }
        });
        
        // Collapse excessive whitespace
        working = working.replace(/\s{2,}/g, ' ').trim();

        const sanitizedBytes = Buffer.byteLength(working, 'utf8');
        const safe = errors.length === 0;
        
        return { 
          safe, 
          sanitized: working, 
          errors, 
          warnings, 
          info: { originalBytes, sanitizedBytes } 
        };
        
      } catch (error) {
        // Handle any DOMPurify errors
        errors.push('sanitization-error');
        sails.log.error('SVG sanitization error:', error);
        
        return { 
          safe: false, 
          sanitized: '', 
          errors, 
          warnings, 
          info: { originalBytes, sanitizedBytes: 0 } 
        };
      }
    }
  }
}

declare var module: any;
declare var exports: any;

export default Services;
PopulateExportedMethods(Services.SvgSanitizer);

module.exports = new Services.SvgSanitizer().exports();