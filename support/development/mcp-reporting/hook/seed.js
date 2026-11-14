'use strict';
const faculties = ['Arts and Humanities', 'Engineering', 'Medicine', 'Science'];
const stages = ['draft', 'review', 'approved', 'archived'];
const topics = [
  'Machine learning for research discovery',
  'Coastal climate observations',
  'Public health survey analysis',
  'Digital cultural heritage',
  'Renewable energy storage',
];
function fixtures() {
  const records = [];
  let sequence = 0;
  for (const [year, perMonth] of [
    [2024, 6],
    [2025, 9],
    [2026, 12],
  ]) {
    for (let month = 1; month <= 12; month++) {
      for (let index = 0; index < perMonth; index++, sequence++) {
        const monthId = String(month).padStart(2, '0');
        const topic = topics[sequence % topics.length];
        const access = [
          { view: ['reporting-researcher'] },
          { edit: ['reporting-researcher'] },
          { viewRoles: ['Researcher'] },
          { editRoles: ['Researcher'] },
        ][sequence % 4];
        records.push({
          redboxOid: `reporting-demo-${year}-${monthId}-${String(index + 1).padStart(3, '0')}`,
          metadata: {
            title: `${topic} — ${year}/${monthId} project ${index + 1}`,
            description: `Fictional demonstration RDMP for ${topic.toLowerCase()}. The project collects synthetic research datasets; all names and details in this demo are fictional.`,
            faculty: faculties[sequence % 4],
            sensitiveData: sequence % 3 === 0,
            internalDemoNote: 'Not exposed by the reporting view or schema.',
          },
          metaMetadata: {
            type: 'rdmp',
            form: 'rdmp-reporting-demo',
            createdOn: `${year}-${monthId}-${String(index + 2).padStart(2, '0')}T10:00:00.000Z`,
            createdBy: 'reporting-researcher',
            searchCore: 'default',
          },
          workflow: { stage: stages[(sequence + Math.floor(sequence / 4)) % 4] },
          authorization: {
            view: [],
            edit: [],
            viewRoles: [],
            editRoles: [],
            viewPending: [],
            editPending: [],
            ...access,
          },
          demoVisibility: 'visible',
        });
      }
    }
  }
  for (const [visibility, count] of [
    ['hidden', 24],
    ['otherBrand', 12],
  ]) {
    for (let index = 0; index < count; index++) {
      records.push({
        redboxOid: `reporting-demo-${visibility}-${index + 1}`,
        metadata: {
          title: `Machine learning ${visibility} permission fixture ${index + 1}`,
          description: 'This fictional sentinel must not affect the researcher reports.',
          faculty: faculties[index % 4],
          sensitiveData: true,
        },
        metaMetadata: {
          type: 'rdmp',
          form: 'rdmp-reporting-demo',
          createdOn: `2026-${String((index % 12) + 1).padStart(2, '0')}-15T10:00:00.000Z`,
          createdBy: 'reporting-private',
          searchCore: 'default',
        },
        workflow: { stage: 'review' },
        authorization: {
          view: [],
          edit: [],
          viewRoles: visibility === 'otherBrand' ? ['Researcher'] : ['Admin'],
          editRoles: [],
          viewPending: [],
          editPending: [],
        },
        demoVisibility: visibility,
      });
    }
  }
  return records;
}
function expectedResults() {
  const visible = fixtures().filter(record => record.demoVisibility === 'visible');
  const countBy = selector =>
    visible.reduce((counts, record) => {
      const key = selector(record);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  return {
    visible: visible.length,
    hidden: 24,
    otherBrand: 12,
    yearly: countBy(record => record.metaMetadata.createdOn.slice(0, 4)),
    faculty2026: visible
      .filter(record => record.metaMetadata.createdOn.startsWith('2026'))
      .reduce((counts, record) => {
        counts[record.metadata.faculty] = (counts[record.metadata.faculty] || 0) + 1;
        return counts;
      }, {}),
    monthly: { 2024: 6, 2025: 9, 2026: 12 },
    stages: countBy(record => record.workflow.stage),
    sensitive: visible.filter(record => record.metadata.sensitiveData).length,
    machineLearning: visible.filter(record => record.metadata.title.startsWith('Machine learning')).length,
  };
}
async function seed(formConfiguration) {
  const { createRecordSaveContext } = require('@researchdatabox/redbox-core');
  const brand = BrandingService.getDefault();
  if (!brand || !sails.config.reporting.enabled) throw new Error('Reporting demo branding/configuration missing');
  // This isolated development hook owns this one form; keep its persisted layout current on restart.
  if (formConfiguration?.name !== 'rdmp-reporting-demo') throw new Error('Reporting demo form missing');
  const form = await Form.findOne({ name: formConfiguration.name, branding: brand.id });
  if (!form) throw new Error('Reporting demo form was not bootstrapped');
  if (JSON.stringify(form.configuration) !== JSON.stringify(formConfiguration))
    await Form.updateOne({ id: form.id }).set({ configuration: formConfiguration });
  const role = brand.roles.find(candidate => candidate.name === 'Researcher');
  if (!role) throw new Error('Reporting demo researcher role missing');
  const user = await User.findOrCreate(
    { username: 'reporting-researcher' },
    {
      username: 'reporting-researcher',
      type: 'oidc',
      name: 'Reporting Demo Researcher',
      email: 'reporting-researcher@example.invalid',
    }
  );
  const populated = await User.findOne({ id: user.id }).populate('roles');
  if (!populated.roles.some(candidate => candidate.id === role.id))
    await User.addToCollection(user.id, 'roles', [role.id]);
  const other = await BrandingConfig.findOrCreate({ name: 'reporting-demo-other' }, { name: 'reporting-demo-other' });
  let created = 0;
  for (const fixture of fixtures()) {
    const { demoVisibility, ...record } = fixture;
    const tenant = demoVisibility === 'otherBrand' ? { ...brand, id: other.id, name: other.name } : brand;
    record.metaMetadata.brandId = tenant.id;
    const existing = await RecordsService.getMeta(record.redboxOid);
    if (!existing?.redboxOid) {
      const result = await RecordsService.create(
        tenant,
        record,
        {},
        { username: 'reporting-demo-loader' },
        false,
        false,
        undefined,
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: {
            mode: 'bypass',
            reason: 'trusted-data-migration',
            actor: { kind: 'service', id: 'reporting-demo-loader' },
          },
        })
      );
      if (!result.isSuccessful()) throw new Error(`Demo fixture creation failed: ${record.redboxOid}`);
      created++;
    }
  }
  // Solr clients and schema are initialized on Sails ready, after bootstrap completes.
  sails.on('ready', () => {
    setImmediate(async () => {
      try {
        const core = sails.config.solr.cores.default.options;
        const solr = `http://${core.host}:${core.port}/solr/${core.core}`;
        let ready = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          const schema = await fetch(`${solr}/schema`).then(response => response.json());
          if (schema.schema?.fields?.some(field => field.name === 'full_text')) {
            ready = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!ready) throw new Error('Solr demo schema did not initialize');
        for (const fixture of fixtures()) {
          // Reuse ReDBox indexing, including ACL flattening and field mapping.
          await SolrSearchService.solrAddOrUpdate({ attrs: { data: await RecordsService.getMeta(fixture.redboxOid) } });
        }
        const indexed = await fetch(`${solr}/select?q=*:*&rows=0`).then(response => response.json());
        if (indexed.response?.numFound !== fixtures().length) throw new Error('Demo search index is incomplete');
        console.log(JSON.stringify({ event: 'reporting_demo_ready', created, expected: expectedResults() }));
      } catch (error) {
        console.error('Reporting demo indexing failed:', error.message);
      }
    });
  });
}
module.exports = { fixtures, expectedResults, seed };
