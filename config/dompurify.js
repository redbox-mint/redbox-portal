/**
 * DOMPurify Configuration
 * 
 * This configuration file defines different DOMPurify profiles for various use cases
 * across the application. Each profile specifies allowed tags, attributes, and other
 * sanitization rules for different content types.
 */

module.exports.dompurify = {
  
  /**
   * Configuration profiles for different content types
   */
  profiles: {
    
    /**
     * SVG sanitization profile for user-uploaded SVG content
     * Used primarily for branding logos and icons
     */
    svg: {
      USE_PROFILES: { svg: true, svgFilters: true },
      ALLOWED_TAGS: [
        'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'rect', 'polygon', 'polyline',
        'text', 'tspan', 'textPath', 'defs', 'clipPath', 'mask', 'pattern', 'image',
        'linearGradient', 'radialGradient', 'stop', 'symbol', 'marker', 'title', 'desc',
        'use', 'animate', 'animateTransform', 'animateMotion', 'set', 'switch', 'foreignObject'
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
        'script', 'iframe', 'embed', 'object', 'applet', 'meta', 'link', 'style'
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
        'onplay', 'onpause', 'onended', 'ontimeupdate', 'onvolumechange', 'onwaiting'
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
     */
    html: {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'i', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img', 'div', 'span',
        'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel',
        'width', 'height', 'style'
      ],
      FORBID_TAGS: [
        'script', 'iframe', 'embed', 'object', 'applet', 'meta', 'link', 'style',
        'form', 'input', 'button', 'textarea', 'select', 'option'
      ],
      FORBID_ATTR: [
        // All event handlers
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
        // Only forbid the most dangerous event handlers
        'onload', 'onerror', 'onclick', 'onmouseover', 'onfocus'
      ],
      ALLOW_DATA_ATTR: true,
      ALLOW_UNKNOWN_PROTOCOLS: false,
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