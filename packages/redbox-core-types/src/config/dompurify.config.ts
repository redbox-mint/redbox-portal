/**
 * DOMPurify Config Interface
 * (sails.config.dompurify)
 * 
 * DOMPurify sanitization profiles and hooks.
 */

export interface DomPurifyProfile {
    /** Use built-in profiles */
    USE_PROFILES?: { svg?: boolean; svgFilters?: boolean; html?: boolean };

    /** Allowed HTML/SVG tags */
    ALLOWED_TAGS?: string[];

    /** Allowed attributes */
    ALLOWED_ATTR?: string[];

    /** Forbidden tags */
    FORBID_TAGS?: string[];

    /** Forbidden attributes */
    FORBID_ATTR?: string[];

    /** Allow data-* attributes */
    ALLOW_DATA_ATTR?: boolean;

    /** Allow unknown protocols in URLs */
    ALLOW_UNKNOWN_PROTOCOLS?: boolean;

    /** Regex for allowed URI protocols */
    ALLOWED_URI_REGEXP?: RegExp;

    /** Sanitize DOM nodes */
    SANITIZE_DOM?: boolean;

    /** Keep content of removed elements */
    KEEP_CONTENT?: boolean;

    /** Modify input in place */
    IN_PLACE?: boolean;
}

// Minimal interface for DOM Node to support hooks
interface SanitizeNode {
    tagName: string;
    hasAttribute(name: string): boolean;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
}

export interface DomPurifyHooks {
    /** Hook called after attributes are sanitized */
    afterSanitizeAttributes?: (node: any) => void;

    /** Hook called before sanitization */
    beforeSanitizeElements?: (node: any) => void;

    /** Hook called after sanitization */
    afterSanitizeElements?: (node: any) => void;
}

export interface DomPurifyGlobalSettings {
    FORCE_BODY?: boolean;
    RETURN_DOM?: boolean;
    RETURN_DOM_FRAGMENT?: boolean;
    RETURN_TRUSTED_TYPE?: boolean;
}

export interface DomPurifyConfig {
    /** Sanitization profiles for different content types */
    profiles: {
        svg?: DomPurifyProfile;
        html?: DomPurifyProfile;
        minimal?: DomPurifyProfile;
        [profileName: string]: DomPurifyProfile | undefined;
    };

    /** Default profile to use */
    defaultProfile: string;

    /** DOMPurify hooks */
    hooks: DomPurifyHooks;

    /** Global settings */
    globalSettings: DomPurifyGlobalSettings;
}

export const dompurify: DomPurifyConfig = {
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
                'a', 'p', 'br', 'strong', 'em', 'u', 'i', 'b', 'span', 'div',
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
         */
        afterSanitizeAttributes: function (node: any) {
            // Check if node is an anchor tag with target="_blank"
            const el = node as SanitizeNode;

            // Note: tagName is usually uppercase in DOM APIs but good to check safe access
            if (el.tagName === 'A' && el.hasAttribute('target')) {
                const target = el.getAttribute('target');
                if (target === '_blank') {
                    // Get existing rel attribute value or empty string
                    const existingRel = el.getAttribute('rel') || '';
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
                    el.setAttribute('rel', relValues.join(' '));
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
