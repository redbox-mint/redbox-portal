import * as crypto from 'node:crypto';
export interface CspConfig {
  enabled?: boolean;
  reportOnly?: boolean;
  addNonceTo?: string[];
  directives?: Record<string, string[] | undefined>;
  extras?: string[];
}

const WEB_ANALYTICS_CSP_SOURCES: Record<string, Record<string, string[] | undefined>> = {
  googleAnalytics: {
    'script-src': ['https://www.googletagmanager.com'],
    'img-src': ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
    'connect-src': [
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.googletagmanager.com',
    ],
  },
  googleTagManager: {
    // Keep the explicit GTM origin without strict-dynamic. The latter
    // disables host allow-listing in supported browsers and would also
    // block ReDBox's same-origin bundles when they do not carry a nonce.
    'script-src': ['https://www.googletagmanager.com'],
    'img-src': ['https://www.googletagmanager.com', 'https://*.google-analytics.com'],
    'connect-src': [
      'https://www.googletagmanager.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
    ],
    'frame-src': ['https://www.googletagmanager.com'],
  },
};

export function pageCsp(input: {
  configuration?: CspConfig;
  pathname: string;
  appUrl: string;
  environment: string;
  analytics?: { enabled?: boolean; provider?: string; trackingId?: string };
}) {
  const cfg = input.configuration ?? {};
  // Fallback defaults mirror previous hard-coded behavior
  const defaults: Required<CspConfig> = {
    enabled: true,
    reportOnly: false,
    addNonceTo: ['script-src', 'style-src'],
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'worker-src': ["'self'"],
      'object-src': ["'none'"],
      'manifest-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      'font-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
    },
    extras: ['upgrade-insecure-requests'],
  };

  // Merge settings: shallow for top-level, replace arrays for directives keys if provided
  const enabled = cfg.enabled != null ? !!cfg.enabled : defaults.enabled;
  const reportOnly = cfg.reportOnly != null ? !!cfg.reportOnly : defaults.reportOnly;
  let addNonceTo = Array.isArray(cfg.addNonceTo) ? cfg.addNonceTo : defaults.addNonceTo;
  // Browsers upgrade every HTTP request when this directive is present.
  // That makes an HTTP appUrl unusable during LAN development, so retain
  // the directive for HTTPS deployments but omit it for HTTP app URLs.
  const configuredExtras = Array.isArray(cfg.extras) ? cfg.extras : defaults.extras;
  const extras =
    input.environment !== 'production' && URL.parse(input.appUrl)?.protocol === 'http:'
      ? configuredExtras.filter(directive => directive.trim().toLowerCase() !== 'upgrade-insecure-requests')
      : configuredExtras;
  const directives: Record<string, string[] | undefined> = Object.assign({}, defaults.directives, cfg.directives || {});

  if (/\/admin\/api-docs(?:\/|$)/.test(input.pathname)) {
    addNonceTo = [];

    const styleSrc = new Set([...(directives['style-src'] ?? [])]);
    styleSrc.add("'unsafe-inline'");
    styleSrc.add('https://fonts.googleapis.com');
    styleSrc.add('https://fonts.gstatic.com');
    directives['style-src'] = Array.from(styleSrc);

    const imgSrc = new Set([...(directives['img-src'] ?? [])]);
    imgSrc.add('data:');
    imgSrc.add('https://cdn.redoc.ly');
    directives['img-src'] = Array.from(imgSrc);
      directives['font-src'] = Array.from(new Set([...(directives['font-src'] ?? []), 'data:']));

    const workerSrc = new Set([...(directives['worker-src'] ?? [])]);
    workerSrc.add('blob:');
    directives['worker-src'] = Array.from(workerSrc);

    const connectSrc = new Set([...(directives['connect-src'] ?? [])]);
    connectSrc.add('blob:');
    directives['connect-src'] = Array.from(connectSrc);
  }

  // Allow-list the branding's configured web analytics provider (if enabled).
  const analytics = input.analytics;
  if (analytics?.enabled === true && /^[A-Za-z0-9\-_]+$/.test(String(analytics.trackingId ?? '').trim())) {
    const sources = WEB_ANALYTICS_CSP_SOURCES[analytics.provider ?? ''];
    for (const [name, values] of Object.entries(sources ?? {}))
      directives[name] = [...new Set([...(directives[name] ?? []), ...(values ?? [])])];
  }

  if (!enabled) {
    return undefined;
  }

  // generate a nonce - a cryptographically secure random string,
  // which must be different for each request
  const generatedNonce = crypto.randomBytes(16).toString('base64');

  // For any directive configured in addNonceTo, ensure the nonce token is prepended
  addNonceTo.forEach(name => {
    const arr = directives[name];
    if (Array.isArray(arr)) {
      const token = `'nonce-${generatedNonce}'`;
      // Remove any existing nonces and prepend the fresh one
      const filtered = arr.filter(v => typeof v !== 'string' || !v.startsWith("'nonce-"));
      directives[name] = [token, ...filtered];
    }
  });

  // Build the header value
  const parts: string[] = [];
  Object.keys(directives).forEach(key => {
    const values = directives[key];
    if (Array.isArray(values) && values.length > 0) {
      parts.push(`${key} ${values.join(' ')}`);
    }
    // empty array means emit key with no values (rare), skip to avoid invalid policy
  });
  (extras || []).forEach(d => {
    if (typeof d === 'string' && d.trim().length > 0) {
      parts.push(d.trim());
    }
  });

  if (parts.length === 0) {
    return undefined;
  }

  const headerValue = parts.join('; ');

  // Set the appropriate CSP header; add trailing semicolon for readability consistency with previous code
  const headerName = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  return { headerName, headerValue: `${headerValue};`, nonce: generatedNonce };

  // provide the nonce to the view, so it can be set in the angular app and scripts
}
