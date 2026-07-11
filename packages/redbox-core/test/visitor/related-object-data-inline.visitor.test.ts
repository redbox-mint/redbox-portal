let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import { FormConfigFrame, RelatedObjectDataFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import type { ILogger } from '../../src/Logger';
import type { RecordsService } from '../../src/RecordsService';
import { UserModel } from '../../src/model/storage/UserModel';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { RelatedObjectDataInlineFormConfigVisitor } from '../../src/visitor/related-object-data-inline.visitor';

describe('RelatedObjectDataInlineFormConfigVisitor', () => {
  const logger = Object.fromEntries(['silly','verbose','trace','debug','log','info','warn','error','crit','fatal','silent','blank'].map(key => [key, () => undefined])) as unknown as ILogger;

  async function resolve(values: unknown[], oidProperty = 'id') {
    const input: FormConfigFrame = {
      name: 'test',
      componentDefinitions: [{
        name: 'related',
        component: { class: 'RelatedObjectDataComponent', config: { dataPath: 'metadata.publications', oidProperty, relatedFields: ['title', 'contributor.name'] } },
      }],
    };
    const form = await new ConstructFormConfigVisitor(logger).start({ data: input });
    const records: Record<string, Record<string, unknown>> = {
      allowed: { metadata: { title: 'Allowed', contributor: { name: 'Person', secret: 'hidden' }, secret: 'hidden' } },
      denied: { metadata: { title: 'Denied' } },
    };
    const service = {
      getMeta: async (oid: string) => { if (!records[oid]) throw new Error('missing'); return records[oid]; },
      hasViewAccess: (_brand: unknown, _user: unknown, _roles: unknown, record: unknown) => record === records['allowed'],
    } as unknown as RecordsService;
    const user = Object.assign(new UserModel(), { username: 'user' });
    await new RelatedObjectDataInlineFormConfigVisitor(logger, service).resolve(form, { publications: values }, { user, brand: { name: 'default' } as never });
    return (form.componentDefinitions[0] as RelatedObjectDataFormComponentDefinitionOutline).component.config;
  }

  it('projects configured fields and buckets denied and failed oids', async () => {
    const config = await resolve([{ id: 'allowed' }, { id: 'denied' }, { id: 'missing' }, { id: 'allowed' }]);
    expect(config?.relatedObjects).to.deep.equal([{ oid: 'allowed', title: 'Allowed', fields: { title: 'Allowed', contributor: { name: 'Person' } } }]);
    expect(config?.accessDeniedOids).to.deep.equal(['denied']);
    expect(config?.failedOids).to.deep.equal(['missing']);
  });

  it('supports string oids and a custom oid property', async () => {
    expect((await resolve(['allowed']))?.relatedObjects?.[0]?.oid).to.equal('allowed');
    expect((await resolve([{ redboxOid: 'allowed' }], 'redboxOid'))?.relatedObjects?.[0]?.oid).to.equal('allowed');
  });

  it('returns empty buckets when dataPath is missing', async () => {
    const config = await resolve([]);
    expect(config?.relatedObjects).to.deep.equal([]);
    expect(config?.accessDeniedOids).to.deep.equal([]);
    expect(config?.failedOids).to.deep.equal([]);
  });
});
