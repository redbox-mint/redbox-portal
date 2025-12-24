import type { SailsConfig } from "redbox-core-types";

/**
 * Content Security Policy (CSP) configuration for the custom CSP policy in api/policies/contentSecurityPolicy.js
 *
 * You can override any of these in environment-specific files (e.g., config/env/production.js)
 * by setting module.exports.csp to a compatible object.
 *
 * Notes:
 * - By default, a per-request nonce is generated and added to script-src and style-src.
 * - Set reportOnly=true to emit the Content-Security-Policy-Report-Only header instead.
 * - Add or replace directives by editing the directives map below. Values are arrays of strings.
 * - extras allows adding raw directives like "upgrade-insecure-requests" (no values).
 */

const cspConfig: SailsConfig["csp"] = {
  // Enable/disable emitting a CSP header entirely
  enabled: true,

  // If true, emit the Content-Security-Policy-Report-Only header instead of enforcing CSP
  reportOnly: false,

  // Which directive names should receive a per-request nonce. Commonly: ['script-src', 'style-src']
  addNonceTo: ['script-src', 'style-src'],

  // Directives map. Keys must be valid CSP directive names; values are arrays of sources/tokens.
  // If you define a key here, it REPLACES the default for that key.
  directives: {
    // == fetch directives ==
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'worker-src': ["'self'"],
    'img-src': ["'self'"],
    'connect-src': ["'self'"],
    'media-src': ["'self'"],
    'frame-src': ["'self'"],
    // elements controlled by object-src are legacy, so set this to none
    'object-src': ["'none'"],
    'manifest-src': ["'self'"],
    // allow Google Fonts by default
    'style-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    'font-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    // == navigation directives ==
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    // == document directives ==
    'base-uri': ["'self'"],
  },

  // Raw, valueless directives appended as-is (e.g., 'upgrade-insecure-requests')
  extras: ['upgrade-insecure-requests'],
};

module.exports.csp = cspConfig;
