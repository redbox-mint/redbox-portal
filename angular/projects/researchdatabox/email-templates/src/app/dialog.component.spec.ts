import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogComponent } from './dialog.component';

@Component({
  standalone: true,
  imports: [DialogComponent],
  template: `
    <button id="opener" (click)="open = true">Open</button>
    <email-templates-dialog
      [open]="open"
      heading="Publish?"
      closeLabel="Close"
      (dismissed)="dismissals = dismissals + 1; open = false"
    >
      <p>Body text</p>
      <ng-container dialog-footer>
        <button id="cancel">Cancel</button>
        <button id="confirm" data-autofocus>Confirm</button>
      </ng-container>
    </email-templates-dialog>
  `,
})
class HostComponent {
  open = false;
  dismissals = 0;
}

describe('DialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const dialog = (): HTMLDialogElement => fixture.nativeElement.querySelector('dialog');

  it('opens modally with a labelled heading and focuses the marked control', () => {
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    expect(dialog().open).toBeTrue();
    expect(dialog().matches(':modal')).toBeTrue();
    const heading = dialog().querySelector(`#${dialog().getAttribute('aria-labelledby')}`);
    expect(heading?.textContent).toBe('Publish?');
    expect(document.activeElement?.id).toBe('confirm');
  });

  it('turns Escape into a dismiss request and returns focus to the opener', async () => {
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBeTrue();
    expect(host.dismissals).toBe(1);
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    expect(dialog().open).toBeFalse();
    expect(document.activeElement).toBe(opener);
  });

  it('dismisses from the close button', () => {
    host.open = true;
    fixture.detectChanges();
    (dialog().querySelector('.btn-close') as HTMLButtonElement).click();
    expect(host.dismissals).toBe(1);
    expect((dialog().querySelector('.btn-close') as HTMLElement).getAttribute('aria-label')).toBe('Close');
  });
});
