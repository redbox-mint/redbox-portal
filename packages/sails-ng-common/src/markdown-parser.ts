// The CommonJS build supplies a demand-loaded CJS copy of Marked so existing
// synchronous server templates also produce HTML on their very first call.
// The browser finalizer redirects this module to markdown-parser.browser.
export function getMarkdownParser(): (value: string) => string {
  const { parse } = require('./marked-parser.cjs') as { parse: (value: string) => string };
  return parse;
}

export async function loadMarkdownParser(): Promise<void> {
  getMarkdownParser();
}
