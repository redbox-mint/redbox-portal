import { of } from 'rxjs';
import { InteractivityChecker } from '@angular/cdk/a11y';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminSidePanelComponent } from './admin-side-panel.component';
import { TranslationService } from './translation.service';

@Component({
  imports: [AdminSidePanelComponent],
  template: `
    <rb-admin-side-panel title="Columns" [busy]="busy" (closed)="closed()">
      @if (withContent) {
        <button class="panel-content">Edit column</button>
      }
      <div panelFooter>
        @if (withContent) {
          <button class="panel-footer">Apply</button>
        }
      </div>
    </rb-admin-side-panel>
  `,
})
class SidePanelHostComponent {
  busy = false;
  withContent = false;
  closed = jasmine.createSpy('closed');
}

function expectTabbable(control: HTMLElement): string {
  const checker = TestBed.inject(InteractivityChecker);
  const frame = window.frameElement as HTMLElement | null;
  const context = JSON.stringify({
    control: control.outerHTML,
    focusable: checker.isFocusable(control),
    tabIndex: control.tabIndex,
    inertAncestor: control.closest('[inert]')?.tagName,
    frame: frame?.outerHTML,
    frameWidth: frame?.offsetWidth,
    frameHeight: frame?.offsetHeight,
    frameVisible: frame && checker.isVisible(frame),
    documentFocused: document.hasFocus(),
  });
  expect(checker.isTabbable(control)).withContext(context).toBeTrue();
  return context;
}

function expectFocusWrap(anchor: HTMLElement, control: HTMLElement): void {
  const focused = jasmine.createSpy('sentinel focus');
  anchor.addEventListener('focus', focused, { once: true });
  anchor.focus();
  const active = document.activeElement;
  expect(focused).toHaveBeenCalledTimes(1);
  expect(active).withContext(expectTabbable(control)).toBe(control);
}

describe('Admin offcanvas focus management', () => {
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidePanelHostComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: { t: (key: string) => key, translationChanges$: of(undefined), isInitializing: () => false },
        },
      ],
    }).compileComponents();
    window.focus();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(document.hasFocus()).toBeTrue();
    trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
  });

  afterEach(() => trigger.remove());

  it('labels its modal, captures focus, excludes the background and restores the trigger', async () => {
    // Render the real host element so the panel's host-scoped styles apply.
    const fixture = TestBed.createComponent(SidePanelHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    // Zone stability does not include the browser's native focus/render cycle.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Columns');
    expect(dialog.textContent).toContain('Columns');
    expect(trigger.inert).toBeTrue();
    const close = dialog.querySelector('button')!;
    expect(document.activeElement).toBe(close);
    const anchors: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.cdk-focus-trap-anchor');
    expect(anchors.length).toBe(2);
    for (const anchor of Array.from(anchors)) {
      expectFocusWrap(anchor, close);
    }
    const closed = fixture.componentInstance.closed;
    fixture.componentInstance.busy = true;
    fixture.detectChanges();
    expect(close.disabled).toBeTrue();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).not.toHaveBeenCalled();
    fixture.componentInstance.busy = false;
    fixture.detectChanges();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalled();
    fixture.destroy();
    await new Promise(r => setTimeout(r));
    expect(trigger.inert).toBeFalse();
    expect(document.activeElement).toBe(trigger);
  });

  it('wraps focus between the close button and the projected footer', async () => {
    const fixture = TestBed.createComponent(SidePanelHostComponent);
    fixture.componentInstance.withContent = true;
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
    const close = dialog.querySelector('button')!;
    const content = dialog.querySelector<HTMLButtonElement>('.panel-content')!;
    const footer = dialog.querySelector<HTMLButtonElement>('.panel-footer')!;
    const anchors: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.cdk-focus-trap-anchor');
    expect(anchors.length).toBe(2);
    expect(document.activeElement).toBe(close);
    content.focus();
    expect(document.activeElement).toBe(content);
    expectFocusWrap(anchors[0], footer);
    expectFocusWrap(anchors[1], close);
    trigger.focus();
    expect(document.activeElement).toBe(close);
    fixture.destroy();
    await new Promise(r => setTimeout(r));
    expect(document.activeElement).toBe(trigger);
  });
});
