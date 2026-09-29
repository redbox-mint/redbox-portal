import { TestBed } from '@angular/core/testing';
import { FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { FormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { createTestbedModule } from './helpers.spec';
import { FormConflictState } from './form-concurrency-state';
import { FormConflictReviewService } from './form-conflict-review.service';

function entry(
  name: string,
  label: string,
  options?: Array<{ label: string; value: unknown }>,
  dataModel: Array<string | number> = [name]
): FormFieldCompMapEntry {
  return {
    compConfigJson: {
      name,
      component: { class: 'SimpleInputComponent', config: options ? { options } : {} },
      layout: { class: 'DefaultLayout', config: { label } },
    } as unknown as FormComponentDefinitionFrame,
    lineagePaths: {
      formConfig: ['componentDefinitions', name],
      dataModel,
      angularComponents: [name],
      layout: [`${name}-layout`],
    },
  };
}

function conflict(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  latest: Record<string, unknown>
): FormConflictState {
  return {
    requestId: '11111111-1111-4111-8111-111111111111',
    cause: 'record-stale',
    base,
    local,
    latest,
    status: 'reviewing',
    autoRetryAttempted: false,
  };
}

describe('FormConflictReviewService', () => {
  let service: FormConflictReviewService;

  beforeEach(async () => {
    await createTestbedModule({});
    service = TestBed.inject(FormConflictReviewService);
  });

  it('maps current labels and configured option renderers while retaining non-overlapping local changes', () => {
    const base = {
      status: 'draft',
      summary: 'Base summary',
      notes: 'Base notes',
      remoteOnly: 'Base remote',
    };
    const local = {
      status: 'active',
      summary: 'My summary',
      notes: 'My notes',
      remoteOnly: 'Base remote',
    };
    const latest = {
      status: 'archived',
      summary: 'Latest summary',
      notes: 'Base notes',
      remoteOnly: 'Latest remote',
    };
    const projection = service.project(conflict(base, local, latest), local, [
      entry('status', 'Record status', [
        { label: 'Draft', value: 'draft' },
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ]),
      entry('summary', 'Project summary'),
    ]);

    expect(projection).not.toBeNull();
    expect(projection?.items.map(item => item.id)).toEqual(['["status"]', '["summary"]']);
    expect(projection?.items).toEqual([
      jasmine.objectContaining({
        label: 'Record status',
        wholeValue: false,
        mine: { summary: 'Active', details: [] },
        latest: { summary: 'Archived', details: [] },
      }),
      jasmine.objectContaining({
        label: 'Project summary',
        wholeValue: false,
        mine: { summary: 'My summary', details: [] },
        latest: { summary: 'Latest summary', details: [] },
      }),
    ]);
    expect(projection?.candidateWithNonOverlappingChanges).toEqual({
      status: 'archived',
      summary: 'Latest summary',
      notes: 'My notes',
      remoteOnly: 'Latest remote',
    });

    const statusId = projection!.items[0].id;
    const summaryId = projection!.items[1].id;
    expect(service.resolve(projection!, { [statusId]: 'mine', [summaryId]: 'latest' })).toEqual({
      status: 'active',
      summary: 'Latest summary',
      notes: 'My notes',
      remoteOnly: 'Latest remote',
    });
    expect(service.resolve(projection!, { [statusId]: 'latest', [summaryId]: 'mine' })).toEqual({
      status: 'archived',
      summary: 'My summary',
      notes: 'My notes',
      remoteOnly: 'Latest remote',
    });
  });

  it('projects repeatable divergence as one labelled whole-value choice', () => {
    const base = { contributors: [{ name: 'Base', role: 'owner' }] };
    const local = { contributors: [{ name: 'Mine', role: 'owner' }] };
    const latest = { contributors: [{ name: 'Base', role: 'contact' }] };
    const projection = service.project(conflict(base, local, latest), local, [
      entry('contributors', 'Contributors'),
      entry('name', 'Contributor name', undefined, ['contributors', '0', 'name']),
      entry(
        'role',
        'Contribution role',
        [
          { label: 'Lead investigator', value: 'owner' },
          { label: 'Primary contact', value: 'contact' },
        ],
        ['contributors', '0', 'role']
      ),
    ]);

    expect(projection?.items).toHaveSize(1);
    expect(projection?.items[0]).toEqual(
      jasmine.objectContaining({
        path: ['contributors'],
        label: 'Contributors',
        wholeValue: true,
      })
    );
    expect(projection?.items[0].mine.summary).toBe('1 item');
    expect(projection?.items[0].mine.details).toEqual([
      '1. Contributor name: Mine; Contribution role: Lead investigator',
    ]);
    expect(projection?.items[0].latest.details).toEqual([
      '1. Contributor name: Base; Contribution role: Primary contact',
    ]);

    const itemId = projection!.items[0].id;
    expect(service.resolve(projection!, { [itemId]: 'mine' })).toEqual(local);
    expect(service.resolve(projection!, { [itemId]: 'latest' })).toEqual(latest);
  });

  it('distinguishes a removed value from an explicitly empty latest value', () => {
    const base = { title: 'Base' };
    const local = {};
    const latest = { title: '' };
    const projection = service.project(conflict(base, local, latest), local, [entry('title', 'Title')]);

    expect(projection?.items[0].mine.summary).toBe('Not present');
    expect(projection?.items[0].latest.summary).toBe('Empty text');
  });

  it('fails closed for missing, unknown, or stale review choices', () => {
    const base = { title: 'Base' };
    const local = { title: 'Mine' };
    const latest = { title: 'Latest' };
    const projection = service.project(conflict(base, local, latest), local, [entry('title', 'Title')]);

    expect(service.resolve(projection!, {})).toBeNull();
    expect(service.resolve(projection!, { unknown: 'mine' })).toBeNull();
  });
});
