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
});
