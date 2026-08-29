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
        summary: new FormControl('Original summary'),
        sharing: new FormControl('User changed sharing'),
      }),
    });
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['publish']);
  });

  it('applies unchanged snapshot fields and reports user-edit conflicts without overwriting them', () => {
    const result = service.apply(candidate(), form, {
      plan: { summary: 'Original summary', sharing: 'Original sharing' },
    }, eventBus);

    expect(result).toEqual({ changedFieldIds: ['summary'], conflictFieldIds: ['sharing'] });
    expect(form.get('plan.summary')?.value).toBe('Generated summary');
    expect(form.get('plan.sharing')?.value).toBe('User changed sharing');
    expect(form.get('plan.summary')?.dirty).toBeTrue();
    expect(form.get('plan.summary')?.touched).toBeFalse();

    const events = eventBus.publish.calls.allArgs().map(([event]) => event);
    expect(events[0]).toEqual(jasmine.objectContaining({
      type: 'field.value.changed', fieldId: 'summary', origin: 'generation', correlationId: 'run-1',
      value: 'Generated summary', previousValue: 'Original summary',
    }));
    expect(events[1]).toEqual(jasmine.objectContaining({
      type: 'generation.patch.applied', changedFieldIds: ['summary'], conflictFieldIds: ['sharing'],
      origin: 'generation', correlationId: 'run-1',
    }));
  });

  it('applies a configuration-path target to its flat runtime form control', () => {
    const flatForm = new FormGroup({
      title: new FormControl<string | null>(null),
      'vivo:Dataset_dc_format': new FormControl<string | null>(null),
    });
    const flatCandidate: GenerationCandidatePatch = {
      runId: 'run-flat', candidateDigest: 'candidate-flat', baseTargetDigest: 'base-flat',
      items: [{
        fieldId: 'dataFormat',
        metadataPointer: '/mainTab/dataCollection/vivo:Dataset_dc_format',
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
