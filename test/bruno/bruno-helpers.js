module.exports = {
  setCookies: function setCookies(bru, req) {
    const newCookies = bru.getVar("cookie") || [];
    const existingCookies = Object.hasOwn(req.headers, "Cookie") ? req.headers['Cookie'] : [];
    const cookies = [
      ...(Array.isArray(existingCookies) ? existingCookies : [existingCookies]),
      ...(Array.isArray(newCookies) ? newCookies : [newCookies]),
    ];
    if (cookies.length === 1) {
      req.headers['Cookie'] = cookies[0]
    } else if (cookies.length > 1) {
      // See https://github.com/usebruno/bruno/issues/3475
      throw new Error(`Bruno does not support more than one cookie. Headers ${JSON.stringify(req.headers)} cookies ${JSON.stringify(cookies)}.`);
    }
  }
}
