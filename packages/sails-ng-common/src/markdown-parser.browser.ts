type MarkdownParser = (value: string) => string;
let parser: MarkdownParser | undefined;
let loading: Promise<void> | undefined;

/** Reject failed loads so rendering owners can show an error and retry. */
export function loadMarkdownParser(): Promise<void> {
  loading ??= import('marked')
    .then(module => {
      const parse = module.marked?.parse ?? module.parse;
      if (typeof parse !== 'function') throw new Error('Markdown parser is unavailable');
      parser = value => {
        const result = parse(value);
        return typeof result === 'string' ? result : value;
      };
    })
    .catch(error => {
      loading = undefined;
      throw error;
    });
  return loading;
}

export function getMarkdownParser(): MarkdownParser | undefined {
  if (!parser) void loadMarkdownParser().catch(() => { /* Synchronous helper compatibility. */ });
  return parser;
}
