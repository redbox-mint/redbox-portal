import { TestBed } from '@angular/core/testing';
import { FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { EMPTY } from 'rxjs';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentFocusRequestCoordinator } from './form-component-focus-request-coordinator.service';

describe('FormComponentFocusRequestCoordinator checkbox detail focus', () => {
  it('resolves the selected option lineage when detail names repeat across rows', () => {
    TestBed.configureTestingModule({ providers: [
      FormComponentFocusRequestCoordinator,
      { provide: LoggerService, useValue: { warn: jasmine.createSpy('warn') } },
      { provide: FormComponentEventBus, useValue: { select$: () => EMPTY } },
    ] });
    const coordinator = TestBed.inject(FormComponentFocusRequestCoordinator);
    const input = document.createElement('input');
    document.body.appendChild(input);
    const parent = ['sections', 'formats', 'digitalFormatEstimates'];
    const otherPath = [...parent, 'option:other', 'volume'];
    const firstFocus = jasmine.createSpy('firstFocus').and.returnValue(true);
    const otherFocus = jasmine.createSpy('otherFocus').and.callFake(() => { input.focus(); return true; });
    const details = [
      { compConfigJson: { name: 'volume' }, lineagePaths: { angularComponents: [...parent, 'option:tabulated', 'volume'] }, component: { requestFocus: firstFocus } },
      { compConfigJson: { name: 'volume' }, lineagePaths: { angularComponents: otherPath }, component: { requestFocus: otherFocus } },
    ];
    const entries = [{ compConfigJson: { name: 'sections' }, component: { formFieldCompMapEntries: [
      { compConfigJson: { name: 'formats' }, component: { formFieldCompMapEntries: [
        { compConfigJson: { name: 'digitalFormatEstimates' }, component: { formFieldCompMapEntries: details } },
      ] } },
    ] } }] as unknown as FormFieldCompMapEntry[];
    try {
      (coordinator as any).formComponent = { componentDefArr: entries };
      expect((coordinator as any).tryFocus({ lineagePath: otherPath })).toBeTrue();
      expect(firstFocus).not.toHaveBeenCalled();
      expect(otherFocus).toHaveBeenCalled();
      expect(document.activeElement).toBe(input);
    } finally {
      input.remove();
      coordinator.destroy();
    }
  });
});
