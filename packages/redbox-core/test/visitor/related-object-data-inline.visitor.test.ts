import { nothingLogger } from '@researchdatabox/sails-ng-common';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { FormConfigFrame, RelatedObjectDataFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../../src/RecordsService';
import { UserModel } from '../../src/model/storage/UserModel';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { RelatedObjectDataInlineFormConfigVisitor } from '../../src/visitor/related-object-data-inline.visitor';

describe('RelatedObjectDataInlineFormConfigVisitor', () => {
  const logger = nothingLogger;

  async function resolve(values: unknown[], oidProperty = 'id') {
    const input: FormConfigFrame = {
      name: 'test',
      componentDefinitions: [
        {
          name: 'related',
          component: {
            class: 'RelatedObjectDataComponent',
            config: { dataPath: 'metadata.publications', oidProperty, relatedFields: ['title', 'contributor.name'] },
          },
        },
      ],
    };
    const form = await new ConstructFormConfigVisitor(logger).start({ data: input });
    const records: Record<string, Record<string, unknown>> = {
      allowed: { metadata: { title: 'Allowed', contributor: { name: 'Person', secret: 'hidden' }, secret: 'hidden' } },
      allowed2: { metadata: { title: 'Allowed 2' } },
      denied: { metadata: { title: 'Denied' } },
    };
    const service = {
      getMeta: async (oid: string) => {
        if (oid === 'allowed') await new Promise(resolve => setTimeout(resolve, 10));
        if (!records[oid]) throw new Error('missing');
        return records[oid];
      },
      hasViewAccess: (_brand: unknown, _user: unknown, _roles: unknown, record: unknown) =>
        record !== records['denied'],
    } as unknown as RecordsService;
    const user = Object.assign(new UserModel(), { username: 'user' });
    await new RelatedObjectDataInlineFormConfigVisitor(logger, service).resolve(
      form,
      { publications: values },
      { user, brand: { name: 'default' } as never }
    );
    return (form.componentDefinitions[0] as RelatedObjectDataFormComponentDefinitionOutline).component.config;
  }

  it('projects configured fields and buckets denied and failed oids', async () => {
    const config = await resolve([{ id: 'allowed' }, { id: 'denied' }, { id: 'missing' }, { id: 'allowed' }]);
    expect(config?.relatedObjects).to.deep.equal([
      { oid: 'allowed', title: 'Allowed', fields: { title: 'Allowed', contributor: { name: 'Person' } } },
    ]);
    expect(config?.accessDeniedOids).to.deep.equal(['denied']);
    expect(config?.failedOids).to.deep.equal(['missing']);
  });

  it('supports string oids and a custom oid property', async () => {
    expect((await resolve(['allowed']))?.relatedObjects?.[0]?.oid).to.equal('allowed');
    expect((await resolve([{ redboxOid: 'allowed' }], 'redboxOid'))?.relatedObjects?.[0]?.oid).to.equal('allowed');
  });

  it('preserves source order when record lookups finish out of order', async () => {
    const config = await resolve(['allowed', 'allowed2']);

    expect(config?.relatedObjects?.map(record => record.oid)).to.deep.equal(['allowed', 'allowed2']);
  });

  it('returns empty buckets when dataPath is missing', async () => {
    const config = await resolve([]);
    expect(config?.relatedObjects).to.deep.equal([]);
    expect(config?.accessDeniedOids).to.deep.equal([]);
    expect(config?.failedOids).to.deep.equal([]);
  });

  it('does not report records skipped by the resolution limit as failed', async () => {
    const input: FormConfigFrame = {
      name: 'test',
      componentDefinitions: [
        {
          name: 'related',
          component: {
            class: 'RelatedObjectDataComponent',
            config: { dataPath: 'metadata.publications', relatedFields: ['title'] },
          },
        },
      ],
    };
    const form = await new ConstructFormConfigVisitor(logger).start({ data: input });
    const service = {
      getMeta: async (oid: string) => ({ metadata: { title: oid } }),
      hasViewAccess: () => true,
    } as unknown as RecordsService;
    const user = Object.assign(new UserModel(), { username: 'user' });
    const oids = Array.from({ length: 51 }, (_value, index) => `oid-${index}`);

    await new RelatedObjectDataInlineFormConfigVisitor(logger, service).resolve(
      form,
      { publications: oids },
      { user, brand: { name: 'default' } as never }
    );

    const config = (form.componentDefinitions[0] as RelatedObjectDataFormComponentDefinitionOutline).component.config;
    expect(config?.relatedObjects).to.have.length(50);
    expect(config?.failedOids).to.deep.equal([]);
  });
});


describe('relation-based initial resolution', () => {
  const { resolveRelatedMetadata } = require('../../src/related-records/resolver');
  const { relatedFormDescriptors, compileRelatedDisplayContract } = require('../../src/related-records/display-descriptors');
  for (const references of ['a', { oid: 'a' }, ['a', { oid: 'b' }, 'a']]) {
    it(`matches backend resolution for ${JSON.stringify(references)} without changing metadata`, async () => {
      const input: FormConfigFrame = {
        name: 'test', type: 'plan', componentDefinitions: [{ name: 'source', component: {
          class: 'RelatedObjectDataComponent', config: { relationId: 'activities' },
        } }],
      };
      const relations = [{ id: 'activities', recordType: 'activity', localField: 'metadata.references',
        foreignField: 'redboxOid', cardinality: 'many', oidProperty: 'oid',
        resolution: { metadataFields: ['/title', '/empty'] } }];
      const metadata = { references, local: 'answer' };
      const before = JSON.stringify(metadata);
      const context = { brand: { id: 'tenant' }, user: { username: 'reader' } } as never;
      const root = { redboxOid: 'root', metaMetadata: { type: 'plan', brandId: 'tenant' }, metadata };
      const dependencies = {
        storage: { getMeta: async (oid: string) => ({ redboxOid: oid,
          metaMetadata: { type: 'activity', brandId: 'tenant' },
          metadata: { title: oid, empty: false, secret: 'private' } }) },
        relations: async () => relations, authorizeRoot: async () => true, canRead: () => true,
        sourceMetadata: async (record: any) => record.metadata,
      };
      const calls: any[] = [];
      const service = { resolveRelatedMetadata: async (...args: any[]) => {
        calls.push(args);
        return resolveRelatedMetadata(...args, dependencies);
      } } as unknown as RecordsService;
      const form = await new ConstructFormConfigVisitor(nothingLogger).start({ data: input });
      form.relatedRecords = relatedFormDescriptors(compileRelatedDisplayContract(input, {}, relations));
      await new RelatedObjectDataInlineFormConfigVisitor(nothingLogger, service).resolve(
        form, metadata, { ...context as any, record: root }
      );
      const backend = await resolveRelatedMetadata(root, { ...context as any, audience: 'browser' },
        { relations: [{ relationId: 'activities', required: false }] }, dependencies);
      expect(form.relatedRecords!.sources[0].initialResult).to.deep.equal(backend.activities);
      expect(calls[0][0].redboxOid).to.equal('root');
      expect(calls[0][1].audience).to.equal('browser');
      expect(form.relatedRecords!.sources[0].referenceFingerprint).to.equal(JSON.stringify({
        values: Array.isArray(references) ? ['a', 'b'] : ['a'], invalidIndices: [],
      }));
      const config = (form.componentDefinitions[0] as RelatedObjectDataFormComponentDefinitionOutline).component.config!;
      expect(config.accessDeniedOids).to.deep.equal([]);
      expect(config.failedOids).to.deep.equal([]);
      expect(JSON.stringify(metadata)).to.equal(before);
      expect(JSON.stringify(form.relatedRecords)).not.to.contain('private');
    });
  }

  it('rejects conflicting legacy configuration even when invoked directly', async () => {
    const input: FormConfigFrame = { name: 'test', componentDefinitions: [{ name: 'source', component: {
      class: 'RelatedObjectDataComponent', config: { relationId: 'activities', dataPath: 'metadata.old' },
    } }] };
    const form = await new ConstructFormConfigVisitor(nothingLogger).start({ data: input });
    let error: unknown;
    try {
      await new RelatedObjectDataInlineFormConfigVisitor(nothingLogger, {} as RecordsService).resolve(
        form, {}, { brand: {}, user: {} } as never
      );
    } catch (caught) { error = caught; }
    expect(String(error)).to.contain('conflicts');
  });
});
