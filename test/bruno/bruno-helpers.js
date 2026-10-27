module.exports = {
  /** v6 browser writes use a session-bound token, including before login. */
  csrf: async function csrf({ bru, req }) {
    const method = req.getMethod().toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;
    const host = bru.interpolate('{{host}}');
    const url = bru.interpolate(req.getUrl());
    if (new URL(url, host).origin !== new URL(host).origin) return;
    const raw = req.getHeader('Cookie') ?? req.getHeader('cookie');
    const cookie = Array.isArray(raw) ? raw.join('; ') : raw;
    const response = await bru.sendRequest({
      method: 'GET',
      url: host + '/csrfToken',
      headers: cookie ? { Cookie: cookie } : {},
    });
    if (response.status !== 200 || !response.data?._csrf) throw new Error('Could not obtain the session CSRF token');
    const issued = response.headers['set-cookie'];
    if (issued) {
      const cookies = (Array.isArray(issued) ? issued : [issued]).map(value => value.split(';')[0]);
      req.setHeader('Cookie', cookies.join('; '));
    }
    req.setHeader('X-CSRF-Token', response.data._csrf);
  },
  /**
   * Manage cookies for a bruno request.
   * @param options Options for how to deal with cookies.
   * @param options.bru Access to bru properties and functions.
   * @param options.req The bruno request.
   * @param options.bruCookieVar The name of the bruno env var that holds the cookie.
   * @param options.useOnlyCookieMatching The name of the cookie to use, and remove all other cookies.
   */
  setCookies: function setCookies(options = {}) {
    const bru = options.bru || {};
    const req = options.req || {};
    const bruCookieVar = options.bruCookieVar || 'cookie';
    const useOnlyCookieMatching = options.useOnlyCookieMatching || null;

    const newCookies = bru.getVar(bruCookieVar) || [];
    const existingCookies = req.headers['Cookie'] ?? req.headers['cookie'] ?? [];
    let cookies = [
      ...(Array.isArray(existingCookies) ? existingCookies : [existingCookies]),
      ...(Array.isArray(newCookies) ? newCookies : [newCookies]),
    ];

    if (useOnlyCookieMatching) {
      cookies = cookies.filter(cookie => cookie.includes(useOnlyCookieMatching));
    }

    if (cookies.length === 1) {
      req.setHeader('Cookie', cookies[0]);
    } else if (cookies.length > 1) {
      // See https://github.com/usebruno/bruno/issues/3475
      console.warn(
        `Bruno may not support more than one cookie. Headers ${JSON.stringify(req.headers)} cookies ${JSON.stringify(cookies)}.`
      );
      req.setHeader('Cookie', cookies);
    }
  },
};
