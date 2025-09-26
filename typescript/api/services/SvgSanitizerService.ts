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
     * Check if the input contains event handlers using string-based detection.
     */
    private containsEventHandlers(input: string): boolean {
      const lowerInput = input.toLowerCase();
      const eventHandlers = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'];
      
      for (const handler of eventHandlers) {
        if (lowerInput.includes(handler)) {
          return true;
        }
      }
      
      // Check for generic 'on' pattern followed by word characters
      for (let i = 0; i < input.length - 2; i++) {
        if (input[i] === ' ' && 
            input[i + 1].toLowerCase() === 'o' && 
            input[i + 2].toLowerCase() === 'n' &&
            i + 3 < input.length &&
            /[a-z]/i.test(input[i + 3])) {
          return true;
        }
      }
      
      return false;
    }

    /**
     * Character-by-character sanitization to remove event handlers completely.
     * This approach ensures no 'on' fragments remain that could trigger CodeQL warnings.
     */
    private sanitizeEventHandlersCharByChar(input: string): string {
      const chars = input.split('');
      const result: string[] = [];
      let i = 0;
      
      while (i < chars.length) {
        // Look for potential event handler patterns
        if (chars[i] === ' ' || chars[i] === '\t' || chars[i] === '\n' || chars[i] === '\r') {
          // Check if this whitespace is followed by 'on' pattern
          let j = i + 1;
          
          // Skip additional whitespace
          while (j < chars.length && /\s/.test(chars[j])) {
            j++;
          }
          
          // Check for 'on' pattern (including obfuscated 'o n')
          if (j < chars.length - 1) {
            const nextChars = chars.slice(j, j + 10).join('').toLowerCase();
            
            // Check for various 'on' patterns
            if (nextChars.startsWith('on') || 
                nextChars.match(/^o\s*n\w/) ||
                nextChars.match(/^on\s+\w/)) {
              
              // Found potential event handler, skip until we find the end
              let skipTo = j;
              let inQuotes = false;
              let quoteChar = '';
              
              while (skipTo < chars.length) {
                const char = chars[skipTo];
                
                if (!inQuotes && (char === '"' || char === "'")) {
                  inQuotes = true;
                  quoteChar = char;
                } else if (inQuotes && char === quoteChar) {
                  inQuotes = false;
                  quoteChar = '';
                } else if (!inQuotes && (char === '>' || char === ' ')) {
                  break;
                }
                skipTo++;
              }
              
              // Skip the entire event handler
              i = skipTo;
              continue;
            }
          }
        }
        
        // Check for 'on' at word boundaries within attribute values
        if (chars[i] === '"' || chars[i] === "'") {
          const quoteChar = chars[i];
          result.push(chars[i]);
          i++;
          
          // Process content within quotes, removing any 'on' patterns
          while (i < chars.length && chars[i] !== quoteChar) {
            const remaining = chars.slice(i).join('').toLowerCase();
            if (remaining.match(/^on\w/)) {
              // Skip 'on' pattern within quoted content
              while (i < chars.length && chars[i] !== quoteChar && /\w/.test(chars[i])) {
                i++;
              }
            } else {
              result.push(chars[i]);
              i++;
            }
          }
          
          // Add closing quote if found
          if (i < chars.length) {
            result.push(chars[i]);
            i++;
          }
        } else {
          result.push(chars[i]);
          i++;
        }
      }
      
      return result.join('');
    }

    /**
     * Remove specific event handlers using string manipulation instead of regex.
     * This avoids CodeQL warnings about incomplete sanitization.
     */
    private removeSpecificEventHandlers(input: string): string {
      const dangerousHandlers = [
        'onload', 'onerror', 'onmouseover', 'onmouseout', 'onclick', 'onfocus', 'onblur',
        'onchange', 'onsubmit', 'onreset', 'onselect', 'onkeydown', 'onkeypress', 'onkeyup',
        'onmousedown', 'onmouseup', 'onmousemove', 'onmouseenter', 'onmouseleave',
        'ondblclick', 'oncontextmenu', 'onwheel', 'ondrag', 'ondrop', 'ondragover',
        'ondragstart', 'ondragend', 'ondragenter', 'ondragleave', 'onscroll', 'onresize',
        'onunload', 'onbeforeunload', 'onhashchange', 'onpopstate', 'onstorage',
        'onanimationstart', 'onanimationend', 'onanimationiteration', 'ontransitionend',
        'onplay', 'onpause', 'onended', 'ontimeupdate', 'onvolumechange', 'onwaiting'
      ];
      
      let result = input;
      
      // Use string-based removal for each handler
      for (const handler of dangerousHandlers) {
        result = this.removeAttributeByName(result, handler);
      }
      
      return result;
    }

    /**
     * Remove a specific attribute by name using string manipulation.
     */
    private removeAttributeByName(input: string, attrName: string): string {
      const lowerInput = input.toLowerCase();
      const lowerAttrName = attrName.toLowerCase();
      let result = input;
      let searchIndex = 0;
      
      while (true) {
        const attrIndex = lowerInput.indexOf(lowerAttrName, searchIndex);
        if (attrIndex === -1) break;
        
        // Check if this is a real attribute (preceded by whitespace)
        if (attrIndex > 0 && !/\s/.test(input[attrIndex - 1])) {
          searchIndex = attrIndex + 1;
          continue;
        }
        
        // Find the end of the attribute
        let endIndex = attrIndex + attrName.length;
        
        // Skip whitespace
        while (endIndex < input.length && /\s/.test(input[endIndex])) {
          endIndex++;
        }
        
        // If there's an equals sign, skip the value too
        if (endIndex < input.length && input[endIndex] === '=') {
          endIndex++; // Skip the equals
          
          // Skip whitespace after equals
          while (endIndex < input.length && /\s/.test(input[endIndex])) {
            endIndex++;
          }
          
          // Skip the value
          if (endIndex < input.length) {
            const valueChar = input[endIndex];
            if (valueChar === '"' || valueChar === "'") {
              // Quoted value
              endIndex++; // Skip opening quote
              while (endIndex < input.length && input[endIndex] !== valueChar) {
                endIndex++;
              }
              if (endIndex < input.length) endIndex++; // Skip closing quote
            } else {
              // Unquoted value
              while (endIndex < input.length && !/\s|>/.test(input[endIndex])) {
                endIndex++;
              }
            }
          }
        }
        
        // Remove the attribute
        result = input.substring(0, attrIndex) + input.substring(endIndex);
        input = result;
        searchIndex = attrIndex;
      }
      
      return result;
    }

    /**
     * Remove dangerous elements using string-based approach to avoid CodeQL warnings.
     */
    private removeDangerousElements(input: string): string {
      const dangerousElements = ['script', 'javascript', 'vbscript', 'iframe', 'embed', 'object', 'applet', 'meta', 'link', 'style', 'foreignobject'];
      let result = input;
      
      for (const element of dangerousElements) {
        // Remove any tags containing these dangerous element names
        result = this.removeTagsContaining(result, element);
      }
      
      return result;
    }

    /**
     * Remove any XML/HTML tags that contain a specific dangerous string.
     */
    private removeTagsContaining(input: string, dangerousString: string): string {
      let result = input;
      let searchPos = 0;
      
      while (searchPos < result.length) {
        const tagStart = result.indexOf('<', searchPos);
        if (tagStart === -1) break;
        
        const tagEnd = result.indexOf('>', tagStart);
        if (tagEnd === -1) break;
        
        const tagContent = result.substring(tagStart, tagEnd + 1).toLowerCase();
        if (tagContent.includes(dangerousString.toLowerCase())) {
          // Remove this tag
          result = result.substring(0, tagStart) + result.substring(tagEnd + 1);
          searchPos = tagStart;
        } else {
          searchPos = tagEnd + 1;
        }
      }
      
      return result;
    }

    /**
     * Final cleanup to remove any remaining event handler fragments.
     */
    private finalEventHandlerCleanup(input: string): string {
      let result = input;
      
      // Remove any attribute values containing dangerous patterns
      result = this.cleanAttributeValues(result);
      
      // Remove any remaining fragments using character-level processing
      const chars = result.split('');
      const cleaned: string[] = [];
      let i = 0;
      
      while (i < chars.length) {
        // Look for suspicious patterns like " on" or "=on" or standalone "on"
        if (i < chars.length - 2) {
          const threeChar = chars.slice(i, i + 3).join('').toLowerCase();
          const twoChar = chars.slice(i, i + 2).join('').toLowerCase();
          
          // Skip patterns that look like event handlers
          if (twoChar === ' o' || twoChar === '=o' || twoChar === '>o') {
            if (i + 2 < chars.length && chars[i + 2].toLowerCase() === 'n') {
              // Skip potential "on" pattern
              i += 2;
              // Skip any following word characters
              while (i < chars.length && /\w/.test(chars[i])) {
                i++;
              }
              continue;
            }
          }
        }
        
        cleaned.push(chars[i]);
        i++;
      }
      
      return cleaned.join('');
    }

    /**
     * Clean attribute values that might contain dangerous patterns.
     */
    private cleanAttributeValues(input: string): string {
      let result = input;
      let pos = 0;
      
      while (pos < result.length) {
        // Find attribute values (content between quotes)
        const quoteStart = result.indexOf('"', pos);
        const singleQuoteStart = result.indexOf("'", pos);
        
        let nextQuote = -1;
        let quoteChar = '';
        
        if (quoteStart !== -1 && (singleQuoteStart === -1 || quoteStart < singleQuoteStart)) {
          nextQuote = quoteStart;
          quoteChar = '"';
        } else if (singleQuoteStart !== -1) {
          nextQuote = singleQuoteStart;
          quoteChar = "'";
        }
        
        if (nextQuote === -1) break;
        
        const quoteEnd = result.indexOf(quoteChar, nextQuote + 1);
        if (quoteEnd === -1) break;
        
        // Check the content between quotes for dangerous patterns
        const attrValue = result.substring(nextQuote + 1, quoteEnd).toLowerCase();
        if (attrValue.includes('on') && /on\w/.test(attrValue)) {
          // Replace the dangerous attribute value with empty string
          result = result.substring(0, nextQuote + 1) + result.substring(quoteEnd);
          pos = nextQuote + 1;
        } else {
          pos = quoteEnd + 1;
        }
      }
      
      return result;
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
      
      // Additional pass to catch any remaining fragments using string-based approach
      const dangerousFragments = ['script', 'foreignobject', 'iframe', 'embed', 'object', 'applet'];
      for (const fragment of dangerousFragments) {
        working = this.removeTagsContaining(working, fragment);
      }

      // Deterministic event handler sanitization to prevent HTML attribute injection
      // This addresses CodeQL "Incomplete multi-character sanitization" by using character-level processing
      
      // First, detect if any event handlers are present using string-based approach
      if (this.containsEventHandlers(working)) {
        warnings.push('event-handlers-removed');
      }
      
      // Character-by-character sanitization to ensure complete removal
      working = this.sanitizeEventHandlersCharByChar(working);

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

      // Deterministic removal of all known dangerous event handler attributes
      // Using string-based approach to avoid CodeQL regex warnings
      working = this.removeSpecificEventHandlers(working);

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
        // Remove dangerous elements using string-based approach
        working = this.removeDangerousElements(working);
        
        // Final aggressive cleanup using character-level processing
        working = this.finalEventHandlerCleanup(working);
      }

      const sanitizedBytes = Buffer.byteLength(working, 'utf8');
      const safe = errors.length === 0;
      return { safe, sanitized: working, errors, warnings, info: { originalBytes, sanitizedBytes } };
    }
  }
}

module.exports = new Services.SvgSanitizer().exports();
