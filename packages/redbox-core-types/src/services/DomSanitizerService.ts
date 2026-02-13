import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import { Services as coreServices } from '../CoreService';
import type { DomPurifyConfig } from '../config/dompurify.config';

import domPurify = require('dompurify');
import { Buffer } from 'buffer';
import { JSDOM } from 'jsdom';


//TODO: Move to a shared place when we want to reuse dompurify 
type DomPurifyInstance = {
  sanitize: (input: string, config?: Record<string, unknown>) => string;
  addHook: (hook: string, cb: (...args: unknown[]) => void) => void;
  removeHook: (hook: string) => void;
};

type WindowLike = {
  document?: unknown;
};

type SanitizerAttribute = {
  name: string;
};

type SanitizerNode = {
  tagName?: string;
  attributes?: ArrayLike<SanitizerAttribute>;
  remove: () => void;
  removeAttribute: (name: string) => void;
  getAttribute: (name: string) => string | null;
};

const isDomPurifyInstance = (candidate: unknown): candidate is DomPurifyInstance => {
  if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  return typeof record.sanitize === 'function'
    && typeof record.addHook === 'function'
    && typeof record.removeHook === 'function';
};

const isSanitizerNode = (candidate: unknown): candidate is SanitizerNode => {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  return typeof record.remove === 'function'
    && typeof record.removeAttribute === 'function'
    && typeof record.getAttribute === 'function';
};

const isDomPurifyConfig = (candidate: unknown): candidate is DomPurifyConfig => {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  return typeof record.profiles === 'object' && record.profiles !== null;
};

const getWindow = () => {
  const globalCache = globalThis as typeof globalThis & {
    window?: WindowLike;
    DOMPurify?: DomPurifyInstance;
    __domSanitizerWindow?: WindowLike;
  } & Record<string, unknown>;
  const globalWindow = globalCache.window;
  if (globalWindow && typeof globalWindow.document !== 'undefined') {
    return globalWindow;
  }

  const cacheKey = '__domSanitizerWindow';
  if (!globalCache[cacheKey]) {
    const { window } = new JSDOM('', { pretendToBeVisual: true });
    globalCache[cacheKey] = window;
  }

  return globalCache[cacheKey] as WindowLike;
};

