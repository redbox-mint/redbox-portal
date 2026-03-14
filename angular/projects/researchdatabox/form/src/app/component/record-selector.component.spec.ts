import { TestBed } from '@angular/core/testing';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { RecordSelectorComponent } from './record-selector.component';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { RecordService } from '@researchdatabox/portal-ng-common';

describe('RecordSelectorComponent', () => {
  let recordService: jasmine.SpyObj<RecordService>;
  let translationService: any;

  beforeEach(async () => {
    recordService = jasmine.createSpyObj<RecordService>('RecordService', ['waitForInit', 'getRecords']);
    recordService.waitForInit.and.resolveTo(recordService);
    recordService.getRecords.and.resolveTo({
      records: [
        { oid: 'rec-1', title: 'Alpha record' },
        { oid: 'rec-2', title: 'Beta record' },
      ],
    });

    const testBed = await createTestbedModule({
      declarations: {
        RecordSelectorComponent,
      },
      providers: {
        RecordService: { provide: RecordService, useValue: recordService },
      },
    });

    translationService = testBed.translationService;
    translationService.translationMap = {
      'change-text': 'Change',
      'transfer-ownership-reset': 'Reset',
      'transfer-ownership-select': 'Select',
      'record-selector-no-record-selected': 'No record selected',
      'record-selector-search-label': 'Search records',
      'record-selector-search-hint': 'Enter part of a title, then choose a result below.',
      'record-selector-status-idle': 'Type to search records',
      'record-selector-status-loading': 'Loading records...',
      'record-selector-status-none': 'No records found',
      'record-selector-status-results': 'Records found',
      'record-selector-status-error': 'Unable to load records',
      'record-selector-results-heading': 'Choose a record ({{count}} found)',
      'record-selector-results-copy': 'Select the best match to attach it to this form.',
      'record-selector-option-meta': 'Click to select this record',
    };
    spyOn(translationService, 't').and.callFake((key: string, defaultOrOptions?: any, maybeOptions?: any) => {
      const raw = translationService.translationMap[key] ?? key;
      const options = maybeOptions ?? (defaultOrOptions && typeof defaultOrOptions === 'object' ? defaultOrOptions : undefined);
      if (!options || typeof raw !== 'string') {
        return raw;
      }
      return raw.replace(/\{\{(\w+)\}\}/g, (_match: string, token: string) => String(options[token] ?? ''));
    });
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(RecordSelectorComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('loads records and stores the selected record payload', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'related_record',
          component: {
            class: 'RecordSelectorComponent',
            config: {
              recordType: 'rdmp',
              workflowState: 'draft',
            },
          },
          model: {
            class: 'RecordSelectorModel',
            config: {
              value: null,
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('input') as HTMLInputElement;
    input.value = 'beta';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const buttons = compiled.querySelectorAll('.rb-record-selector-option') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(1);

    buttons[0].click();
    await fixture.whenStable();

    expect((formComponent as any).form.value.related_record).toEqual({ oid: 'rec-2', title: 'Beta record' });
  });

  it('collapses to the selected record with a change button after selection', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'related_record',
          component: {
            class: 'RecordSelectorComponent',
            config: {
              recordType: 'rdmp',
              workflowState: 'draft',
              filterMode: 'default',
            },
          },
          model: { class: 'RecordSelectorModel', config: { value: null } },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('input') as HTMLInputElement;
    input.value = 'beta';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const result = compiled.querySelectorAll('.rb-record-selector-option')[0] as HTMLButtonElement;
    result.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.textContent).toContain('Beta record');
    expect(compiled.textContent).toContain('Change');
    expect(compiled.querySelector('input')).toBeNull();
    expect(compiled.querySelectorAll('.rb-record-selector-option').length).toBe(0);

    const changeButton = Array.from(compiled.querySelectorAll('button')).find(button => button.textContent?.includes('Change')) as HTMLButtonElement;
    changeButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('input')).not.toBeNull();
  });

  it('starts empty until the user types a search term', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'related_record',
          component: {
            class: 'RecordSelectorComponent',
            config: {
              recordType: 'rdmp',
              workflowState: 'draft',
              filterMode: 'default',
            },
          },
          model: { class: 'RecordSelectorModel', config: { value: null } },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('.rb-record-selector-option').length).toBe(0);
    expect(compiled.textContent).toContain('Type to search records');
    expect(compiled.textContent).toContain('Enter part of a title, then choose a result below.');
    expect(recordService.getRecords).not.toHaveBeenCalled();
  });

  it('filters default mode results locally', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'related_record',
          component: {
            class: 'RecordSelectorComponent',
            config: {
              recordType: 'rdmp',
              workflowState: 'draft',
              filterMode: 'default',
            },
          },
          model: { class: 'RecordSelectorModel', config: { value: null } },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('input') as HTMLInputElement;
    input.value = 'beta';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const buttons = compiled.querySelectorAll('.rb-record-selector-option') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Beta record');
    expect(compiled.textContent).toContain('Choose a record (1 found)');
    expect(compiled.textContent).not.toContain('1 record(s) found');
    expect(recordService.getRecords).toHaveBeenCalledTimes(1);
  });

  it('normalises backend filtering modes to supported API values', async () => {
    recordService.getRecords.calls.reset();
    recordService.getRecords.and.resolveTo({
      records: [{ oid: 'rec-9', title: 'Filtered result' }],
    });

    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'related_record',
          component: {
            class: 'RecordSelectorComponent',
            config: {
              recordType: 'rdmp',
              workflowState: 'draft',
              filterMode: 'dblookup',
              filterFields: ['title'],
            },
          },
          model: { class: 'RecordSelectorModel', config: { value: null } },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('input') as HTMLInputElement;
    input.value = 'Filtered';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(recordService.getRecords).toHaveBeenCalledWith('rdmp', 'draft', 1, '', '', 'title', 'Filtered', 'regex');
    expect(compiled.textContent).toContain('Filtered result');
  });

  it('supports keyboard navigation and selection', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'related_record',
          component: {
            class: 'RecordSelectorComponent',
            config: {
              recordType: 'rdmp',
              workflowState: 'draft',
            },
          },
          model: { class: 'RecordSelectorModel', config: { value: null } },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'beta';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const results = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
    results.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();

    expect((formComponent as any).form.value.related_record).toEqual({ oid: 'rec-2', title: 'Beta record' });
  });

  it('renders the selected title in view mode', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'related_record',
          component: {
            class: 'RecordSelectorComponent',
            config: {
              recordType: 'rdmp',
              workflowState: 'draft',
            },
          },
          model: {
            class: 'RecordSelectorModel',
            config: {
              value: { oid: 'rec-1', title: 'Alpha record' },
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: false } as any);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Alpha record');
    expect(compiled.textContent).not.toContain('Record title');
    expect(compiled.querySelector('[role="listbox"]')).toBeNull();
  });
});
