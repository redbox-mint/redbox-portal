import type { SailsConfig } from "redbox-core-types";

/**
 * DOMPurify Configuration
 * 
 * This configuration file defines different DOMPurify profiles for various use cases
 * across the application. Each profile specifies allowed tags, attributes, and other
 * sanitization rules for different content types.
 * 
 * IMPORTANT: When using DOMPurify with this configuration, always apply the hooks
 * defined in this file to ensure proper security measures (especially for tabnapping
 * prevention with target="_blank" links).
 * 
 * Example usage:
 * 
 *   const DOMPurify = require('dompurify')(window);
 *   const config = sails.config.dompurify;
 *   
 *   // Apply hooks from config
 *   if (config.hooks && config.hooks.afterSanitizeAttributes) {
 *     DOMPurify.addHook('afterSanitizeAttributes', config.hooks.afterSanitizeAttributes);
 *   }
 *   
 *   // Use the html profile with hooks applied
 *   const clean = DOMPurify.sanitize(dirty, config.profiles.html);
 * 
 * @see SvgSanitizerService for an example implementation
 */

const dompurifyConfig: SailsConfig["dompurify"] = {
  
  /**
   * Configuration profiles for different content types
   */
  profiles: {
    
    /**
     * SVG sanitization profile for user-uploaded SVG content
     * Used primarily for branding logos and icons
     * 
     * SECURITY NOTE: 'foreignObject' is explicitly forbidden as it's a high-risk
     * XSS vector that can embed arbitrary HTML/iframes inside SVG, bypassing
     * content security policies and allowing script execution.
     */
    svg: {
      USE_PROFILES: { svg: true, svgFilters: true },
      ALLOWED_TAGS: [
        'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'rect', 'polygon', 'polyline',
        'text', 'tspan', 'textPath', 'defs', 'clipPath', 'mask', 'pattern', 'image',
        'linearGradient', 'radialGradient', 'stop', 'symbol', 'marker', 'title', 'desc',
        'use'
      ],
      ALLOWED_ATTR: [
        // Core SVG attributes
        'class', 'id', 'style', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
        'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
        'fill-opacity', 'stroke-opacity', 'opacity', 'transform', 'clip-path', 'mask',
        // Geometric attributes
        'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height',
        'd', 'points', 'viewBox', 'preserveAspectRatio',
        // Text attributes
        'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
        'dominant-baseline', 'alignment-baseline', 'dx', 'dy', 'rotate',
        // Gradient attributes
        'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color',
        'stop-opacity', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy',
        // Pattern attributes
        'patternUnits', 'patternContentUnits', 'patternTransform',
        // Animation attributes (safe ones)
        'dur', 'begin', 'end', 'repeatCount', 'values', 'keyTimes', 'keySplines',
        'calcMode', 'attributeName', 'attributeType', 'from', 'to', 'by',
        // Link attributes (restricted to fragments only)
        'href', 'xlink:href'
      ],
      FORBID_TAGS: [
        'script', 'iframe', 'embed', 'object', 'applet', 'meta', 'link', 'style',
        // Explicitly forbid foreignObject - high-risk XSS vector that can embed arbitrary HTML
        'foreignObject'
      ],
      FORBID_ATTR: [
        // All event handlers
        'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur',
        'onchange', 'onsubmit', 'onreset', 'onselect', 'onkeydown', 'onkeypress', 'onkeyup',
        'onmousedown', 'onmouseup', 'onmousemove', 'onmouseenter', 'onmouseleave',
        'ondblclick', 'oncontextmenu', 'onwheel', 'ondrag', 'ondrop', 'ondragover',
        'ondragstart', 'ondragend', 'ondragenter', 'ondragleave', 'onscroll', 'onresize',
        'onunload', 'onbeforeunload', 'onhashchange', 'onpopstate', 'onstorage',
        'onanimationstart', 'onanimationend', 'onanimationiteration', 'ontransitionend',
        'onplay', 'onpause', 'onended', 'ontimeupdate', 'onvolumechange', 'onwaiting',
        // SVG-specific animation events
        'onbegin', 'onend', 'onrepeat'
      ],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP: /^(?:#|(?:\.{1,2}\/|\/(?!\/)))/i,
      SANITIZE_DOM: true,
      KEEP_CONTENT: false,
      IN_PLACE: false
    },

    /**
     * HTML content sanitization profile for rich text content
     * More restrictive than SVG, suitable for user-generated HTML content
     * 
     * SECURITY NOTE: The 'target' attribute is allowed, but any link with target="_blank"
     * MUST have rel="noopener noreferrer" to prevent tabnapping attacks. This is enforced
     * via DOMPurify hooks (see afterSanitizeAttributes hook below) that automatically add
     * the required rel attribute to any anchor tag with target="_blank".
     */
    html: {
      ALLOWED_TAGS: [
        'a','p', 'br', 'strong', 'em', 'u', 'i', 'b', 'span', 'div',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
      ],
      ALLOWED_ATTR: ['class', 'id', 'title', 'href', 'target', 'rel'],
      FORBID_TAGS: [
        'script', 'iframe', 'embed', 'object', 'applet'
      ],
      FORBID_ATTR: [
        // Forbid all event handlers
        'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur',
        'onchange', 'onsubmit', 'onreset', 'onselect', 'onkeydown', 'onkeypress', 'onkeyup',
        'onmousedown', 'onmouseup', 'onmousemove', 'onmouseenter', 'onmouseleave',
        'ondblclick', 'oncontextmenu', 'onwheel', 'ondrag', 'ondrop', 'ondragover'
      ],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      SANITIZE_DOM: true,
      KEEP_CONTENT: true,
      IN_PLACE: false
    },

    /**
     * Minimal sanitization profile for trusted content
     * Use only for content from trusted sources that needs light sanitization
     */
    minimal: {
      FORBID_TAGS: [
        'script', 'iframe', 'embed', 'object', 'applet'
      ],
      FORBID_ATTR: [
        // Forbid all event handlers
        'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur',
        'onchange', 'onsubmit', 'onreset', 'onselect', 'onkeydown', 'onkeypress', 'onkeyup',
        'onmousedown', 'onmouseup', 'onmousemove', 'onmouseenter', 'onmouseleave',
        'ondblclick', 'oncontextmenu', 'onwheel', 'ondrag', 'ondrop', 'ondragover'
      ],
      ALLOW_DATA_ATTR: true,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      SANITIZE_DOM: true,
      KEEP_CONTENT: true,
      IN_PLACE: false
    }
  },

  /**
   * Default profile to use if none is specified
   */
  defaultProfile: 'html',

  /**
   * DOMPurify hooks for additional sanitization logic
   * These hooks are applied during the sanitization process
   */
  hooks: {
    /**
     * afterSanitizeAttributes hook: Automatically add rel="noopener noreferrer" 
     * to any anchor tag with target="_blank" to prevent tabnapping attacks.
     * 
     * Tabnapping occurs when a link opened with target="_blank" can access the 
     * opener window via window.opener, potentially redirecting the parent page 
     * to a phishing site. The rel="noopener noreferrer" attribute prevents this.
     * 
     * This hook is automatically applied when using the 'html' or 'minimal' profiles.
     */
    afterSanitizeAttributes: function(node) {
      // Check if node is an anchor tag with target="_blank"
      if (node.tagName === 'A' && node.hasAttribute('target')) {
        const target = node.getAttribute('target');
        if (target === '_blank') {
          // Get existing rel attribute value or empty string
          const existingRel = node.getAttribute('rel') || '';
          const relValues = existingRel.split(/\s+/).filter(v => v);
          
          // Add 'noopener' if not present
          if (!relValues.includes('noopener')) {
            relValues.push('noopener');
          }
          
          // Add 'noreferrer' if not present
          if (!relValues.includes('noreferrer')) {
            relValues.push('noreferrer');
          }
          
          // Set the updated rel attribute
          node.setAttribute('rel', relValues.join(' '));
        }
      }
    }
  },

  /**
   * Global settings that apply to all profiles
   */
  globalSettings: {
    // Add any global DOMPurify settings here
    FORCE_BODY: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false
  }
};

module.exports.dompurify = dompurifyConfig;
