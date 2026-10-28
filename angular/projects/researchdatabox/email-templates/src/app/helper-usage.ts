/** Translation keys for usage hints. Filter the registered list; this never registers helpers. */
export interface HelperUsage {
  syntaxKey: string;
  exampleKey: string;
}
export const DOCUMENTED_HELPERS = [
  'each',
  'if',
  'unless',
  'with',
  'formatDate',
  'formatDateLocale',
  'parseDateString',
  'default',
  'join',
  'pluck',
  'get',
  't',
  'markdownToHtml',
  'plaintextToHtml',
  'json',
  'renderMetadataValue',
  'attachmentDownloadUrl',
  'isEmpty',
  'isUndefined',
  'isNull',
  'isDefined',
  'isArray',
  'isObject',
  'eq',
  'ne',
  'and',
  'or',
  'not',
  'gt',
  'gte',
  'lt',
  'lte',
  'trim',
  'toLower',
  'toUpper',
  'substring',
  'split',
  'urlEncode',
  'concat',
  'lookup',
  'log',
  'helperMissing',
  'blockHelperMissing',
] as const;

export function helperUsage(helper: string): HelperUsage | null {
  return (DOCUMENTED_HELPERS as readonly string[]).includes(helper)
    ? {
        syntaxKey: `email-templates-helper-${helper}-syntax`,
        exampleKey:
          helper === 'attachmentDownloadUrl'
            ? 'email-templates-helper-attachmentDownloadUrl-example-brand-name'
            : `email-templates-helper-${helper}-example`,
      }
    : null;
}

export function blockHelperScaffold(helper: string): string | null {
  switch (helper) {
    case 'each':
      return '{{#each record.metadata.YOUR_ARRAY}}\n  {{this}}\n{{/each}}';
    case 'if':
      return '{{#if record.metadata.YOUR_FIELD}}\n  {{record.metadata.YOUR_FIELD}}\n{{/if}}';
    case 'unless':
      return '{{#unless record.metadata.YOUR_FIELD}}\n  {{record.metadata.YOUR_FIELD}}\n{{/unless}}';
    case 'with':
      return '{{#with record.metadata.YOUR_OBJECT}}\n  {{this.YOUR_FIELD}}\n{{/with}}';
    default:
      return null;
  }
}

/** Syntax-valid block scaffolds use obvious placeholders for the administrator to replace. */
export function helperInsertion(helper: string): string {
  return blockHelperScaffold(helper) ?? `{{${helper} }}`;
}
