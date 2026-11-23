import { ComponentFixture } from '@angular/core/testing';
import { FieldLayoutConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { FormComponent } from '../form.component';
import { SimpleInputComponent } from './simple-input.component';

type LayoutClass = 'DefaultLayout' | 'InlineLayout';

const layouts: { layout: LayoutClass; controlSelector: string }[] = [
  { layout: 'DefaultLayout', controlSelector: '.rb-form-field-control' },
  { layout: 'InlineLayout', controlSelector: '.rb-form-inline-layout__control' },
];

describe('Layout help text visibility', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent } });
  });

  async function render(layout: LayoutClass, config: FieldLayoutConfigFrame) {
    const { fixture } = await createFormAndWaitForReady({
      name: 'help-text',
      componentDefinitions: [{
        name: 'title',
        component: { class: 'SimpleInputComponent' },
        model: { class: 'SimpleInputModel' },
        layout: { class: layout, config: { label: 'Title', ...config } },
      }],
    }, { editMode: true });
    // Fails with ExpressionChangedAfterItHasBeenChecked if the initial state is set too late.
    fixture.detectChanges();
    fixture.checkNoChanges();
    return fixture;
  }

  function helpBlock(fixture: ComponentFixture<FormComponent>) {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.help-block');
  }

  function helpButton(fixture: ComponentFixture<FormComponent>) {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('label button');
  }

  async function toggle(fixture: ComponentFixture<FormComponent>) {
    helpButton(fixture)!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  for (const { layout, controlSelector } of layouts) {
    describe(layout, () => {
      it('shows the help text between the label and the control when helpTextVisibleOnInit is true', async () => {
        const fixture = await render(layout, { helpText: 'Some guidance', helpTextVisibleOnInit: true });
        const root = fixture.nativeElement as HTMLElement;
        const label = root.querySelector('label')!;
        const help = helpBlock(fixture);
        const control = root.querySelector(controlSelector)!;

        expect(help).not.toBeNull();
        expect(help!.textContent).toContain('Some guidance');
        expect(label.compareDocumentPosition(help!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(help!.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });

      it('still toggles the help text when it starts expanded', async () => {
        const fixture = await render(layout, { helpText: 'Some guidance', helpTextVisibleOnInit: true });
        expect(helpBlock(fixture)).not.toBeNull();
        await toggle(fixture);
        expect(helpBlock(fixture)).toBeNull();
        await toggle(fixture);
        expect(helpBlock(fixture)).not.toBeNull();
      });

      for (const [description, config] of [
        ['absent', { helpText: 'Some guidance' }],
        ['false', { helpText: 'Some guidance', helpTextVisibleOnInit: false }],
      ] as const) {
        it(`starts with the help text collapsed when helpTextVisibleOnInit is ${description}, and toggles it`, async () => {
          const fixture = await render(layout, config);
          expect(helpButton(fixture)).not.toBeNull();
          expect(helpBlock(fixture)).toBeNull();
          await toggle(fixture);
          expect(helpBlock(fixture)?.textContent).toContain('Some guidance');
          await toggle(fixture);
          expect(helpBlock(fixture)).toBeNull();
        });
      }

      it('renders no help button or help block for a field without help text', async () => {
        for (const config of [{}, { helpTextVisibleOnInit: true }]) {
          const fixture = await render(layout, config);
          const root = fixture.nativeElement as HTMLElement;
          expect(root.querySelector('label')?.textContent).toContain('Title');
          expect(helpButton(fixture)).toBeNull();
          expect(helpBlock(fixture)).toBeNull();
        }
      });
    });
  }
});
