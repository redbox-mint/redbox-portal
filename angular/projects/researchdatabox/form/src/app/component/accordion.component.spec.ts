import { TestBed } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { AccordionComponent, AccordionPanelComponent } from './accordion.component';
import { SimpleInputComponent } from './simple-input.component';

function buildAccordionForm(startingOpenMode?: 'all-open' | 'first-open' | 'last-open'): FormConfigFrame {
  return {
    name: 'accordion-testing',
    domElementType: 'form',
    componentDefinitions: [
      {
        name: 'main_accordion',
        component: {
          class: 'AccordionComponent',
          config: {
            ...(startingOpenMode ? { startingOpenMode } : {}),
            panels: [
              {
                name: 'panel1',
                layout: {
                  class: 'AccordionPanelLayout',
                  config: { buttonLabel: 'Panel 1' },
                },
                component: {
                  class: 'AccordionPanelComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'textfield_1',
                        model: { class: 'SimpleInputModel', config: { value: 'hello 1' } },
                        component: { class: 'SimpleInputComponent' },
                      },
                    ],
                  },
                },
              },
              {
                name: 'panel2',
                layout: {
                  class: 'AccordionPanelLayout',
                  config: { buttonLabel: 'Panel 2' },
                },
                component: {
                  class: 'AccordionPanelComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'textfield_2',
                        model: { class: 'SimpleInputModel', config: { value: 'hello 2' } },
                        component: { class: 'SimpleInputComponent' },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

describe('AccordionComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        AccordionComponent,
        AccordionPanelComponent,
        SimpleInputComponent,
      },
    });
  });

  it('renders expected number of panels', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('all-open'));
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.panel.panel-default').length).toBe(2);
  });

  it('supports all-open, first-open and last-open starting modes', async () => {
    const allOpen = await createFormAndWaitForReady(buildAccordionForm('all-open'));
    expect((allOpen.fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(2);

    const firstOpen = await createFormAndWaitForReady(buildAccordionForm('first-open'));
    expect((firstOpen.fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(1);

    const lastOpen = await createFormAndWaitForReady(buildAccordionForm('last-open'));
    expect((lastOpen.fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(1);
  });

  it('defaults to all-open when startingOpenMode is omitted', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm());
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('input[type="text"]').length).toBe(2);
  });

  it('supports multiple panels open simultaneously after toggling', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('first-open'));
    const compiled = fixture.nativeElement as HTMLElement;

    const buttons = Array.from(compiled.querySelectorAll('.panel-heading button')) as HTMLButtonElement[];
    expect(buttons.length).toBe(2);

    buttons[1].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(2);
  });

  it('toggles panel open state', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('first-open'));
    const compiled = fixture.nativeElement as HTMLElement;

    const firstButton = compiled.querySelector('.panel-heading button') as HTMLButtonElement;
    expect(firstButton).toBeTruthy();

    expect(compiled.querySelectorAll('input[type="text"]').length).toBe(1);
    firstButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(0);
  });

  it('expands and collapses all panels from controls', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('first-open'));
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('input[type="text"]').length).toBe(1);

    const expandAllButton = Array.from(compiled.querySelectorAll('.accordion-controls button')).find(button =>
      button.textContent?.includes('Expand all'));
    expect(expandAllButton).toBeTruthy();

    (expandAllButton as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(2);

    const collapseAllButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.accordion-controls button'))
      .find(button => button.textContent?.includes('Collapse all'));
    expect(collapseAllButton).toBeTruthy();

    (collapseAllButton as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(0);
  });

  it('wires aria relationships for panel header and region', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('all-open'));
    const compiled = fixture.nativeElement as HTMLElement;

    const firstHeaderButton = compiled.querySelector('.panel-heading button') as HTMLButtonElement;
    const firstRegion = compiled.querySelector('.panel-collapse') as HTMLElement;

    expect(firstHeaderButton).toBeTruthy();
    expect(firstRegion).toBeTruthy();

    const headerId = firstHeaderButton.getAttribute('id');
    const controlsId = firstHeaderButton.getAttribute('aria-controls');
    expect(headerId).toBeTruthy();
    expect(controlsId).toBeTruthy();
    expect(firstRegion.getAttribute('id')).toBe(controlsId);
    expect(firstRegion.getAttribute('role')).toBe('region');
    expect(firstRegion.getAttribute('aria-labelledby')).toBe(headerId);
  });

  it('supports arrow key navigation across accordion headers', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('all-open'));
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(compiled.querySelectorAll('.panel-heading button')) as HTMLButtonElement[];

    expect(buttons.length).toBe(2);
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(buttons[1]);

    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('moves focus to header when collapsing a panel that contains focus', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('first-open'));
    const compiled = fixture.nativeElement as HTMLElement;

    const panelButtons = Array.from(compiled.querySelectorAll('.panel-heading button')) as HTMLButtonElement[];
    panelButtons[1].click();
    fixture.detectChanges();
    await fixture.whenStable();

    const inputs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    expect(inputs.length).toBe(2);
    const panelTwoInput = inputs.find(input => input.value === 'hello 2') as HTMLInputElement;
    expect(panelTwoInput).toBeTruthy();
    panelTwoInput.focus();
    expect(document.activeElement).toBe(panelTwoInput);

    const collapseAllButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.accordion-controls button'))
      .find(button => button.textContent?.includes('Collapse all')) as HTMLButtonElement;
    collapseAllButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(panelButtons[1]);
  });

  it('announces panel expanded and collapsed state changes in live region', async () => {
    const { fixture } = await createFormAndWaitForReady(buildAccordionForm('first-open'));
    const compiled = fixture.nativeElement as HTMLElement;
    const firstHeaderButton = compiled.querySelector('.panel-heading button') as HTMLButtonElement;

    firstHeaderButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const firstLiveRegion = (fixture.nativeElement as HTMLElement).querySelector('.sr-only[aria-live="polite"]') as HTMLElement;
    expect(firstLiveRegion.textContent ?? '').toContain('collapsed');

    firstHeaderButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((firstLiveRegion.textContent ?? '')).toContain('expanded');
  });
});
