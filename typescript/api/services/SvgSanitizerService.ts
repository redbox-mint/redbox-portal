import { PopulateExportedMethods, Services as coreServices } from '@researchdatabox/redbox-core-types';
import DOMPurify from 'isomorphic-dompurify';

declare var sails: any;
declare var _: any;

export module Services {
  /**
   * SVG and DOM sanitization service using DOMPurify.
   * 
   * This service provides secure sanitization of SVG and other DOM content using
   * configurable DOMPurify profiles defined in config/dompurify.js.
   * 
   * Available profiles:
   * - 'svg': Strict SVG sanitization for user-uploaded SVG files
   * - 'html': General HTML content sanitization for rich text
   * - 'minimal': Light sanitization for trusted content
   * 
   * Usage:
   * - sanitize(svg): Sanitizes SVG content with full validation and error reporting
   * - sanitizeWithProfile(content, profile): Generic sanitization with any profile
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
        
        // Add a custom hook to catch any remaining dangerous patterns
        DOMPurify.addHook('beforeSanitizeElements', (node: any) => {
          // Check for dangerous tag names
          if (node.tagName && /^(script|iframe|embed|object|applet)$/i.test(node.tagName)) {
            node.remove();
            return;
          }
        });

        DOMPurify.addHook('beforeSanitizeAttributes', (node: any) => {
          // Remove any attributes that start with 'on' (event handlers)
          if (node.attributes) {
            const attrs = Array.from(node.attributes);
            attrs.forEach((attr: any) => {
              if (attr.name.toLowerCase().startsWith('on')) {
                node.removeAttribute(attr.name);
                warnings.push('event-handlers-removed');
              }
            });
          }
          
          // Validate href/xlink:href attributes
          const href = node.getAttribute('href') || node.getAttribute('xlink:href');
          if (href) {
            const lowerHref = href.toLowerCase().trim();
            
            // Block dangerous protocols
            const dangerousProtocols = [
              'javascript:', 'vbscript:', 'data:', 'file:', 'chrome:',
              'resource:', 'moz-extension:', 'chrome-extension:', 'ms-appx:',
              'about:', 'blob:', 'filesystem:'
            ];
            
            // Block external references
            const externalProtocols = ['http:', 'https:', '//'];
            
            let shouldRemove = false;
            
            for (const protocol of dangerousProtocols) {
              if (lowerHref.startsWith(protocol)) {
                shouldRemove = true;
                break;
              }
            }
            
            for (const protocol of externalProtocols) {
              if (lowerHref.startsWith(protocol)) {
                shouldRemove = true;
                errors.push('external-ref');
                break;
              }
            }
            
            if (shouldRemove) {
              node.removeAttribute('href');
              node.removeAttribute('xlink:href');
            }
          }
        });

        // Sanitize the SVG
        const sanitized = DOMPurify.sanitize(svg, config);

        // Remove hooks after use
        DOMPurify.removeAllHooks();
        
        // Post-sanitization validation
        // Convert TrustedHTML to string for further processing
        let working = String(sanitized);
        
        // Final security checks for any remaining dangerous patterns
        const dangerousPatterns = [
          { pattern: /javascript\s*:/i, error: 'javascript-protocol-found' },
          { pattern: /vbscript\s*:/i, error: 'vbscript-protocol-found' },
          { pattern: /data\s*:[^#]/i, error: 'data-protocol-found' },
          { pattern: /<script[^>]*>/i, error: 'script-element-found' },
          { pattern: /on\w+\s*=/i, error: 'event-handler-found' }
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