const instantiateDomPurify = (factoryModule: unknown): DomPurifyInstance | null => {
  if (!factoryModule) {
    return null;
  }

  const windowRef = getWindow();

  const tryGet = (candidate: unknown) => (isDomPurifyInstance(candidate) ? candidate : null);
  const moduleRecord = (typeof factoryModule === 'object' || typeof factoryModule === 'function')
    ? (factoryModule as Record<string, unknown>)
    : null;

  const candidates = [
    () => tryGet(factoryModule),
    () => tryGet(moduleRecord?.default),
    () => tryGet(moduleRecord?.DOMPurify),
    () => {
      const createDOMPurify = moduleRecord?.createDOMPurify;
      if (typeof createDOMPurify === 'function') {
        return tryGet((createDOMPurify as (window: WindowLike) => unknown)(windowRef));
      }
      return null;
    },
    () => {
      if (typeof factoryModule === 'function') {
        return tryGet((factoryModule as (window: WindowLike) => unknown)(windowRef));
      }
      return null;
    },
    () => {
      const defaultExport = moduleRecord?.default;
      if (typeof defaultExport === 'function') {
        return tryGet((defaultExport as (window: WindowLike) => unknown)(windowRef));
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
      sails?.log?.silly?.('DomSanitizerService:: DOMPurify instantiation attempt failed', error);
    }
  }

  return null;
};

const initialiseDOMPurify = (): DomPurifyInstance => {
  const instanceFromDomPurify = instantiateDomPurify(domPurify);
  if (instanceFromDomPurify) {
    return instanceFromDomPurify;
  }

  throw new Error('DomSanitizerService: Failed to initialise DOMPurify with hook support');
};

const DOMPurify = initialiseDOMPurify();

(globalThis as typeof globalThis & { DOMPurify?: DomPurifyInstance }).DOMPurify = DOMPurify;

const createDOMPurifyForCall = (): DomPurifyInstance => {
  const windowRef = getWindow();
  const moduleRecord = (typeof domPurify === 'object' || typeof domPurify === 'function')
    ? (domPurify as unknown as Record<string, unknown>)
    : null;

  const createDOMPurify =
    (typeof moduleRecord?.createDOMPurify === 'function' && moduleRecord.createDOMPurify)
    || (typeof domPurify === 'function' && domPurify)
    || (typeof moduleRecord?.default === 'function' && moduleRecord.default)
    || null;

  if (typeof createDOMPurify === 'function') {
    try {
      const instance = (createDOMPurify as (window: WindowLike) => unknown)(windowRef);
      if (isDomPurifyInstance(instance)) {
        return instance;
      }
    } catch (error) {
      sails?.log?.silly?.('DomSanitizerService:: per-call DOMPurify creation failed, falling back', error);
    }
  }

  const fallback = instantiateDomPurify(domPurify);
  if (fallback) {
    return fallback;
  }

  throw new Error('DomSanitizerService: Failed to initialise DOMPurify instance for sanitize call');
};

export namespace Services {
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
  export class DomSanitizer extends coreServices.Core.Service {

    constructor() {
      super();
      this.logHeader = "DomSanitizerService::";
    }

    getMaxBytes(): number {
      return _.get(sails.config, 'record.form.svgMaxBytes', 1048576) as number; // 1MB default
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
        sails.log.error(`DomSanitizerService: Error sanitizing content with profile '${profileName}':`, error);
        throw error;
      }
    }

    /**
     * Get DOMPurify configuration for the specified profile.
     * @param profileName - The configuration profile to use (defaults to 'svg')
     */
    private getDOMPurifyConfig(profileName: string = 'svg') {
      const rawConfig = _.get(sails.config, 'dompurify', {});
      const dompurifyConfig = isDomPurifyConfig(rawConfig)
        ? rawConfig
        : ({ profiles: {}, defaultProfile: 'svg', hooks: {}, globalSettings: {} } as DomPurifyConfig);
      const profiles = dompurifyConfig.profiles || {};
      const globalSettings = dompurifyConfig.globalSettings || {};

      // Get the requested profile or fall back to default
      const profile = profiles[profileName] || profiles[dompurifyConfig.defaultProfile] || profiles.svg;

      if (!profile) {
        sails.log.error(`DomSanitizerService: DOMPurify profile '${profileName}' not found and no fallback available`);
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

      // Match href attributes with both quoted and unquoted values
      // Group 1: quoted value (single or double quotes)
      // Group 2: unquoted value (non-whitespace, non->)
      const hrefPattern = /(?:href|xlink:href)\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/gi;
      let match;

      while ((match = hrefPattern.exec(svg)) !== null) {
        // Use whichever capture group matched (quoted = group 1, unquoted = group 2)
        const url = (match[1] !== undefined ? match[1] : match[2]).toLowerCase().trim();

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
      if (originalBytes > max || svg.length > max) {
        if (originalBytes > max) {
          errors.push('too-large');
        }
        if (svg.length > max) {
          errors.push('string-too-long');
        }
        return { safe: false, sanitized: '', errors, warnings, info: { originalBytes, sanitizedBytes: 0 } };
      }

      // Basic structural check
      if (!/<svg[\s>]/i.test(svg)) {
        errors.push('missing-svg-root');
      }

      // Check for excessive nesting and element count (resource exhaustion protection)
      const svgStructure = this.inspectSvgStructure(svg);
      if (svgStructure.maxDepth > 1000) {
        errors.push('excessive-nesting');
      }
      if (svgStructure.totalElements > 100000) {
        errors.push('excessive-elements');
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
        // Filter out 'external-ref' as it will be caught by hooks
        errors.push(...hrefValidation.errors.filter(e => e !== 'external-ref'));
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

        const beforeSanitizeElementsHook = (node: unknown) => {
          if (!isSanitizerNode(node)) {
            return;
          }
          if (node.tagName && /^(script|iframe|embed|object|applet)$/i.test(node.tagName)) {
            node.remove();
          }
        };

        const beforeSanitizeAttributesHook = (node: unknown) => {
          if (!isSanitizerNode(node)) {
            return;
          }
          if (node.attributes) {
            const attrs = Array.from(node.attributes);
            attrs.forEach((attr) => {
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

        const domPurifyForCall = createDOMPurifyForCall();
        domPurifyForCall.addHook('beforeSanitizeElements', beforeSanitizeElementsHook);
        domPurifyForCall.addHook('beforeSanitizeAttributes', beforeSanitizeAttributesHook);

        let sanitized: unknown;
        try {
          sanitized = domPurifyForCall.sanitize(svg, config);
        } finally {
          domPurifyForCall.removeHook('beforeSanitizeAttributes');
          domPurifyForCall.removeHook('beforeSanitizeElements');
        }

        // Post-sanitization validation
        // Convert TrustedHTML to string for further processing
        let working = String(sanitized);

        // Final security checks for any remaining dangerous patterns
        const dangerousPatterns = [
          { pattern: /javascript\s*:/gi, error: 'javascript-protocol-found' },
          { pattern: /vbscript\s*:/gi, error: 'vbscript-protocol-found' },
          // Block all data URLs - they can be used to embed malicious content
          // Pattern matches "data:" followed by any content (MIME type, encoding, data)
          // Examples blocked: data:text/html, data:image/svg+xml, data:application/javascript, etc.
          { pattern: /data\s*:[^,\s]*[,\s]/gi, error: 'unsafe-data-url-found' },
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

    private inspectSvgStructure(svg: string): { maxDepth: number; totalElements: number } {
      const tagRegex = /<\s*(\/)?\s*([a-zA-Z][\w:.-]*)([^>]*)>/g;
      let depth = 0;
      let maxDepth = 0;
      let totalElements = 0;

      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(svg)) !== null) {
        const isClosingTag = Boolean(match[1]);
        const trailingSegment = match[3] ?? '';
        const isSelfClosingTag = /\/\s*$/.test(trailingSegment);

        if (isClosingTag) {
          depth = Math.max(0, depth - 1);
          continue;
        }

        totalElements += 1;
        depth += 1;
        if (depth > maxDepth) {
          maxDepth = depth;
        }

        if (isSelfClosingTag) {
          depth = Math.max(0, depth - 1);
        }
      }

      return { maxDepth, totalElements };
    }
  }


}


export default Services;
PopulateExportedMethods(Services.DomSanitizer);

declare global {
  let DomSanitizerService: Services.DomSanitizer;
}
