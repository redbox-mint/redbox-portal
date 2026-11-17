/** Canonical product names and acronyms in generated configuration labels. */
export const CONFIG_LABEL_TERMS = [
  'RO-Crate', 'API', 'URL', 'URI', 'ID', 'ORCID', 'DOI', 'RAiD', 'AAF', 'OIDC',
  'OAuth', 'HTTP', 'HTTPS', 'JSON', 'JSONLD', 'JSONata', 'CSV', 'OCFL', 'Figshare',
  'Oni', 'ReDBox', 'Solr', 'SQS', 'AWS', 'S3', 'HTML', 'CSS', 'JWT', 'SMTP',
  'RDMP', 'RIF-CS', 'XML', 'ROR', 'UUID', 'TTL', 'KMS', 'SES', 'Handlebars',
  'OID', 'IRI', 'IDs', 'URLs', 'URIs', 'DOIs', 'IRIs', 'OIDs', 'DataCite',
];

const terms = new Map(CONFIG_LABEL_TERMS.map(term => [term.toLowerCase(), term]));
const protectedTerms = new RegExp(`\\b(${CONFIG_LABEL_TERMS.join('|')})\\b`, 'gi');

/** Also repair old saved English translations without changing their wording. */
export function protectConfigLabelTerms(label: string): string {
  return label.replace(protectedTerms, term => terms.get(term.toLowerCase())!);
}

/** Sentence case for schema keys without a translated title. */
export function configLabel(label: string): string {
  const words = label.replace(protectedTerms, term => term.toLowerCase())
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_ ]+/g, ' ')
    .trim().toLowerCase();
  return protectConfigLabelTerms(words.replace(/^./, char => char.toUpperCase()));
}
