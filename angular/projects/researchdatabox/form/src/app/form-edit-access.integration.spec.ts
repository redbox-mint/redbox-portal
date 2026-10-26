import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { RecordActionResult } from '@researchdatabox/portal-ng-common';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { SimpleInputComponent } from './component/simple-input.component';
import { SaveButtonComponent } from './component/save-button.component';
import { ValidationSummaryFieldComponent } from './component/validation-summary.component';

// Real native controls and save orchestration; RecordService is always mocked.
describe('Form edit access denial and retry', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: {
      SimpleInputComponent, SaveButtonComponent, ValidationSummaryFieldComponent,
    } });
  });

  for (const editLost of [false, true]) {
    it(`${editLost ? 'blocks retry after edit loss' : 'allows ordinary save after workflow denial'}`, async () => {
      const config: FormConfigFrame = {
        name: 'edit-access-retry', enabledValidationGroups: ['all'],
        componentDefinitions: [
          { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } },
            component: { class: 'SimpleInputComponent' } },
          { name: 'transition', component: { class: 'SaveButtonComponent', config: {
            label: 'Close record', targetStep: 'closed',
          } } },
          { name: 'save', component: { class: 'SaveButtonComponent', config: { label: 'Save draft' } } },
          { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
        ],
      };
      const { fixture, formComponent } = await createFormAndWaitForReady(config, {
        oid: 'fixture-edit-access', recordType: 'rdmp', editMode: true,
        formName: 'edit-access-retry', downloadAndCreateOnInit: false,
      });
      const update = spyOn(formComponent.recordService, 'update').and.resolveTo(
        RecordActionResult.fromResponse({ meta: {
          outcome: 'not-saved', oid: 'fixture-edit-access', problems: [{
            kind: 'authorization', phase: 'pre-save', issues: [{
              code: editLost ? 'record-validation-edit-unauthorized' : 'scu-rdmp-action-unauthorized',
              message: editLost ? 'Edit access was removed.' : 'You cannot close this record. You may still save a draft.',
            }],
          }],
        } }, 403, '44444444-4444-4444-8444-444444444444')
      );
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      input.value = 'Unsaved local title';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-save-button button')) as HTMLButtonElement[];
      expect(buttons.length).toBe(2);
      buttons[0].click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.calls.argsFor(0)[2]).toBe('closed');
      expect(formComponent.form?.get('title')?.value).toBe('Unsaved local title');
      expect(formComponent.conflictState()?.status ?? null).toBe(editLost ? 'permission-lost' : null);
      expect(formComponent.canRetryFormLevelServerErrors()).toBe(!editLost);
      if (!editLost) {
        expect(input.disabled).toBeFalse();
        expect(buttons[1].disabled).toBeFalse();
        expect(fixture.nativeElement.textContent).toContain('You cannot close this record.');
      }
      update.and.resolveTo(RecordActionResult.fromResponse({ meta: {
        outcome: 'saved', oid: 'fixture-edit-access', metadata: { title: 'Unsaved local title' },
      } }, 200, '55555555-5555-4555-8555-555555555555'));
      // Even a direct retry must stop at the form's authoritative conflict guard.
      if (editLost) await formComponent.saveForm();
      else {
        buttons[1].click();
        fixture.detectChanges();
        await fixture.whenStable();
      }
      expect(update).toHaveBeenCalledTimes(editLost ? 1 : 2);
      if (!editLost) {
        expect(update.calls.argsFor(1)[2]).toBe('');
        expect(update.calls.argsFor(1)[3]).toBeUndefined();
        expect(formComponent.saveResponse()?.wasPersisted()).toBeTrue();
        expect(formComponent.form?.errors).toBeNull();
      }
      TestBed.inject(HttpTestingController).expectNone(request => /recordmeta|api\/records\/metadata/.test(request.url));
    });
  }
});
