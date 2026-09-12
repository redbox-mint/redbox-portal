/** Manual fixtures are ordinary metadata accepted by the same record APIs as
 * the browser tests. Each call returns independent nested values. */
export function scenarioSeedData(id: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = { title: `Playwright ${id}` };
  if (id.startsWith('initialisation-')) return { ...metadata, translated: 'Seeded translated field' };
  if (id === 'expression-conditions') return { ...metadata, title: 'Ready', unrelated: 'Unrelated', pointerResult: '', jsonataResult: '', queryResult: '' };
  if (id === 'expression-chaining') return { ...metadata, source: 'Seeded', first: '', second: '', visibility: 'show', editable: 'yes', controlled: 'Retained value' };
  if (id === 'expression-repeatables') return { ...metadata, rows: [{ source: 'Alpha', result: '' }, { source: 'Beta', result: '' }] };
  if (id.startsWith('behaviour-')) return {
    ...metadata, lookup: '', result: 'Waiting', dependent: 'Waiting', disabledResult: 'Unchanged',
    ...(id === 'behaviour-logical-row' ? { rows: [
      { label: 'Alpha', result: 'Waiting A' },
      { label: 'Beta', result: 'Waiting B' },
      { label: 'Gamma', result: 'Waiting C' },
    ] } : {}),
  };
  if (id === 'validation-fields-cross-field') return { ...metadata, requiredValue: 'Required', email: 'seed@example.test', left: 'A', right: 'B' };
  if (id === 'validation-groups') return { ...metadata, mode: 'none', extra: 'no', requiredValue: '', conditionalValue: '' };
  if (id === 'validation-summaries') return { ...metadata, requiredValue: 'Valid', overview: 'Overview', tabValue: 'Valid tab', intro: 'Introduction', panelValue: 'Valid panel', advisoryValue: '' };
  if (id === 'validation-repeatables') return { ...metadata, rows: [{ label: 'Alpha', email: 'alpha@example.test' }, { label: 'Beta', email: 'beta@example.test' }] };
  if (id === 'validation-save-operations') return { ...metadata, ordinaryValue: 'Ordinary valid', submitValue: 'Submission valid' };
  if (id === 'structure-tabs-accordions') return { ...metadata, overview: 'Overview', details: 'Details', first: 'First panel', second: 'Second panel' };
  if (id === 'structure-nested-repeatables') return { ...metadata, teams: [
    { name: 'Alpha', members: [{ name: 'Alice', email: 'alice@example.test' }, { name: 'Anne', email: 'anne@example.test' }] },
    { name: 'Beta', members: [{ name: 'Bob', email: 'bob@example.test' }] },
  ] };
  if (id === 'structure-question-tree') return { ...metadata, decision: { branch: 'alpha', alpha: 'open' } };
  if (id === 'components-basic') return { ...metadata, text: 'Original text', number: '7', description: 'Original paragraph', enabled: false, radio: 'alpha', choice: 'one' };
  if (id === 'components-date') return { ...metadata, date: '2026-10-03T00:00:00.000Z' };
  if (id === 'components-vocabulary') return { ...metadata, term: '', subjects: [] };
  if (id === 'components-record-relations') return { ...metadata, reference: null, related: [] };
  if (id === 'components-rich-text') return { ...metadata, description: '<p>Seeded research description</p>' };
  if (id === 'components-map') return { ...metadata, geometry: { type: 'FeatureCollection', features: [] } };
  if (id === 'components-files') return { ...metadata, files: [] };
  if (id.startsWith('lifecycle-')) return { ...metadata, notes: 'Seeded notes', serverValue: 'Initial value' };
  throw new Error(`No initial metadata defined for scenario '${id}'.`);
}
