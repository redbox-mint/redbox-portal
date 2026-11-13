import { FormControl, FormGroup } from '@angular/forms';
import { GenerationCandidatePatch } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { GenerationPatchApplierService } from './generation-patch-applier.service';

function candidate(): GenerationCandidatePatch {
  return {
    runId: 'run-1', candidateDigest: 'candidate-digest', baseTargetDigest: 'base-digest',
    items: [
      {
        fieldId: 'summary', metadataPointer: '/plan/summary', value: 'Generated summary', operation: 'fill',
        valueHash: 'summary-hash', groundingState: 'sourceBacked', reviewRequired: false,
        rationale: 'Uses the activity.', evidence: [],
      },
      {
        fieldId: 'sharing', metadataPointer: '/plan/sharing', value: 'Generated sharing', operation: 'fill',
        valueHash: 'sharing-hash', groundingState: 'requiresReview', reviewRequired: true,
        rationale: 'Conservative fallback.', evidence: [],
      },
    ],
  };
}

describe('GenerationPatchApplierService', () => {
  let service: GenerationPatchApplierService;
  let form: FormGroup;
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;

  beforeEach(() => {
    service = new GenerationPatchApplierService();
    form = new FormGroup({
      plan: new FormGroup({
        summary: new FormControl(''),
        sharing: new FormControl('User changed sharing'),
      }),
    });
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['publish']);
  });

  it('applies unchanged snapshot fields and reports user-edit conflicts without overwriting them', () => {
    const result = service.apply(candidate(), form, {
      plan: { summary: '', sharing: 'Original sharing' },
    }, eventBus);

    expect(result).toEqual({ changedFieldIds: ['summary'], conflictFieldIds: ['sharing'] });
    expect(form.get('plan.summary')?.value).toBe('Generated summary');
    expect(form.get('plan.sharing')?.value).toBe('User changed sharing');
    expect(form.get('plan.summary')?.dirty).toBeTrue();
    expect(form.get('plan.summary')?.touched).toBeFalse();

    const events = eventBus.publish.calls.allArgs().map(([event]) => event);
    expect(events[0]).toEqual(jasmine.objectContaining({
      type: 'field.value.changed', fieldId: 'summary', origin: 'generation', correlationId: 'run-1',
      value: 'Generated summary', previousValue: '',
    }));
    expect(events[1]).toEqual(jasmine.objectContaining({
      type: 'generation.patch.applied', changedFieldIds: ['summary'], conflictFieldIds: ['sharing'],
      origin: 'generation', correlationId: 'run-1',
    }));
  });

  for (const existing of ['Original summary', false, 0, { selected: 'researcher choice' }, ['researcher choice']]) {
    it(`preserves non-empty fill targets that match the execution snapshot: ${JSON.stringify(existing)}`, () => {
      const target = new FormGroup({ summary: new FormControl<unknown>(structuredClone(existing)) });
      const patch = { ...candidate(), items: [{ ...candidate().items[0], metadataPointer: '/summary' }] };
      const result = service.apply(patch, target, { summary: structuredClone(existing) }, eventBus);

      expect(target.get('summary')?.value).toEqual(existing);
      expect(result).toEqual({ changedFieldIds: [], conflictFieldIds: ['summary'] });
      expect(eventBus.publish).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: 'field.value.changed' }));
    });
  }

  for (const empty of [null, undefined, '', [], {}]) {
    it(`fills an empty unchanged target: ${JSON.stringify(empty)}`, () => {
      const target = new FormGroup({ summary: new FormControl<unknown>(empty) });
      const baseline = { summary: target.getRawValue().summary };
      const patch = { ...candidate(), items: [{ ...candidate().items[0], metadataPointer: '/summary' }] };
      const result = service.apply(patch, target, baseline, eventBus);

      expect(target.get('summary')?.value).toBe('Generated summary');
      expect(result).toEqual({ changedFieldIds: ['summary'], conflictFieldIds: [] });
    });
  }

  it('does not fill a target cleared by the researcher after execution began', () => {
    const target = new FormGroup({ summary: new FormControl('') });
    const patch = { ...candidate(), items: [{ ...candidate().items[0], metadataPointer: '/summary' }] };
    const result = service.apply(patch, target, { summary: 'Removed by researcher' }, eventBus);

    expect(target.get('summary')?.value).toBe('');
    expect(result).toEqual({ changedFieldIds: [], conflictFieldIds: ['summary'] });
  });

  it('applies a canonical metadata pointer to its flat runtime form control', () => {
    const flatForm = new FormGroup({
      title: new FormControl<string | null>(null),
      'vivo:Dataset_dc_format': new FormControl<string | null>(null),
    });
    const flatCandidate: GenerationCandidatePatch = {
      runId: 'run-flat', candidateDigest: 'candidate-flat', baseTargetDigest: 'base-flat',
      items: [{
        fieldId: 'dataFormat',
        metadataPointer: '/vivo:Dataset_dc_format',
        value: 'CSV and GeoPackage',
        operation: 'fill',
        valueHash: 'format-hash',
        groundingState: 'sourceBacked',
        reviewRequired: false,
        rationale: 'Uses reviewed data types.',
        evidence: [],
      }],
    };

    const result = service.apply(flatCandidate, flatForm, {
      title: null,
      'vivo:Dataset_dc_format': null,
    }, eventBus);

    expect(result).toEqual({ changedFieldIds: ['dataFormat'], conflictFieldIds: [] });
    expect(flatForm.get('vivo:Dataset_dc_format')?.value).toBe('CSV and GeoPackage');
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'field.value.changed',
      fieldId: 'vivo:Dataset_dc_format',
      origin: 'generation',
      correlationId: 'run-flat',
    }));
  });

  it('copies completion values into flat contributor controls without overwriting edits made during generation', () => {
    const contributorForm = new FormGroup({
      contributor_ci: new FormControl({ text_full_name: 'Manually selected person' }),
      contributors: new FormControl<unknown[]>([]),
    });
    const emptyCandidate = { ...candidate(), items: [] };
    const copiedContributors = [{ text_full_name: 'Ethan McLeod', email: 'ethan@example.test' }];

    const result = service.apply(emptyCandidate, contributorForm, {
      contributor_ci: null,
      contributors: [],
    }, eventBus, [
      {
        metadataPointer: '/contributor_ci',
        value: { text_full_name: 'Amelia Hartwell' },
      },
      {
        metadataPointer: '/contributors',
        value: copiedContributors,
      },
    ]);

    expect(result).toEqual({ changedFieldIds: ['contributors'], conflictFieldIds: ['contributor_ci'] });
    expect(contributorForm.get('contributor_ci')?.value).toEqual({ text_full_name: 'Manually selected person' });
    expect(contributorForm.get('contributors')?.value).toEqual(copiedContributors);
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'field.value.changed',
      fieldId: 'contributors',
      origin: 'system',
      correlationId: 'run-1',
    }));
  });

  for (const segment of ['__proto__', 'constructor', 'prototype']) {
    it(`rejects ${segment} before applying nested initial values or modifying prototypes`, () => {
      const initialForm = new FormGroup({ group: new FormControl<Record<string, unknown>>({}) });
      const pollutionKey = 'redboxGenerationPrototypePollution';
      expect(Reflect.get(Object.prototype, pollutionKey)).toBeUndefined();
      try {
        service.applyInitialValues([
          { metadataPointer: `/group/${segment}/${pollutionKey}`, value: 'polluted' },
        ], initialForm, eventBus, 'unsafe-initial');

        expect(initialForm.get('group')?.value).toEqual({});
        expect(Reflect.get(Object.prototype, pollutionKey)).toBeUndefined();
        expect(eventBus.publish).not.toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(Object.prototype, pollutionKey);
      }
    });

    for (const origin of ['candidate', 'completion']) {
      it(`rejects ${segment} in ${origin} pointers without writing a matching leaf control`, () => {
        const target = new FormGroup({ summary: new FormControl('') });
        const pointer = `/group/${segment}/summary`;
        const patch = origin === 'candidate'
          ? { ...candidate(), items: [{ ...candidate().items[0], metadataPointer: pointer }] }
          : { ...candidate(), items: [] };
        const completionValues = origin === 'completion' ? [{ metadataPointer: pointer, value: 'Unsafe replacement' }] : [];

        const result = service.apply(patch, target, { summary: '' }, eventBus, completionValues);

        expect(target.get('summary')?.value).toBe('');
        expect(result.changedFieldIds).toEqual([]);
        expect(result.conflictFieldIds.length).toBe(1);
        expect(eventBus.publish).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: 'field.value.changed' }));
      });
    }
  }

  for (const origin of ['candidate', 'completion']) {
    it(`does not route a missing nested ${origin} target to an unrelated root leaf`, () => {
      const target = new FormGroup({ summary: new FormControl('') });
      const pointer = '/missingGroup/summary';
      const patch = origin === 'candidate'
        ? { ...candidate(), items: [{ ...candidate().items[0], metadataPointer: pointer }] }
        : { ...candidate(), items: [] };
      const completionValues = origin === 'completion' ? [{ metadataPointer: pointer, value: 'Misrouted replacement' }] : [];

      const result = service.apply(patch, target, { summary: '' }, eventBus, completionValues);

      expect(target.get('summary')?.value).toBe('');
      expect(result).toEqual({ changedFieldIds: [], conflictFieldIds: ['summary'] });
    });
  }

  it('applies server-provided initial values as system-originated changes', () => {
    const initialForm = new FormGroup({ title: new FormControl('') });

    service.applyInitialValues([
      { metadataPointer: '/title', value: 'Synthetic title' },
    ], initialForm, eventBus, 'runtime-1');

    expect(initialForm.get('title')?.value).toBe('Synthetic title');
    expect(initialForm.get('title')?.dirty).toBeTrue();
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'field.value.changed', fieldId: 'title', origin: 'system', correlationId: 'runtime-1',
    }));
  });

  it('applies a nested initial value through an object-valued RecordSelector control', () => {
    const initialForm = new FormGroup({
      activity: new FormControl<{ oid: string; title?: string } | null>({
        oid: '',
        title: 'Coastal resilience observatory',
      }),
    });

    service.applyInitialValues([
      { metadataPointer: '/activity/oid', value: 'bootstrap-activity-DEMO-A001' },
    ], initialForm, eventBus, 'runtime-activity');

    expect(initialForm.get('activity')?.value).toEqual({
      oid: 'bootstrap-activity-DEMO-A001',
      title: 'Coastal resilience observatory',
    });
    expect(initialForm.get('activity')?.dirty).toBeTrue();
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'field.value.changed',
      fieldId: 'activity',
      value: {
        oid: 'bootstrap-activity-DEMO-A001',
        title: 'Coastal resilience observatory',
      },
      previousValue: { oid: '', title: 'Coastal resilience observatory' },
      origin: 'system',
      correlationId: 'runtime-activity',
    }));
  });

  it('builds an object value when the RecordSelector control starts empty', () => {
    const initialForm = new FormGroup({
      activity: new FormControl<{ oid: string; title?: string } | null>(null),
    });

    service.applyInitialValues([
      { metadataPointer: '/activity/oid', value: 'bootstrap-activity-DEMO-A002' },
    ], initialForm, eventBus, 'runtime-empty-activity');

    expect(initialForm.get('activity')?.value).toEqual({ oid: 'bootstrap-activity-DEMO-A002' });
  });
});
