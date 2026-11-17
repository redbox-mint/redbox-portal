import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import type { EmailSchemaTarget } from '@researchdatabox/sails-ng-common';
import { TranslationStub } from './email-templates.testing';
import { SchemaTargetComponent } from './schema-target.component';

describe('SchemaTargetComponent', () => {
  let fixture: ComponentFixture<SchemaTargetComponent>;
  let chosen: unknown[];
  const targets: EmailSchemaTarget[] = [
    {
      id: 'rdmp',
      label: 'RDMP',
      stages: [
        { id: 'draft', label: 'Draft', starting: true },
        { id: 'published', label: 'Published', starting: false },
      ],
    },
    { id: 'dataRecord', label: 'Data record', stages: [{ id: 'review', label: 'Review', starting: false }] },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemaTargetComponent],
      providers: [{ provide: TranslationService, useClass: TranslationStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(SchemaTargetComponent);
    chosen = [];
    fixture.componentInstance.choose.subscribe(value => chosen.push(value));
    fixture.componentRef.setInput('targets', targets);
    fixture.componentRef.setInput('selection', { recordType: 'rdmp', stage: 'published' });
    fixture.detectChanges();
  });

  const select = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLSelectElement;
  const status = () => (fixture.nativeElement.querySelector('#et-schema-status') as HTMLElement).textContent!.trim();

  it("shows the selection and emits a type change with that type's starting stage", () => {
    expect(select('et-schema-type').value).toBe('rdmp');
    expect(select('et-schema-stage').value).toBe('published');
    select('et-schema-type').value = 'dataRecord';
    select('et-schema-type').dispatchEvent(new Event('change'));
    select('et-schema-stage').value = 'draft';
    select('et-schema-stage').dispatchEvent(new Event('change'));
    expect(chosen).toEqual([
      { recordType: 'dataRecord', stage: 'review' },
      { recordType: 'rdmp', stage: 'draft' },
    ]);
  });

  it('shows integration precision and hides record selectors even when types were supplied', () => {
    fixture.componentRef.setInput('schema', { recordType: '', stage: '', precision: 'integration', schema: {} });
    fixture.detectChanges();
    expect(select('et-schema-type')).toBeNull();
    expect(select('et-schema-stage')).toBeNull();
    expect(status()).toContain('email-templates-schema-precision-integration');
  });

  it('states schema precision quietly', () => {
    fixture.componentRef.setInput('schema', {
      recordType: 'rdmp',
      stage: 'published',
      precision: 'record-schema',
      schema: {},
    });
    fixture.detectChanges();
    expect(status()).toContain('email-templates-schema-precision-record-schema type=RDMP stage=Published');
    fixture.componentRef.setInput('schema', {
      recordType: 'rdmp',
      stage: 'published',
      precision: 'form-config',
      schema: {},
    });
    fixture.detectChanges();
    expect(status()).toContain('email-templates-schema-precision-form-config type=RDMP');
    fixture.componentRef.setInput('schema', { recordType: 'rdmp', stage: 'published', precision: 'none', schema: {} });
    fixture.detectChanges();
    expect(status()).toContain('email-templates-schema-precision-none');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(status()).toContain('email-templates-schema-loading');
  });

  it('reports errors and missing record types, and disables while busy', () => {
    fixture.componentRef.setInput('error', true);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(status()).toContain('email-templates-schema-error');
    expect(select('et-schema-type').disabled).toBeTrue();
    fixture.componentRef.setInput('error', false);
    fixture.componentRef.setInput('targets', []);
    fixture.detectChanges();
    expect(select('et-schema-type')).toBeNull();
    expect(status()).toContain('email-templates-schema-no-types');
  });
});
