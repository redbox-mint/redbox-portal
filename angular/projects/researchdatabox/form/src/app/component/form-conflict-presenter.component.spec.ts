import { TestBed } from '@angular/core/testing';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import { createTestbedModule } from '../helpers.spec';
import { FormConflictState } from '../form-concurrency-state';
import { FormConflictReviewProjection } from '../form-conflict-review.service';
import { FormConflictPresenterComponent } from './form-conflict-presenter.component';

const conflict: FormConflictState = {
  requestId: '11111111-1111-4111-8111-111111111111',
  base: { contributors: [{ name: 'Base' }] },
  local: { contributors: [{ name: 'Mine' }] },
  latest: { contributors: [{ name: 'Latest' }] },
  status: 'reviewing',
  autoRetryAttempted: false,
};

const review: FormConflictReviewProjection = {
  requestId: conflict.requestId,
  items: [
    {
      id: 's-contributors',
      path: ['contributors'],
      label: 'Contributors',
      wholeValue: true,
      mine: { summary: '1 item', details: ['1. Name: Mine'] },
      latest: { summary: '1 item', details: ['1. Name: Latest'] },
    },
  ],
  candidateWithNonOverlappingChanges: { contributors: [{ name: 'Latest' }] },
  local: conflict.local,
  latest: conflict.latest!,
};

describe('FormConflictPresenterComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({});
  });

  it('renders an accessible persistent banner with generic actions only while unresolved', () => {
    const fixture = TestBed.createComponent(FormConflictPresenterComponent);
    fixture.detectChanges();
    const mountedBanner = fixture.nativeElement.querySelector('.rb-form-conflict') as HTMLElement;
    expect(mountedBanner).not.toBeNull();
    expect(mountedBanner.hidden).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();

    fixture.componentInstance.conflict = conflict;
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('.rb-form-conflict') as HTMLElement;
    expect(banner.hidden).toBeFalse();

    // The live region carries the notice only: interactive review controls must
    // stay outside it so assistive technology does not re-announce them.
    const notice = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(notice.getAttribute('aria-live')).toBe('assertive');
    expect(notice.textContent).toContain('Your edits are still available');
    expect(notice.querySelector('button')).toBeNull();

    expect(banner.textContent).toContain('Review changes');
    expect(banner.textContent).not.toContain('user');
    expect(banner.textContent).not.toContain('actor');
  });

  it('presents mine/latest for a whole repeatable and requires every choice before submit', () => {
    const fixture = TestBed.createComponent(FormConflictPresenterComponent);
    const component = fixture.componentInstance;
    component.conflict = conflict;
    component.review = review;
    component.ngOnChanges();
    const resolutionSpy = spyOn(component.resolutionRequested, 'emit');
    fixture.detectChanges();

    const fieldset = fixture.nativeElement.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fieldset.textContent).toContain('Contributors');
    expect(fieldset.textContent).toContain('Whole repeatable');
    expect(fieldset.textContent).toContain('Mine');
    expect(fieldset.textContent).toContain('Latest');
    expect(fieldset.textContent).toContain('Name: Mine');
    expect(fieldset.textContent).toContain('Name: Latest');

    const submit = fixture.nativeElement.querySelector('.rb-form-conflict-review__submit button') as HTMLButtonElement;
    expect(submit.disabled).toBeTrue();
    component.choose('s-contributors', 'mine');
    fixture.detectChanges();
    expect(submit.disabled).toBeFalse();
    submit.click();
    expect(resolutionSpy).toHaveBeenCalledOnceWith({ 's-contributors': 'mine' });
  });

  it('emits discard only after the shared confirmation dialog is accepted', async () => {
    const fixture = TestBed.createComponent(FormConflictPresenterComponent);
    const component = fixture.componentInstance;
    const confirmation = TestBed.inject(ConfirmationDialogService);
    component.conflict = conflict;
    const discardSpy = spyOn(component.discardRequested, 'emit');
    fixture.detectChanges();

    const firstAttempt = component.confirmDiscard();
    expect(confirmation.dialog()?.message).toContain('permanently discard');
    confirmation.resolve(false);
    await firstAttempt;
    expect(discardSpy).not.toHaveBeenCalled();

    const secondAttempt = component.confirmDiscard();
    confirmation.resolve(true);
    await secondAttempt;
    expect(discardSpy).toHaveBeenCalledTimes(1);
  });
});
