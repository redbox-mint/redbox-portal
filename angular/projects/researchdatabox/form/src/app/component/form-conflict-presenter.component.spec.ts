import { TestBed } from '@angular/core/testing';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import { createTestbedModule } from '../helpers.spec';
import { FormConflictState } from '../form-concurrency-state';
import { FormConflictReviewProjection } from '../form-conflict-review.service';
import { FormConflictPresenterComponent } from './form-conflict-presenter.component';

const conflict: FormConflictState = {
  requestId: '11111111-1111-4111-8111-111111111111',
  cause: 'record-stale',
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
    const { translationService } = await createTestbedModule({});
    Object.assign(translationService.translationMap, {
      '@form-conflict-stale-title': 'This record has changed',
      '@form-conflict-stale-message': 'Your edits are still available.',
      '@form-conflict-reviewing-title': 'Review concurrent changes',
      '@form-conflict-reviewing-message': 'Review each conflicting value.',
      '@form-conflict-old-tab-title': 'This tab needs the current form',
      '@form-conflict-old-tab-message': 'This older tab can compare values only.',
      '@form-conflict-form-changed-title': 'The form has changed',
      '@form-conflict-form-changed-message': 'Download a copy before loading the current form.',
      '@form-conflict-deleted-title': 'This record is no longer available for editing',
      '@form-conflict-deleted-message': 'Your edits were not saved.',
      '@form-conflict-permission-lost-title': 'Edit permission is no longer available',
      '@form-conflict-permission-lost-message': 'Your edits were not saved.',
      '@form-conflict-repeated-race-title': 'The record changed again',
      '@form-conflict-repeated-race-message': 'Review the new differences.',
      '@form-conflict-merging-title': 'Merging your changes',
      '@form-conflict-merging-message': 'Your edits are being saved.',
      '@form-conflict-already-current-title': 'Your changes are already current',
      '@form-conflict-already-current-message': 'No additional save was needed.',
      '@form-conflict-review-action': 'Review changes',
      '@form-conflict-discard-action': 'Reload latest and discard mine',
      '@form-conflict-export-action': 'Download my edits',
      '@form-conflict-load-current-form-action': 'Load current form',
      '@form-conflict-review-heading': 'Review changes',
      '@form-conflict-review-instructions': 'Choose which value to keep.',
      '@form-conflict-review-only': 'These values are for comparison only.',
      '@form-conflict-whole-repeatable': 'Whole repeatable',
      '@form-conflict-whole-repeatable-help': 'Resolve this list as one value.',
      '@form-conflict-mine': 'Mine',
      '@form-conflict-latest': 'Latest',
      '@form-conflict-save-resolution': 'Save resolved changes',
      '@form-conflict-saving-resolution': 'Saving resolution…',
      '@form-conflict-choices-required': 'Choose every value.',
    });
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
    expect(notice.textContent).toContain('Review each conflicting value');
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
    component.mergeAllowed = true;
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

  it('keeps repeatable detail lists outside radio labels and links them as unique descriptions', () => {
    const firstFixture = TestBed.createComponent(FormConflictPresenterComponent);
    firstFixture.componentInstance.conflict = conflict;
    firstFixture.componentInstance.review = review;
    firstFixture.componentInstance.mergeAllowed = true;
    firstFixture.componentInstance.ngOnChanges();
    firstFixture.detectChanges();

    const radios = Array.from(
      (firstFixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
        '.rb-form-conflict-review input[type="radio"]'
      )
    );
    expect(radios).toHaveSize(2);
    expect(radios[0].name).toBe(radios[1].name);
    for (const radio of radios) {
      const label = radio.closest('label') as HTMLLabelElement;
      expect(label).not.toBeNull();
      expect(label.querySelector('ul')).toBeNull();
      expect(label.textContent).toContain(radio === radios[0] ? 'Mine' : 'Latest');
      const describedBy = (radio.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      expect(describedBy.length).toBeGreaterThan(0);
      for (const id of describedBy) {
        const description = firstFixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
        expect(description).not.toBeNull();
        expect(label.contains(description)).toBeFalse();
      }
    }

    const secondFixture = TestBed.createComponent(FormConflictPresenterComponent);
    secondFixture.componentInstance.conflict = conflict;
    secondFixture.componentInstance.review = review;
    secondFixture.detectChanges();
    const secondRadio = secondFixture.nativeElement.querySelector(
      '.rb-form-conflict-review input[type="radio"]'
    ) as HTMLInputElement;
    expect(secondRadio.name).not.toBe(radios[0].name);
  });

  it('emits discard only after the shared confirmation dialog is accepted', async () => {
    const fixture = TestBed.createComponent(FormConflictPresenterComponent);
    const component = fixture.componentInstance;
    const confirmation = TestBed.inject(ConfirmationDialogService);
    component.conflict = conflict;
    component.mergeAllowed = true;
    const discardSpy = spyOn(component.discardRequested, 'emit');
    fixture.detectChanges();

    const firstAttempt = component.confirmDiscard();
    expect(confirmation.dialog()?.message).toBe('@form-conflict-discard-warning-message');
    confirmation.resolve(false);
    await firstAttempt;
    expect(discardSpy).not.toHaveBeenCalled();

    const secondAttempt = component.confirmDiscard();
    confirmation.resolve(true);
    await secondAttempt;
    expect(discardSpy).toHaveBeenCalledTimes(1);
  });

  it('renders translated review-only, drift, deleted, permission, retry, and already-current states safely', () => {
    const fixture = TestBed.createComponent(FormConflictPresenterComponent);
    const component = fixture.componentInstance;

    component.conflict = { ...conflict, cause: 'precondition-required' };
    component.review = review;
    component.ngOnChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This tab needs the current form');
    expect(fixture.nativeElement.textContent).toContain('comparison only');
    expect(fixture.nativeElement.querySelector('.rb-form-conflict-review__submit')).toBeNull();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.rb-form-conflict-review input')).every(
        input => (input as HTMLInputElement).disabled
      )
    ).toBeTrue();

    for (const variant of [
      { cause: 'form-changed' as const, status: 'form-changed' as const, title: 'The form has changed' },
      { cause: 'deleted' as const, status: 'deleted' as const, title: 'no longer available for editing' },
      { cause: 'permission-lost' as const, status: 'permission-lost' as const, title: 'permission is no longer' },
      { cause: 'record-stale' as const, status: 'retrying' as const, title: 'Merging your changes' },
    ]) {
      component.conflict = { ...conflict, cause: variant.cause, status: variant.status, latest: null };
      component.review = null;
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(variant.title);
      expect(fixture.nativeElement.textContent).not.toContain('Latest');
    }

    component.conflict = null;
    component.resolution = 'already-current';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('already current');
  });

  it('confirms loading the current form without treating review-only values as a merge', async () => {
    const fixture = TestBed.createComponent(FormConflictPresenterComponent);
    const component = fixture.componentInstance;
    const confirmation = TestBed.inject(ConfirmationDialogService);
    component.conflict = { ...conflict, cause: 'precondition-required' };
    component.review = review;
    const reloadSpy = spyOn(component.reloadRequested, 'emit');
    fixture.detectChanges();

    const attempt = component.confirmReload();
    expect(confirmation.dialog()?.message).toBe('@form-conflict-reload-warning-message');
    confirmation.resolve(true);
    await attempt;

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(component.canSubmitResolution).toBeFalse();
  });

  it('offers a current-form reload when a stale response is reviewable but not safe to merge', () => {
    const fixture = TestBed.createComponent(FormConflictPresenterComponent);
    const component = fixture.componentInstance;
    component.conflict = conflict;
    component.review = review;
    component.mergeAllowed = false;
    fixture.detectChanges();

    expect(component.canReview).toBeTrue();
    expect(component.canSubmitResolution).toBeFalse();
    expect(component.canReloadForm).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Load current form');
  });
});
