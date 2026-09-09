import { resolveAutomaticTransitionPlan } from '../../src/workflow-transition/automatic';
import { deriveWorkflowTransitionId } from '../../src/record-workflow-administration';
import { deriveStableActionBindingId, parseActionDefinitionId } from '../../src/action-registry';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { firstValueFrom } from 'rxjs';
import Handlebars from 'handlebars';
import { handlebarsPrecompile, handlebarsCompile } from '@researchdatabox/sails-ng-common';
import { Services as Forms } from '../../src/services/FormsService';
import { Services as Validation } from '../../src/services/RecordValidationService';
import { Services as Dashboards } from '../../src/services/DashboardTypesService';
import { createRecordValidationFixture, validationForm } from '../fixtures/record-validation.fixtures';
import { parseWorkflowStageKey, type PublishableRecordDefinitionAggregateDto } from '@researchdatabox/sails-ng-common';
import {
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  hashRecordDefinition,
} from '../../src/record-workflow-administration';
import {
  activeRecordDefinitions,
  RECORD_DEFINITION_RUNTIME_CACHE_MAX,
  Services,
} from '../../src/services/RecordDefinitionRuntimeService';
import { Services as RecordTypes } from '../../src/services/RecordTypesService';
import { Services as WorkflowSteps } from '../../src/services/WorkflowStepsService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

function definition(label = 'Published'): PublishableRecordDefinitionAggregateDto {
  return {
    schemaVersion: 1,
    definitionState: 'publishable',
    recordType: {
      labels: { name: label, namePlural: label },
      searchable: true,
      searchFilters: [],
      relationships: [],
      transferResponsibility: { fields: [], roleRules: [] },
      validation: { mode: 'shadow', operations: [] },
      concurrency: { mode: 'observe' },
    },
    stages: [
      {
        schemaVersion: 1,
        key: parseWorkflowStageKey('draft'),
        label,
        formReference: 'form',
        viewRoles: ['Admin'],
        editRoles: ['Admin'],
        displayOrder: 0,
        starting: true,
        terminal: true,
        validationOverrides: [],
      },
    ],
    transitions: [],
    actionBindings: [],
  };
}

