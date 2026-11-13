import { Component, NO_ERRORS_SCHEMA, Pipe, PipeTransform, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { Store } from '@ngrx/store';
import { FormRuntimeAction } from '@researchdatabox/sails-ng-common';
import { of } from 'rxjs';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FormRuntimeActionsComponent } from './form-runtime-actions.component';
import { generationInitialState } from './state/generation.state';

@Pipe({ name: 'i18next', standalone: false })
class TranslationPipe implements PipeTransform {
  transform(value: string): string { return value; }
}

// Exercise the production shell template with the real action component while
// unrelated shell components remain outside this focused integration boundary.
@Component({ templateUrl: '../form.component.html', standalone: false })
class FormShell {
  runtimeActions: FormRuntimeAction[] = [];
  readonly conflictState = signal(null);
  readonly conflictReview = signal(null);
  readonly manualConflictResolutionPending = signal(false);
  readonly manualConflictMergeAllowed = false;
  readonly saveResponse = signal<{ concurrency?: { resolution?: string } } | null>(null);
  readonly componentsLoaded = signal(true);
  readonly error = signal<string | null>(null);
  readonly debugState = { isDebugEnabled: signal(false) };
  readonly componentDefArr: unknown[] = [];
  readonly trimmedParams = {
    oid: signal('source-1'), branding: signal('default'), portal: signal('rdmp'),
    recordType: signal('activity'), formName: signal('view'),
  };
  readonly viewAuditRoles = signal<string[]>([]);
  readonly generationSession = null;
  readonly generationLaunches = [];
  readonly form = new FormGroup({});
  reviewConflictChanges(): void {}
  discardConflictChanges(): void {}
  exportConflictLocalValues(): void {}
  reloadCurrentFormAfterConflict(): void {}
  submitManualConflictResolution(_event: unknown): void {}
}

describe('Form shell runtime actions', () => {
  const action: FormRuntimeAction = {
    id: 'draft-rdmp', kind: 'generation.launch', bindingKey: 'rdmp-from-activity',
    labelKey: 'Draft RDMP', sourceOid: 'source-1', order: 10,
  };

  it('renders a server-authorized source action in the production form shell and publishes its invocation', async () => {
    const eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['publish']);
    const store = jasmine.createSpyObj<Store>('Store', ['selectSignal', 'select']);
    store.selectSignal.and.returnValue(signal(false));
    store.select.and.returnValue(of(generationInitialState));
    await TestBed.configureTestingModule({
      declarations: [FormShell, FormRuntimeActionsComponent, TranslationPipe],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: FormComponentEventBus, useValue: eventBus },
        { provide: Store, useValue: store },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FormShell);
    fixture.componentInstance.runtimeActions = [action];
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const button = host.querySelector<HTMLButtonElement>('.rb-runtime-actions__button');

    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Draft RDMP');
    button?.click();
    expect(eventBus.publish).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      type: 'form.runtime-action.invoked', action, origin: 'user',
    }));
    fixture.destroy();
  });
});
