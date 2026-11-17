import { expect } from 'chai';
import * as sinon from 'sinon';
import { FormOverride, viewMetadataSource } from '@researchdatabox/sails-ng-common';
import {
  compileRelatedDisplayContract as compile,
  relatedFormDescriptors,
  bindRelatedDisplayContract,
  cachedRelatedDisplayDeclarations,
  pruneRelatedViewValues,
} from '../../src/related-records/display-descriptors';
import { formatRecordFormFingerprint } from '../../src/RecordFormFingerprint';

const relation = {
  id: 'activities',
  recordType: 'activity',
  localField: 'metadata["activity.ids"]',
  foreignField: 'redboxOid',
  oidProperty: '["record.id"]',
  resolution: { metadataFields: ['/title'] },
};
const input = (name: string, id?: string): any => ({
  name,
  component: { class: 'SimpleInputComponent' },
  ...(id ? { relatedDisplay: { relationId: id } } : {}),
});
const group = (name: string, children: any[], id?: string): any => ({
  name,
  component: { class: 'GroupComponent', config: { componentDefinitions: children } },
  ...(id ? { relatedDisplay: { relationId: id } } : {}),
});
const form = (...componentDefinitions: any[]): any => ({ name: 'plan', type: 'plan', componentDefinitions });
const source = (config = {}): any => ({
  name: 'source',
  component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities', ...config } },
});