describe('B06 active-definition runtime', () => {
  let identities: any[];
  let revisions: any[];
  let runtime: Services.RecordDefinitionRuntime;
  const query = (value: any) => ({ exec: (cb: any) => cb(null, structuredClone(value)) });
  function seed(brand = 'brand1', number = 1, key = 'dataset') {
    const coordinates = { brandId: brand, recordTypeKey: key };
    const id = deriveRecordDefinitionRevisionId(coordinates, number);
    const aggregate = definition(`${brand}-${number}`);
    const identity = {
      id: `${brand}-${key}`,
      branding: brand,
      name: key,
      definitionId: deriveRecordDefinitionId(coordinates),
      activeRevisionId: id,
      activeRevisionNumber: number,
      version: number,
      packageType: 'dataset',
      searchCore: 'records',
      concurrentModification: { mode: 'last-write-wins' },
    };
    identities = identities.filter(row => row.id !== identity.id).concat(identity);
    revisions.push({
      id,
      schemaVersion: 1,
      branding: brand,
      recordType: identity.id,
      recordTypeId: identity.definitionId,
      recordTypeKey: key,
      revisionNumber: number,
      canonicalHash: hashRecordDefinition(aggregate),
      definition: aggregate,
      actionContracts: [],
      source: { operation: 'publish', sourceRevisionNumber: null },
      publishedAt: new Date(),
      publishedBy: { id: 'admin' },
    });
    return identity;
  }
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    identities = [];
    revisions = [];
    (global as any).RecordType = {
      findOne: sinon.stub().callsFake((criteria: any) => {
        const where = criteria.where ?? criteria;
        return query(identities.find(row => Object.entries(where).every(([key, value]) => row[key] === value)));
      }),
      find: sinon
        .stub()
        .callsFake((criteria: any) =>
          query(identities.filter(row => !criteria.where?.branding || row.branding === criteria.where.branding))
        ),
    };
    (global as any).RecordDefinitionRevision = {
      findOne: sinon
        .stub()
        .callsFake((criteria: any) =>
          query(revisions.find(row => Object.entries(criteria).every(([key, value]) => row[key] === value)))
        ),
    };
    (global as any).RecordDefinitionDraft = {
      findOne: sinon.stub().throws(new Error('Runtime must never read drafts')),
    };
    (global as any).WorkflowStep = { findOne: sinon.stub().throws(), find: sinon.stub().throws() };
    runtime = new Services.RecordDefinitionRuntime();
    activeRecordDefinitions().invalidate('brand1', 'dataset');
    activeRecordDefinitions().invalidate('brand2', 'dataset');
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    for (const key of [
      'RecordType',
      'RecordDefinitionRevision',
      'RecordDefinitionDraft',
      'WorkflowStep',
      'RecordTypesService',
      'WorkflowStepsService',
    ])
      delete (global as any)[key];
    sinon.restore();
  });

  it('reads active only, caches immutable revisions, and preserves brand isolation', async () => {
    seed();
    seed('brand2');
    identities[0].draftLifecycleOperation = { definition: { secretDraft: 'never runtime' } };
    const a = await runtime.resolve('brand1', 'dataset');
    expect(a?.identity).not.to.have.property('draftLifecycleOperation');
    const again = await runtime.resolve('brand1', 'dataset');
    const b = await runtime.resolve('brand2', 'dataset');
    expect(a?.revision).to.equal(again?.revision);
    expect(b?.revision.definition.recordType.labels.name).to.equal('brand2-1');
    expect((global as any).RecordType.findOne.callCount).to.equal(3);
    expect((global as any).RecordDefinitionRevision.findOne.callCount).to.equal(2);
    expect(() => ((a!.revision.definition.recordType.labels as any).name = 'poison')).to.throw();
    expect((global as any).RecordDefinitionDraft.findOne.called).to.equal(false);
  });

  it('converges on the very next read on two nodes without invalidation delivery or a timer', async () => {
    seed();
    const other = new Services.RecordDefinitionRuntime();
    await runtime.resolve('brand1', 'dataset');
    await other.resolve('brand1', 'dataset');
    seed('brand1', 2);
    expect((await runtime.resolve('brand1', 'dataset'))?.revision.revisionNumber).to.equal(2);
    expect((await other.resolve('brand1', 'dataset'))?.revision.revisionNumber).to.equal(2);
    identities[0].retiredAt = new Date();
    expect((await other.resolve('brand1', 'dataset'))?.identity.retiredAt).to.be.a('string');
  });

  it('does not negative-cache an unpublished draft and never projects it as a runtime type', async () => {
    const row = seed();
    row.activeRevisionId = null as any;
    row.activeRevisionNumber = null as any;
    (row as any).draftId = 'draft';
    expect(await runtime.resolve('brand1', 'dataset')).to.equal(null);
    await expectFailure(() => runtime.project(row as any));
    expect(await firstValueFrom(new RecordTypes.RecordTypes().getAll({ id: 'brand1' } as any))).to.deep.equal([]);
    seed('brand1', 2);
    expect((await runtime.resolve('brand1', 'dataset'))?.revision.revisionNumber).to.equal(2);
  });

  it('resolves settings and stages from one aggregate across an intervening publication', async () => {
    seed();
    const types = new RecordTypes.RecordTypes();
    const workflows = new WorkflowSteps.WorkflowSteps();
    const selected = await firstValueFrom(types.get({ id: 'brand1' } as any, 'dataset'));
    expect(selected.concurrentModification?.mode).to.equal('observe');
    seed('brand1', 2);
    const stage = await firstValueFrom(workflows.getFirst(selected));
    expect((stage as any).config.workflow.stageLabel).to.equal('brand1-1');
    const next = await firstValueFrom(types.get({ id: 'brand1' } as any, 'dataset'));
    expect(((await firstValueFrom(workflows.getFirst(next))) as any).config.workflow.stageLabel).to.equal('brand1-2');
    expect((global as any).WorkflowStep.findOne.called).to.equal(false);
    expect(
      (await firstValueFrom(types.get({ id: 'brand1' } as any, 'dataset', ['concurrentModification'])))
        .concurrentModification?.mode
    ).to.equal('observe');
  });

  it('keeps field-selected record types paired with the same workflow snapshot', async () => {
    seed();
    const types = new RecordTypes.RecordTypes();
    const selected = await firstValueFrom(types.get({ id: 'brand1' } as any, 'dataset', ['name']));
    seed('brand1', 2);
    const step = await firstValueFrom(new WorkflowSteps.WorkflowSteps().getFirst(selected));
    expect((step as any).config.workflow.stageLabel).to.equal('brand1-1');
    expect(selected).not.to.have.property('actionPlan');
  });

  for (const layer of ['recordType', 'stage']) {
    for (const targets of [[], ['review'], ['published']]) {
      it(`enforces published ${layer} target restrictions ${JSON.stringify(targets)} in validation`, async () => {
        seed();
        const aggregate = revisions[0].definition;
        aggregate.recordType.validation.mode = 'enforce';
        aggregate.stages[0].formReference = 'dataset-2.4-draft';
        aggregate.stages.push({ ...aggregate.stages[0], key: 'published', starting: false, displayOrder: 1 });
        const operation = { name: 'submit', enabledValidationGroups: ['submit'], allowedTargetStages: targets };
        if (layer === 'recordType') aggregate.recordType.validation.operations = [operation];
        else aggregate.stages[1].validationOverrides = [operation];
        revisions[0].canonicalHash = hashRecordDefinition(aggregate);
        const selected = await activeRecordDefinitions().project(identities[0]);
        const stages = await activeRecordDefinitions().stages(selected);
        const projectedOperations =
          layer === 'recordType'
            ? selected.recordValidation?.operations
            : (stages![1].config as any).recordValidation.operations;
        expect(projectedOperations.submit.allowedTargetSteps).to.deep.equal(targets);
        expect(projectedOperations.submit).not.to.have.property('allowedTargetStages');
        const fixture = createRecordValidationFixture();
        fixture.dependencies.loadWorkflowStep = async (type, key) =>
          (await activeRecordDefinitions().stages(type))?.find(stage => stage.name === key) as any;
        const result = await new Validation.RecordValidation(fixture.dependencies).resolve(
          {
            ...fixture.request,
            candidate: {
              ...fixture.request.candidate,
              metaMetadata: { brandId: 'brand1', type: 'dataset', form: 'dataset-2.4-draft' },
            },
            writeKind: 'transition',
            targetStep: 'published',
            validationOperation: 'submit',
          },
          selected
        );
        expect(result.shouldBlock, JSON.stringify(result)).to.equal(!targets.includes('published'));
        if (!targets.includes('published')) {
          expect(result.diagnostics.map(item => item.code)).to.include(
            'record-validation-operation-target-unauthorized'
          );
        }
        expect(fixture.calls.recordTypes).to.deep.equal([]);
      });
    }
  }

  it('retains the selected revision through validation and discovery after publication', async () => {
    seed();
    const aggregate = revisions[0].definition;
    aggregate.recordType.validation.mode = 'enforce';
    aggregate.stages[0].formReference = 'dataset-2.4-draft';
    revisions[0].canonicalHash = hashRecordDefinition(aggregate);
    const selected = await activeRecordDefinitions().project(identities[0]);
    seed('brand1', 2);
    const fixture = createRecordValidationFixture({
      form: validationForm({
        validationOperations: {
          submit: { enabledValidationGroups: ['submit'] },
        },
      }),
    });
    fixture.dependencies.loadRecordType = async () => {
      throw new Error('Mixed revision reload');
    };
    fixture.dependencies.loadWorkflowStep = async (type, key) => {
      expect(type).to.equal(selected);
      return (await activeRecordDefinitions().stages(type))?.find(stage => stage.name === key) as any;
    };
    fixture.dependencies.loadWorkflowSteps = async type => {
      expect(type).to.equal(selected);
      return (await activeRecordDefinitions().stages(type)) as any;
    };
    const request = {
      ...fixture.request,
      candidate: {
        ...fixture.request.candidate,
        metaMetadata: { brandId: 'brand1', type: 'dataset', form: 'dataset-2.4-draft' },
      },
      validationOperation: 'submit',
    };
    const validator = new Validation.RecordValidation(fixture.dependencies);
    for (const phase of ['pre-save', 'post-save'] as const) {
      const result = await validator.resolve({ ...request, phase }, selected);
      expect(result.status, JSON.stringify(result)).to.equal('resolved');
      expect(result.mode).to.equal('enforce');
      expect(result.shouldBlock).to.equal(false);
    }
    const operations = await validator.discoverOperations(
      { ...request, canEdit: true, authorizedTargetSteps: [] },
      selected
    );
    expect(operations.map(item => item.name)).to.include('submit');
    expect(fixture.calls.forms.every(call => call.formName === 'dataset-2.4-draft')).to.equal(true);
    expect((await activeRecordDefinitions().resolve('brand1', 'dataset'))?.revision.revisionNumber).to.equal(2);
  });

  it('selects starting forms from the active stages and keeps form queries brand scoped', async () => {
    seed();
    seed('brand2');
    const types = new RecordTypes.RecordTypes();
    (global as any).RecordTypesService = types;
    (global as any).WorkflowStepsService = new WorkflowSteps.WorkflowSteps();
    (global as any).Form = { findOne: sinon.stub().callsFake((criteria: any) => query(criteria)) };
    try {
      const forms = new Forms.Forms();
      for (const brand of ['brand1', 'brand2']) {
        const row = revisions.find(revision => revision.branding === brand);
        row.definition.stages[0].starting = false;
        row.definition.stages.push({
          ...row.definition.stages[0],
          key: 'review',
          starting: true,
          formReference: `${brand}-active-form`,
          displayOrder: 1,
        });
        row.canonicalHash = hashRecordDefinition(row.definition);
        const form = await firstValueFrom(forms.getFormByStartingWorkflowStep({ id: brand } as any, 'dataset', true));
        expect(form).to.deep.equal({ name: `${brand}-active-form`, branding: brand });
      }
      expect((global as any).WorkflowStep.find.called).to.equal(false);
      seed('brand1', 2);
      expect(
        (await firstValueFrom(forms.getFormByStartingWorkflowStep({ id: 'brand1' } as any, 'dataset', true))).name
      ).to.equal('form');
      identities[0].activeRevisionId = 'corrupt';
      const count = (global as any).Form.findOne.callCount;
      expect(
        await firstValueFrom(
          forms.getFormByStartingWorkflowStep({ id: identities[0].branding } as any, 'dataset', true)
        )
      ).to.equal(null);
      expect((global as any).Form.findOne.callCount).to.equal(count);
    } finally {
      delete (global as any).Form;
    }
  });

  it('uses legacy starting forms only for untouched identities', async () => {
    identities.push({ id: 'legacy', branding: 'brand1', name: 'dataset' });
    (global as any).RecordTypesService = new RecordTypes.RecordTypes();
    (global as any).WorkflowStepsService = new WorkflowSteps.WorkflowSteps();
    (global as any).WorkflowStep.findOne.callsFake(() =>
      query({ name: 'draft', starting: true, config: { form: 'legacy-form' } })
    );
    (global as any).Form = { findOne: sinon.stub().callsFake((criteria: any) => query(criteria)) };
    try {
      const forms = new Forms.Forms();
      expect(
        (await firstValueFrom(forms.getFormByStartingWorkflowStep({ id: 'brand1' } as any, 'dataset', true))).name
      ).to.equal('legacy-form');
      for (const managed of [{ draftId: 'draft' }, { version: 1 }]) {
        Object.assign(identities[0], managed);
        expect(
          await firstValueFrom(forms.getFormByStartingWorkflowStep({ id: 'brand1' } as any, 'dataset', true))
        ).to.equal(null);
      }
      expect((global as any).WorkflowStep.findOne.callCount).to.equal(1);
    } finally {
      delete (global as any).Form;
    }
  });

  it('projects dashboard columns, order, rendering and sidebar into the consumer contract', async () => {
    seed();
    const aggregate = revisions[0].definition;
    aggregate.recordType.dashboard = {
      schemaVersion: 1,
      showAdminSidebar: true,
      columns: [
        { id: 'title', title: 'Title', value: { kind: 'path', path: 'metadata.title' }, displayOrder: 2 },
        {
          id: 'custom',
          title: 'Custom',
          value: { kind: 'path', path: 'metadata.other' },
          render: { kind: 'handlebars', template: '<b>{{metadata.other}}</b>' },
          displayOrder: 1,
        },
      ],
    };
    revisions[0].canonicalHash = hashRecordDefinition(aggregate);
    (global as any).RecordTypesService = new RecordTypes.RecordTypes();
    (global as any).WorkflowStepsService = new WorkflowSteps.WorkflowSteps();
    const dashboards = new Dashboards.DashboardTypes();
    const brand = { id: 'brand1' } as any;
    const config = await dashboards.getRecordTypeDashboardConfig(brand, 'dataset');
    expect(config?.showAdminSideBar).to.equal(true);
    expect(config).not.to.have.property('showAdminSidebar');
    const table = await dashboards.getDashboardTableConfig(brand, 'dataset', 'draft');
    expect(table?.rowConfig.map(row => row.variable)).to.deep.equal(['metadata.other', 'metadata.title']);
    expect(
      table?.rowConfig.map(row => Handlebars.compile(row.template)({ metadata: { title: '<safe>', other: 'custom' } }))
    ).to.deep.equal(['<b>custom</b>', '&lt;safe&gt;']);
    const entries = await (dashboards as any).extractDashboardTableTemplates(['dataset', 'draft'], table);
    expect(entries).to.have.length(2);
    expect(entries[0].key).to.deep.equal(['dataset', 'draft', 'rowConfig', '0', 'metadata.other']);
  });

  for (const location of ['recordType', 'stage'] as const) {
    it(`renders literal numeric and object paths through the ${location} dashboard consumer`, async () => {
      seed();
      const paths = ['metadata.keywords.0', 'metadata.rows.0.1.title', 'metadata.0name', 'metadata.this', 'lookup'];
      const dashboard = {
        schemaVersion: 1,
        showAdminSidebar: false,
        columns: paths.map((path, displayOrder) => ({
          id: `column${displayOrder}`,
          title: path,
          displayOrder,
          value: { kind: 'path', path },
        })),
      };
      const aggregate = revisions[0].definition;
      if (location === 'recordType') aggregate.recordType.dashboard = dashboard;
      else aggregate.stages[0].dashboard = dashboard;
      revisions[0].canonicalHash = hashRecordDefinition(aggregate);
      await runtime.assertReady();
      (global as any).RecordTypesService = new RecordTypes.RecordTypes();
      (global as any).WorkflowStepsService = new WorkflowSteps.WorkflowSteps();
      const dashboards = new Dashboards.DashboardTypes();
      const table = await dashboards.getDashboardTableConfig({ id: 'brand1' } as any, 'dataset', 'draft');
      expect(table?.rowConfig.map(row => row.variable)).to.deep.equal(paths);
      const data = {
        metadata: {
          keywords: ['<img src=x onerror=alert(1)>'],
          rows: [[null, { title: 'A&B' }]],
          '0name': 'zero',
          this: 'literal',
        },
        lookup: 'property',
      };
      expect(
        table?.rowConfig.map(row => {
          expect(() => handlebarsPrecompile(row.template)).not.to.throw();
          return handlebarsCompile(row.template)(data);
        })
      ).to.deep.equal(['&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;', 'A&amp;B', 'zero', 'literal', 'property']);
      expect(await dashboards.extractDashboardTemplates({ id: 'brand1' } as any, 'dataset', 'draft')).to.have.length(
        paths.length
      );
    });
    for (const path of [
      'metadata..0',
      'metadata.keywords.',
      'metadata.__proto__.0',
      'metadata.constructor.name',
      'metadata.prototype.0',
      'metadata.[0]',
      'metadata.0}}',
      'lookup metadata 0',
      '@root.metadata.0',
      '../metadata.0',
    ]) {
      it(`fails readiness and projection for ${location} dashboard path ${path}`, async () => {
        seed();
        const dashboard = {
          schemaVersion: 1,
          showAdminSidebar: false,
          columns: [{ id: 'bad', title: 'Bad', displayOrder: 0, value: { kind: 'path', path } }],
        };
        if (location === 'recordType') revisions[0].definition.recordType.dashboard = dashboard;
        else revisions[0].definition.stages[0].dashboard = dashboard;
        expect(() => hashRecordDefinition(revisions[0].definition)).to.throw();
        await expectFailure(() => runtime.assertReady());
        await expectFailure(() => runtime.project(identities[0]));
      });
    }
  }

  it('keeps stage dashboard overrides paired with their brand and selected revision', async () => {
    seed();
    seed('brand2');
    for (const row of revisions) {
      row.definition.stages[0].dashboard = {
        schemaVersion: 1,
        showAdminSidebar: false,
        columns: [
          { id: 'title', title: row.branding, displayOrder: 0, value: { kind: 'path', path: 'metadata.title' } },
        ],
      };
      row.canonicalHash = hashRecordDefinition(row.definition);
    }
    const selected = await activeRecordDefinitions().project(identities[0]);
    seed('brand1', 2);
    const oldStages = await activeRecordDefinitions().stages(selected);
    expect((oldStages![0].config as any).dashboard.table.rowConfig[0].title).to.equal('brand1');
    const other = await activeRecordDefinitions().project(identities.find(row => row.branding === 'brand2'));
    expect(
      ((await activeRecordDefinitions().stages(other))![0].config as any).dashboard.table.rowConfig[0].title
    ).to.equal('brand2');
    const next = await activeRecordDefinitions().project(identities.find(row => row.branding === 'brand1'));
    expect(((await activeRecordDefinitions().stages(next))![0].config as any).dashboard).to.equal(undefined);
  });

  it('refuses unsupported JSONata dashboard values instead of silently rendering incompatible DTOs', async () => {
    seed();
    revisions[0].definition.recordType.dashboard = {
      schemaVersion: 1,
      showAdminSidebar: false,
      columns: [
        {
          id: 'computed',
          title: 'Computed',
          displayOrder: 0,
          value: { kind: 'jsonata', expression: 'metadata.title' },
        },
      ],
    };
    revisions[0].canonicalHash = hashRecordDefinition(revisions[0].definition);
    await expectFailure(() => runtime.project(identities[0]));
    await expectFailure(() => runtime.assertReady());
  });

  it('projects the active automatic graph into the existing strict runtime contract', async () => {
    seed();
    const source = revisions[0].definition;
    source.stages.push({
      ...source.stages[0],
      key: parseWorkflowStageKey('published'),
      starting: false,
      displayOrder: 1,
    });
    source.transitions = [
      {
        schemaVersion: 1,
        id: deriveWorkflowTransitionId({ brandId: 'brand1', recordTypeKey: 'dataset', stableKey: 'publish' }),
        sourceStageKey: 'draft',
        targetStageKey: 'published',
        label: 'Publish',
        mode: 'automatic',
        event: 'update',
        priority: 10,
        condition: 'true',
      },
    ];
    revisions[0].canonicalHash = hashRecordDefinition(source);
    const projected = await runtime.project(identities[0]);
    const plan = resolveAutomaticTransitionPlan(projected, 'dataset');
    expect(plan.transitions).to.have.length(1);
    expect(projected.automaticTransitions?.[0].targetStage).to.equal('published');
    expect(projected.automaticTransitions?.[0]).not.to.have.property('sourceStageKey');
  });

  it('evicts immutable revisions at the fixed capacity and invalidates only the selected brand', async () => {
    seed();
    seed('brand2');
    await runtime.resolve('brand1', 'dataset');
    await runtime.resolve('brand2', 'dataset');
    runtime.invalidate('brand1', 'dataset');
    const reads = (global as any).RecordDefinitionRevision.findOne.callCount;
    await runtime.resolve('brand2', 'dataset');
    expect((global as any).RecordDefinitionRevision.findOne.callCount).to.equal(reads);
    await runtime.resolve('brand1', 'dataset');
    expect((global as any).RecordDefinitionRevision.findOne.callCount).to.equal(reads + 1);
    for (let n = 2; n <= RECORD_DEFINITION_RUNTIME_CACHE_MAX + 2; n++) {
      seed('brand1', n);
      await runtime.resolve('brand1', 'dataset');
    }
    const previous = (global as any).RecordDefinitionRevision.findOne.callCount;
    await runtime.resolve('brand2', 'dataset');
    expect((global as any).RecordDefinitionRevision.findOne.callCount).to.equal(previous + 1);
  });

  it('does not let a late pre-publication read repopulate a stale active pointer', async () => {
    seed();
    let release!: () => void;
    let markReached!: () => void;
    const reached = new Promise<void>(resolve => {
      markReached = resolve;
    });
    const oldRow = structuredClone(revisions[0]);
    (global as any).RecordDefinitionRevision.findOne.onFirstCall().callsFake(() => ({
      exec: (cb: any) => {
        release = () => cb(null, oldRow);
        markReached();
      },
    }));
    const inFlight = runtime.resolve('brand1', 'dataset');
    await reached;
    seed('brand1', 2);
    expect((await runtime.resolve('brand1', 'dataset'))?.revision.revisionNumber).to.equal(2);
    runtime.invalidate('brand1', 'dataset');
    release();
    expect((await inFlight)?.revision.revisionNumber).to.equal(1);
    expect((await runtime.resolve('brand1', 'dataset'))?.revision.revisionNumber).to.equal(2);
  });

  it('refuses a datastore outage after warming the cache instead of serving a stale pointer', async () => {
    seed();
    await runtime.resolve('brand1', 'dataset');
    (global as any).RecordType.findOne.callsFake(() => ({ exec: (cb: any) => cb(new Error('Datastore unavailable')) }));
    await expectFailure(() => runtime.resolve('brand1', 'dataset'));
  });

  it('checks actual bindings even if the persisted action manifest omits them', async () => {
    seed();
    const scope = { context: 'record-lifecycle' as const, mode: 'onCreate' as const, phase: 'pre' as const };
    const actionId = parseActionDefinitionId('org.missing.action');
    revisions[0].definition.actionBindings = [
      {
        schemaVersion: 1,
        id: deriveStableActionBindingId({
          recordTypeKey: 'dataset',
          scope,
          actionId,
          contractVersion: 1,
          stableKey: 'missing',
        }),
        stableKey: 'missing',
        actionId,
        contractVersion: 1,
        scope,
        parameters: {},
        order: 0,
      },
    ];
    revisions[0].canonicalHash = hashRecordDefinition(revisions[0].definition);
    await expectFailure(() => runtime.assertReady());
  });

  for (const corrupt of ['brand', 'pointer', 'hash', 'draft', 'missing']) {
    it(`fails closed for ${corrupt} corruption without stale fallback`, async () => {
      seed();
      if (corrupt === 'brand')
        (global as any).RecordDefinitionRevision.findOne.callsFake(() =>
          query({ ...revisions[0], branding: 'brand2' })
        );
      if (corrupt === 'pointer') identities[0].activeRevisionId = 'wrong';
      if (corrupt === 'hash') revisions[0].definition.recordType.labels.name = 'tampered';
      if (corrupt === 'draft') revisions[0].definition.definitionState = 'draft-incomplete';
      if (corrupt === 'missing') revisions = [];
      await expectFailure(() => runtime.resolve('brand1', 'dataset'));
      await expectFailure(() => runtime.assertReady());
    });
  }

  it('fails readiness for active unavailable contracts but ignores drafts and historical revisions', async () => {
    seed();
    revisions[0].actionContracts = [{ actionId: 'org.missing.action', contractVersion: 1 }];
    await expectFailure(() => runtime.assertReady());
    seed('brand1', 2);
    await runtime.assertReady();
    identities.push({ id: 'draft-only', branding: 'brand2', name: 'dataset', draftId: 'missing-actions-draft' });
    await runtime.assertReady();
  });

  async function expectFailure(operation: () => Promise<any>) {
    let failure: any;
    try {
      await operation();
    } catch (error) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(Error);
  }
});
