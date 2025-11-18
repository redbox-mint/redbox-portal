module.exports = {
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
    const bruCookieVar = options.bruCookieVar || "cookie";
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
      req.setHeader("Cookie", cookies[0]);
    } else if (cookies.length > 1) {
      // See https://github.com/usebruno/bruno/issues/3475
      console.warn(`Bruno may not support more than one cookie. Headers ${JSON.stringify(req.headers)} cookies ${JSON.stringify(cookies)}.`);
      req.setHeader("Cookie", cookies);
    }
  }
}