describe('related display descriptors', () => {
  it('does not treat empty authorized container provenance as an unrestricted scalar value', () => {
    const emptyGroup = { component: { class: 'GroupComponent', config: { componentDefinitions: [] } },
      model: { class: 'GroupModel', config: {} } };
    const value = { denied: { secret: 'DENIED_GROUP' }, rows: [{ secret: 'DENIED_ROW' }], scalar: { allowed: 'PUBLIC' } };
    const outer: any = { name: 'outer', model: { class: 'GroupModel', config: { value } },
      component: { class: 'GroupComponent', config: { componentDefinitions: [
        { name: 'denied', component: { class: 'ContentComponent', config: { content: {} } }, [viewMetadataSource]: { ...emptyGroup, name: 'denied' } },
        { name: 'rows', component: { class: 'ContentComponent', config: { content: [] } }, [viewMetadataSource]: {
          name: 'rows', component: { class: 'RepeatableComponent', config: { elementTemplate: emptyGroup } }, model: { class: 'RepeatableModel' },
        } },
        { name: 'scalar', component: { class: 'ContentComponent' }, [viewMetadataSource]: {
          name: 'scalar', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' },
        } },
      ] } } };
    pruneRelatedViewValues(form(outer));
    expect(outer.model.config.value).to.deep.equal({ denied: {}, rows: [{}], scalar: { allowed: 'PUBLIC' } });
    expect(JSON.stringify(outer.model.config.value)).not.to.contain('DENIED_');
  });

  it('rejects display declarations on reusable usages, including nested usages', () => {
    const usage: any = { name: 'wrapper', relatedDisplay: { relationId: 'activities' },
      component: { class: 'ReusableComponent' }, overrides: { reusableFormName: 'fields' } };
    const definitions: any = { fields: [input('title')] };
    expect(() => compile(form(usage), definitions)).to.throw('Declare relatedDisplay on the effective reusable');
    definitions.nested = [usage];
    expect(() => compile(form({ ...usage, relatedDisplay: undefined,
      overrides: { reusableFormName: 'nested' } }), definitions)).to.throw('Declare relatedDisplay on the effective reusable');
  });

  it('preserves explicitly flattened reusable groups', () => {
    const usage: any = { name: 'wrapper', component: { class: 'ReusableComponent', config: {
      componentDefinitions: [{ name: 'template', component: { class: 'GroupComponent' }, overrides: { replaceName: '' } }],
    } }, overrides: { reusableFormName: 'fields' } };
    const definitions: any = { fields: [group('template', [input('title', 'activities')])] };
    expect(compile(form(usage), definitions)?.displayTargets).to.deep.equal([
      { metadataPointer: '/title', relationId: 'activities' },
    ]);
  });

  it('ignores unrelated opted-in reusables for a legacy hook component', () => {
    const legacy = form({ name: 'custom', component: { class: 'HookCustomComponent' } });
    expect(compile(legacy)).to.equal(undefined);
    expect(compile(legacy, { unused: [input('transient', 'activities')] })).to.equal(undefined);
    const expand = sinon.spy(FormOverride.prototype, 'applyOverridesReusable');
    try {
      expect(compile(legacy, { unused: [input('transient', 'activities')] })).to.equal(undefined);
      expect(expand.callCount).to.equal(0);
    } finally {
      expand.restore();
    }
  });

  it('discovers only reachable nested reusable opt-ins and tolerates modeled/custom containers', () => {
    const wrapper: any = {
      name: 'usage',
      component: { class: 'ReusableComponent', config: { componentDefinitions: [] } },
      overrides: { reusableFormName: 'reachable' },
    };
    const custom: any = {
      name: 'hook',
      component: { class: 'HookContainer', config: { componentDefinitions: [wrapper] } },
    };
    const definitions: any = { reachable: [input('title', 'activities')], unused: [input('other', 'unconfigured')] };
    expect(compile(form(custom), definitions, [relation])?.displayTargets[0].metadataPointer).to.equal('/title');
    custom.model = { class: 'HookModel' };
    expect(compile(form(custom), definitions, [relation])?.displayTargets[0].metadataPointer).to.equal('/hook/title');
    expect(
      compile(form({ ...custom, relatedDisplay: { relationId: 'activities' } }), definitions, [relation])
        ?.displayTargets[0].metadataPointer
    ).to.equal('/hook');
  });

  it('ignores legacy self-referential and mutually recursive reusables without expansion', () => {
    const reusable = (name: string): any => ({
      component: { class: 'ReusableComponent' },
      overrides: { reusableFormName: name },
    });
    const expand = sinon.spy(FormOverride.prototype, 'applyOverridesReusable');
    try {
      expect(compile(form(reusable('self')), { self: [reusable('self')] })).to.equal(undefined);
      expect(compile(form(reusable('first')), {
        first: [reusable('second')], second: [reusable('first')],
      })).to.equal(undefined);
      expect(expand.callCount).to.equal(0);
    } finally {
      expand.restore();
    }
  });

  it('caches declarations across fresh form objects and binds relation changes without compilation', () => {
    const definition = form(input('cached-title', 'activities'));
    const key = formatRecordFormFingerprint({ reviewCache: definition })!;
    const expand = sinon.spy(FormOverride.prototype, 'applyOverridesReusable');
    try {
      const declarations = cachedRelatedDisplayDeclarations(key, definition, {})!;
      const firstCount = expand.callCount;
      expect(firstCount).to.be.greaterThan(0);
      const fresh = cachedRelatedDisplayDeclarations(key, structuredClone(definition), {})!;
      expect(expand.callCount).to.equal(firstCount);
      const first = bindRelatedDisplayContract(declarations, 'plan', [relation]);
      const second = bindRelatedDisplayContract(fresh, 'plan', [{ ...relation, localField: 'metadata.changed' }]);
      expect(first.relations[0].localField).not.to.equal(second.relations[0].localField);
      expect(expand.callCount).to.equal(firstCount);
      definition.componentDefinitions[0].name = 'changed-title';
      const changed = cachedRelatedDisplayDeclarations(
        formatRecordFormFingerprint({ reviewCache: definition })!,
        definition,
        {}
      )!;
      expect(changed.displayTargets[0].metadataPointer).to.equal('/changed-title');
      expect(expand.callCount).to.be.greaterThan(firstCount);
      fresh.displayTargets[0].metadataPointer = '/tampered';
      expect(cachedRelatedDisplayDeclarations(key, definition, {})!.displayTargets[0].metadataPointer).to.equal(
        '/cached-title'
      );
    } finally {
      expand.restore();
    }
  });

  it('compiles scalar, group-leaf, model-free group, whole-group and complete-repeatable metadata pointers', () => {
    const definition = form(
      input('title', 'activities'),
      group('details', [input('start', 'activities')]),
      group('whole', [input('leaf')], 'activities'),
      {
        name: 'titles',
        relatedDisplay: { relationId: 'activities' },
        component: { class: 'RepeatableComponent', config: { elementTemplate: input('') } },
      },
      input('a/b~c.d', 'activities')
    );
    expect(compile(definition, {}, [relation])?.displayTargets.map(target => target.metadataPointer)).to.deep.equal([
      '/title',
      '/details/start',
      '/whole',
      '/titles',
      '/a~1b~0c.d',
    ]);
  });

  it('expands reusables/renames inside tabs without adding wrapper metadata nesting', () => {
    const reusable: any = { fields: [group('template', [input('title', 'activities')])] };
    const use: any = {
      name: 'wrapper',
      component: {
        class: 'ReusableComponent',
        config: {
          componentDefinitions: [
            { name: 'template', overrides: { replaceName: 'renamed' }, component: { class: 'GroupComponent' } },
          ],
        },
      },
      overrides: { reusableFormName: 'fields' },
    };
    const definition = form({
      name: 'tabs',
      component: {
        class: 'TabComponent',
        config: {
          tabs: [
            {
              name: 'main',
              component: {
                class: 'TabContentComponent',
                config: { componentDefinitions: [use, source({ required: true })] },
              },
            },
          ],
        },
      },
    });
    const compiled = compile(definition, reusable, [relation])!;
    expect(compiled.displayTargets[0].metadataPointer).to.equal('/renamed/title');
    expect(relatedFormDescriptors(compiled).sources).to.deep.equal([
      {
        componentPointer: '/tabs/main/source',
        relationId: 'activities',
        required: true,
        referenceTokens: ['activity.ids'],
        oidTokens: ['record.id'],
      },
    ]);
    expect(
      definition.componentDefinitions[0].component.config.tabs[0].component.config.componentDefinitions[0].name
    ).to.equal('wrapper');
  });

  it('allows role presentations that agree and rejects missing/conflicting persistence flags', () => {
    const first = { ...input('title', 'activities'), constraints: { authorization: { allowRoles: ['editor'] } } };
    const second = {
      ...input('title', 'activities'),
      component: { class: 'TextAreaComponent' },
      constraints: { authorization: { allowRoles: ['reader'] } },
    };
    expect(compile(form(first, second), {}, [relation])?.displayTargets).to.have.length(1);
    expect(() => compile(form(first, input('title')), {}, [relation])).to.throw('Conflicting');
    expect(() => compile(form(first, input('title', 'other')))).to.throw('Conflicting');
  });

  it('rejects incompatible overlaps and per-row declarations', () => {
    expect(() => compile(form(group('g', [input('leaf', 'other')], 'activities')))).to.throw('overlapping');
    expect(() =>
      compile(
        form({
          name: 'rows',
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: group('', [input('leaf', 'activities')]),
            },
          },
        })
      )
    ).to.throw('complete repeatable');
    expect(() => compile(form(group('g', [input('leaf', 'activities')], 'activities')))).not.to.throw();
  });

  it('validates trusted relations and legacy source conflicts', () => {
    expect(() => compile(form(source()), {}, [])).to.throw('Missing');
    expect(() => compile(form(source()), {}, [relation, relation])).to.throw('ambiguous');
    expect(() => compile(form(source({ dataPath: 'activities' })), {}, [relation])).to.throw('legacy');
    expect(() =>
      relatedFormDescriptors(compile(form(source()), {}, [{ ...relation, localField: 'authorization.owner' }])!)
    ).to.throw('root metadata');
  });

  it('supplies activation references for targets without a source component and uses existing inferred relation IDs', () => {
    const implicit = { ...relation, id: undefined };
    const contract = compile(form(input('title', 'plan__activity__redboxOid')), {}, [implicit])!;
    expect(relatedFormDescriptors(contract)).to.deep.equal({
      displayTargets: [{ metadataPointer: '/title', relationId: 'plan__activity__redboxOid' }],
      relations: [
        { relationId: 'plan__activity__redboxOid', referenceTokens: ['activity.ids'], oidTokens: ['record.id'] },
      ],
      sources: [],
    });
  });

  it('binds only referenced definitions and leaves legacy fingerprint inputs exact', () => {
    const legacy = form(input('notes'));
    expect(compile(legacy, {}, [relation])).to.equal(undefined);
    const hash = (definition: any, relations: any[]) => {
      const compiled = compile(definition, {}, relations);
      return formatRecordFormFingerprint({ form: definition, ...(compiled ? { relatedRecords: compiled } : {}) });
    };
    expect(hash(legacy, [relation])).to.equal(formatRecordFormFingerprint({ form: legacy }));
    const opted = form(input('title', 'activities'), source());
    expect(hash(opted, [relation])).not.to.equal(
      hash(opted, [{ ...relation, resolution: { metadataFields: ['/startDate'] } }])
    );
    expect(hash(opted, [relation])).not.to.equal(hash(opted, [{ ...relation, localField: 'metadata.other' }]));
    expect(hash(opted, [relation])).to.equal(hash(opted, [relation, { ...relation, id: 'unused' }]));
  });
});
