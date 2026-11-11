import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { AdminSidePanelComponent } from './admin-side-panel.component';
import { TranslationService } from './translation.service';

describe('Admin offcanvas focus management', () => {
  it('labels its modal, captures focus, excludes the background and restores the trigger', async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSidePanelComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: { t: (key: string) => key, translationChanges$: of(undefined), isInitializing: () => false },
        },
      ],
    }).compileComponents();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const fixture = TestBed.createComponent(AdminSidePanelComponent);
    fixture.componentRef.setInput('title', 'Columns');
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Columns');
    expect(dialog.contains(document.activeElement)).toBeTrue();
    expect(trigger.inert).toBeTrue();
    const closed = jasmine.createSpy();
    fixture.componentInstance.closed.subscribe(closed);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalled();
    fixture.destroy();
    await new Promise(r => setTimeout(r));
    expect(trigger.inert).toBeFalse();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
