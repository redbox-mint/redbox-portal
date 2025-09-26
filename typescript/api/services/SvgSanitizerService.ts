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

      // Comprehensive URL scheme validation for all href attributes
      // This addresses the "Incomplete URL scheme check" vulnerability
      const urlAttributes = ['href', 'xlink:href', 'src', 'action', 'formaction', 'cite', 'background'];
      
      // Define all dangerous protocols that need to be blocked
      const dangerousProtocols = [
        'javascript:', 'vbscript:', 'data:', 'file:', 'ftp:', 'ftps:', 
        'chrome:', 'resource:', 'moz-extension:', 'chrome-extension:',
        'ms-appx:', 'ms-appx-web:', 'about:', 'blob:', 'filesystem:'
      ];
      
      // Define external protocols that should be blocked
      const externalProtocols = ['http:', 'https:', '//', 'ftp:', 'ftps:'];
      
      for (const attr of urlAttributes) {
        // Check for dangerous protocols
        for (const protocol of dangerousProtocols) {
          const dangerousPattern = new RegExp(`${attr}\\s*=\\s*["']?\\s*${protocol.replace(':', '\\s*:')}`, 'gi');
          if (dangerousPattern.test(working)) {
            if (protocol === 'data:') {
              errors.push('data-url-embed');
            } else if (protocol === 'vbscript:') {
              errors.push('vbscript-protocol');
            } else if (protocol === 'javascript:') {
              errors.push('javascript-protocol');
            } else {
              errors.push('dangerous-protocol');
            }
            // Remove the dangerous attribute entirely
            const removeAttrPattern = new RegExp(`\\s+${attr}\\s*=\\s*["']?[^"'\\s>]*["']?`, 'gi');
            working = working.replace(removeAttrPattern, '');
          }
        }
        
        // Check for external protocols
        for (const protocol of externalProtocols) {
          const externalPattern = new RegExp(`${attr}\\s*=\\s*["']?\\s*${protocol.replace(/[:/]/g, '\\s*$&\\s*')}`, 'gi');
          if (externalPattern.test(working)) {
            errors.push('external-ref');
            // Remove the external reference attribute
            const removeExtAttrPattern = new RegExp(`\\s+${attr}\\s*=\\s*["']?[^"'\\s>]*["']?`, 'gi');
            working = working.replace(removeExtAttrPattern, '');
          }
        }
      }

      // Remove script & foreignObject elements entirely
      if (/<script[\s>]/i.test(working)) {
        errors.push('script-element');
      }
      if (/<foreignObject[\s>]/i.test(working)) {
        errors.push('foreign-object');
      }
      // Complete removal of dangerous elements - comprehensive approach
      // This addresses the "incomplete multi-character sanitization" vulnerability
      const dangerousElements = ['script', 'foreignObject', 'iframe', 'embed', 'object', 'applet', 'meta', 'link', 'style'];
      
      for (const element of dangerousElements) {
        let elementIterations = 0;
        const maxElementIterations = 50;
        let prevElementWorking;
        
        do {
          prevElementWorking = working;
          
          // Remove self-closing versions: <script/>, <script />, <script attr/>
          const selfClosingPattern = new RegExp(`<${element}(?:\\s[^>]*)?\\s*\\/?>`, 'gi');
          working = working.replace(selfClosingPattern, '');
          
          // Remove opening tags: <script>, <script attr>
          const openingPattern = new RegExp(`<${element}(?:\\s[^>]*)?(?:\\s*>)`, 'gi');
          working = working.replace(openingPattern, '');
          
          // Remove closing tags: </script>, </script >
          const closingPattern = new RegExp(`<\\/${element}\\s*>`, 'gi');
          working = working.replace(closingPattern, '');
          
          // Remove complete element pairs with content (non-greedy)
          const completePattern = new RegExp(`<${element}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${element}\\s*>`, 'gi');
          working = working.replace(completePattern, '');
          
          // Handle malformed tags like <scri<script>pt>
          const malformedPattern = new RegExp(`<[^>]*${element}[^>]*>`, 'gi');
          working = working.replace(malformedPattern, '');
          
          elementIterations++;
        } while (working !== prevElementWorking && elementIterations < maxElementIterations);
      }
      
      // Additional pass to catch any remaining fragments or obfuscated versions
      const fragmentPatterns = [
        /<[^>]*script[^>]*>/gi,
        /<[^>]*foreignobject[^>]*>/gi,
        /<[^>]*iframe[^>]*>/gi,
        /<[^>]*embed[^>]*>/gi,
        /<[^>]*object[^>]*>/gi,
        /<[^>]*applet[^>]*>/gi
      ];
      
      fragmentPatterns.forEach(pattern => {
        working = working.replace(pattern, '');
      });

      // Comprehensive event handler sanitization to prevent HTML attribute injection
      // This addresses "Incomplete multi-character sanitization" for event handlers
      
      // First, detect if any event handlers are present
      if (/\s+on\w+\s*=/i.test(working)) {
        warnings.push('event-handlers-removed');
      }
      
      // Complete removal of all possible event handler patterns
      let prevWorkingAttrs;
      let attrIterations = 0;
      const maxAttrIterations = 100; // Increased iterations for thorough cleanup
      
      do {
        prevWorkingAttrs = working;
        
        // Remove standard event handlers with quoted values
        working = working.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
        working = working.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');
        
        // Remove unquoted event handlers
        working = working.replace(/\s+on\w+\s*=\s*[^\s>"']+/gi, '');
        
        // Remove malformed or obfuscated event handlers
        working = working.replace(/\s+o\s*n\w+\s*=\s*[^>\s]+/gi, '');
        working = working.replace(/\s+on\s+\w+\s*=\s*[^>\s]+/gi, '');
        
        // Remove event handlers with JavaScript protocol
        working = working.replace(/\s+on\w+\s*=\s*javascript\s*:[^>"]*/gi, '');
        
        // Remove any remaining fragments that start with 'on' followed by word characters
        working = working.replace(/\s+on[a-z]+[^>\s]*/gi, '');
        
        // Handle edge cases with incomplete attributes
        working = working.replace(/\s+on\w*\s*=?\s*[^>\s]*/gi, '');
        
        // Remove standalone 'on' fragments that might be left behind
        working = working.replace(/\s+on\s+/gi, ' ');
        working = working.replace(/\s+on\s*=/gi, '');
        working = working.replace(/\s+on>/gi, '>');
        working = working.replace(/\s+on\s*$/gi, '');
        
        attrIterations++;
      } while (working !== prevWorkingAttrs && attrIterations < maxAttrIterations);
      
      // Additional cleanup for any remaining 'on' patterns that could be exploited
      const onFragmentPatterns = [
        /\bon\w+\s*=/gi,           // Any on* attribute
        /\s+on(?=\w)/gi,           // 'on' followed by word character
        /\s+on\s*=/gi,             // 'on' with equals
        /\bon\s*=/gi,              // Word boundary 'on' with equals
        /="[^"]*on\w+[^"]*"/gi,    // 'on' inside quoted attributes
        /='[^']*on\w+[^']*'/gi     // 'on' inside single quoted attributes
      ];
      
      onFragmentPatterns.forEach(pattern => {
        working = working.replace(pattern, '');
      });

      // Comprehensive protocol sanitization - remove all instances of dangerous protocols
      // This ensures no dangerous protocols remain anywhere in the content
      const allDangerousProtocols = [
        'javascript:', 'vbscript:', 'data:text/html', 'data:application/', 'data:image/svg+xml',
        'file:', 'chrome:', 'resource:', 'moz-extension:', 'chrome-extension:',
        'ms-appx:', 'ms-appx-web:', 'about:', 'blob:', 'filesystem:'
      ];
      
      let foundDangerousProtocol = false;
      
      for (const protocol of allDangerousProtocols) {
        // Create regex that handles optional whitespace around the colon
        const protocolRegex = new RegExp(protocol.replace(':', '\\s*:\\s*'), 'gi');
        if (protocolRegex.test(working)) {
          foundDangerousProtocol = true;
          // Remove all instances of this protocol
          working = working.replace(protocolRegex, '');
        }
      }
      
      // Also check for protocol patterns without specific context (catch obfuscated versions)
      const protocolPatterns = [
        /javascript\s*:/gi,
        /vbscript\s*:/gi,
        /data\s*:\s*text\s*\/\s*html/gi,
        /data\s*:\s*application\s*\//gi,
        /data\s*:\s*image\s*\/\s*svg/gi
      ];
      
      protocolPatterns.forEach(pattern => {
        if (pattern.test(working)) {
          foundDangerousProtocol = true;
          working = working.replace(pattern, '');
        }
      });
      
      if (foundDangerousProtocol) {
        errors.push('dangerous-script-protocol');
      }

      // Comprehensive removal of all known dangerous event handler attributes
      const allEventHandlers = [
        'onload', 'onerror', 'onmouseover', 'onmouseout', 'onclick', 'onfocus', 'onblur',
        'onchange', 'onsubmit', 'onreset', 'onselect', 'onkeydown', 'onkeypress', 'onkeyup',
        'onmousedown', 'onmouseup', 'onmousemove', 'onmouseenter', 'onmouseleave',
        'ondblclick', 'oncontextmenu', 'onwheel', 'ondrag', 'ondrop', 'ondragover',
        'ondragstart', 'ondragend', 'ondragenter', 'ondragleave', 'onscroll', 'onresize',
        'onunload', 'onbeforeunload', 'onhashchange', 'onpopstate', 'onstorage',
        'onanimationstart', 'onanimationend', 'onanimationiteration', 'ontransitionend',
        'onplay', 'onpause', 'onended', 'ontimeupdate', 'onvolumechange', 'onwaiting'
      ];
      
      allEventHandlers.forEach(attr => {
        // Multiple patterns to catch various formats
        const patterns = [
          new RegExp(`\\s+${attr}\\s*=\\s*"[^"]*"`, 'gi'),
          new RegExp(`\\s+${attr}\\s*=\\s*'[^']*'`, 'gi'),
          new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>]+`, 'gi'),
          new RegExp(`\\s+${attr}\\s*=`, 'gi'),
          new RegExp(`\\s+${attr}(?=\\s|>|$)`, 'gi')
        ];
        
        patterns.forEach(pattern => {
          working = working.replace(pattern, '');
        });
      });
      
      // Additional pass to remove any remaining event handler fragments
      working = working.replace(/\s+on\w*(?:\s*=\s*[^>\s]*)?/gi, '');
      working = working.replace(/\s*=\s*[^>\s]*on\w+[^>\s]*/gi, '');

      // Remove any <use> elements with external references
      if (/<use[\s\S]*?xlink:href\s*=\s*["']?(?:https?:|\/\/)/i.test(working)) {
        errors.push('external-use-element');
        working = working.replace(/<use[\s\S]*?\/?>|<use[\s\S]*?<\/use>/gi, '');
      }

      // Additional whitelist-based validation as final safeguard
      // Only allow known safe SVG elements to prevent any missed dangerous content
      const allowedSvgElements = [
        'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'rect', 'polygon', 'polyline',
        'text', 'tspan', 'textPath', 'defs', 'clipPath', 'mask', 'pattern', 'image',
        'linearGradient', 'radialGradient', 'stop', 'symbol', 'marker', 'title', 'desc'
      ];
      
      // Check for any elements not in the whitelist
      const elementMatches = working.match(/<(\w+)(?:\s[^>]*)?>/gi) || [];
      for (const match of elementMatches) {
        const elementName = match.match(/<(\w+)/i)?.[1]?.toLowerCase();
        if (elementName && !allowedSvgElements.includes(elementName)) {
          warnings.push(`non-standard-element-${elementName}`);
          // Remove non-whitelisted elements
          const removePattern = new RegExp(`<${elementName}(?:\\s[^>]*)?(?:\\s*\\/>|>[\\s\\S]*?<\\/${elementName}\\s*>)`, 'gi');
          working = working.replace(removePattern, '');
        }
      }

      // Collapse excessive whitespace
      working = working.replace(/\s{2,}/g, ' ').trim();

      // Final security check - comprehensive scan for any remaining dangerous patterns
      // This addresses incomplete sanitization by catching fragments and obfuscated content
      const finalDangerousChecks = [
        // Comprehensive protocol checks - addresses incomplete URL scheme check
        { pattern: /javascript\s*:/i, error: 'javascript-protocol-found' },
        { pattern: /vbscript\s*:/i, error: 'vbscript-protocol-found' },
        { pattern: /data\s*:/i, error: 'data-protocol-found' },
        { pattern: /file\s*:/i, error: 'file-protocol-found' },
        { pattern: /chrome\s*:/i, error: 'chrome-protocol-found' },
        { pattern: /resource\s*:/i, error: 'resource-protocol-found' },
        { pattern: /moz-extension\s*:/i, error: 'moz-extension-protocol-found' },
        { pattern: /chrome-extension\s*:/i, error: 'chrome-extension-protocol-found' },
        { pattern: /ms-appx\s*:/i, error: 'ms-appx-protocol-found' },
        { pattern: /about\s*:/i, error: 'about-protocol-found' },
        { pattern: /blob\s*:/i, error: 'blob-protocol-found' },
        { pattern: /filesystem\s*:/i, error: 'filesystem-protocol-found' },
        
        // Element fragment checks (case-insensitive, whitespace tolerant)
        { pattern: /<[^>]*script[^>]*>/i, error: 'script-fragment-found' },
        { pattern: /<[^>]*iframe[^>]*>/i, error: 'iframe-fragment-found' },
        { pattern: /<[^>]*embed[^>]*>/i, error: 'embed-fragment-found' },
        { pattern: /<[^>]*object[^>]*>/i, error: 'object-fragment-found' },
        { pattern: /<[^>]*applet[^>]*>/i, error: 'applet-fragment-found' },
        { pattern: /<[^>]*meta[^>]*>/i, error: 'meta-fragment-found' },
        { pattern: /<[^>]*link[^>]*>/i, error: 'link-fragment-found' },
        { pattern: /<[^>]*style[^>]*>/i, error: 'style-fragment-found' },
        { pattern: /<[^>]*foreignobject[^>]*>/i, error: 'foreignobject-fragment-found' },
        
        // Check for split or obfuscated dangerous strings
        { pattern: /sc\s*ri\s*pt/i, error: 'obfuscated-script-found' },
        { pattern: /ja\s*va\s*sc\s*ri\s*pt/i, error: 'obfuscated-javascript-found' },
        
        // Comprehensive event handler detection to prevent attribute injection
        { pattern: /on\w+\s*=\s*[^>\s]/i, error: 'event-handler-found' },
        { pattern: /\s+on\w+/i, error: 'event-handler-fragment-found' },
        { pattern: /\son\s*=/i, error: 'on-equals-found' },
        { pattern: /="[^"]*on\w+/i, error: 'on-in-quoted-attr-found' },
        { pattern: /='[^']*on\w+/i, error: 'on-in-single-quoted-attr-found' },
        { pattern: /\bon\w*\s*(?==)/i, error: 'on-attribute-pattern-found' },
        
        // Check for common obfuscated event handlers
        { pattern: /o\s*n\w+\s*=/i, error: 'obfuscated-event-handler-found' },
        { pattern: /on\s+\w+\s*=/i, error: 'spaced-event-handler-found' }
      ];

      let foundDangerous = false;
      finalDangerousChecks.forEach(check => {
        if (check.pattern.test(working)) {
          errors.push(check.error);
          foundDangerous = true;
          // Aggressively remove the dangerous content
          working = working.replace(check.pattern, '');
        }
      });
      
      // If any dangerous content was found, do additional cleanup
      if (foundDangerous) {
        // Remove any remaining < followed by suspicious characters
        working = working.replace(/<[^>]*(?:script|javascript|vbscript|iframe|embed|object|applet|meta|link|style|foreignobject)[^>]*>/gi, '');
        
        // Aggressive event handler removal - addresses incomplete multi-character sanitization
        working = working.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
        working = working.replace(/\son\w*[^>\s]*/gi, '');
        working = working.replace(/\s+on\s*=/gi, '');
        working = working.replace(/="[^"]*on\w+[^"]*"/gi, '=""');
        working = working.replace(/='[^']*on\w+[^']*'/gi, "=''");
        working = working.replace(/\s+on(?=\s|>|$)/gi, '');
        
        // Remove any standalone 'on' that might cause issues
        working = working.replace(/\bon\s+/gi, '');
        working = working.replace(/\s+on\b/gi, '');
      }

      const sanitizedBytes = Buffer.byteLength(working, 'utf8');
      const safe = errors.length === 0;
      return { safe, sanitized: working, errors, warnings, info: { originalBytes, sanitizedBytes } };
    }
  }
}

module.exports = new Services.SvgSanitizer().exports();
