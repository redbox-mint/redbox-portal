import { TestBed } from '@angular/core/testing';
import { FormValidatorComponentErrors } from '@researchdatabox/sails-ng-common';
import { createTestbedModule } from '../helpers.spec';
import { FieldErrorSummaryComponent } from './field-error-summary.component';

describe('FieldErrorSummaryComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({});
  });

  function buildErrors(): FormValidatorComponentErrors[] {
    return [
      { class: 'required', message: '@validator-error-required', params: { required: true } },
      { class: 'maxlength', message: '@validator-error-maxlength', params: { requiredLength: 5 } },
      { class: 'pattern', message: '@validator-error-pattern', params: { pattern: '[0-9]+' } },
    ];
  }

  it('should create component', () => {
    const fixture = TestBed.createComponent(FieldErrorSummaryComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('should show nothing when no errors', () => {
    const fixture = TestBed.createComponent(FieldErrorSummaryComponent);
    fixture.componentInstance.errors = [];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rb-form-field-error-summary')).toBeNull();
  });

  it('should render primary error only by default with +N more toggle', () => {
    const fixture = TestBed.createComponent(FieldErrorSummaryComponent);
    fixture.componentInstance.fieldName = 'project_name';
    fixture.componentInstance.errors = buildErrors();
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector('.rb-form-field-error-summary');
    const listItems = fixture.nativeElement.querySelectorAll('.rb-form-field-error-panel__item');
    const toggle = fixture.nativeElement.querySelector('.rb-form-field-error-toggle');

    expect(summary).toBeTruthy();
    expect(listItems.length).toBe(0);
    expect(toggle).toBeTruthy();
  });

  it('should expand and collapse via click', () => {
    const fixture = TestBed.createComponent(FieldErrorSummaryComponent);
    fixture.componentInstance.errors = buildErrors();
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector('.rb-form-field-error-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.rb-form-field-error-panel__item').length).toBe(3);

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-field-error-panel')).toBeNull();
  });

  it('should expand and collapse via keyboard', () => {
    const fixture = TestBed.createComponent(FieldErrorSummaryComponent);
    fixture.componentInstance.errors = buildErrors();
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector('.rb-form-field-error-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-field-error-panel')).toBeTruthy();

    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-field-error-panel')).toBeNull();
  });

  it('should wire aria attributes', () => {
    const fixture = TestBed.createComponent(FieldErrorSummaryComponent);
    fixture.componentInstance.fieldName = 'project_name';
    fixture.componentInstance.errors = buildErrors();
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector('.rb-form-field-error-summary') as HTMLElement;
    const toggle = fixture.nativeElement.querySelector('.rb-form-field-error-toggle') as HTMLButtonElement;
    const controlsId = toggle.getAttribute('aria-controls');

    expect(summary.id).toMatch(/^project_name-\d+-error-summary$/);
    expect(controlsId).toMatch(/^project_name-\d+-error-details$/);
    expect(controlsId).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.hasAttribute('aria-label')).toBeTrue();

    toggle.click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.rb-form-field-error-panel') as HTMLElement;
    expect(panel.id).toBe(controlsId as string);
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.hasAttribute('aria-label')).toBeTrue();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
