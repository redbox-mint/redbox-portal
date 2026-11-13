import { SimpleInputComponent } from './simple-input.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { GroupFieldComponent } from './group.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';

describe('SimpleInput native labels', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent, RepeatableComponent, RepeatableElementLayoutComponent, GroupFieldComponent } });
  });

  it('associates the visible label with its input and focuses it on click', async () => {
    const { fixture } = await createFormAndWaitForReady({ name: 'labels', componentDefinitions: [{
      name: 'title', component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { value: 'preserved' } },
      layout: { class: 'DefaultLayout', config: { label: 'Project name' } }
    }] });
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('input')!;
    const label = root.querySelector('label')!;
    expect(input.id).toBeTruthy();
    expect(label.htmlFor).toBe(input.id);
    expect(Array.from(input.labels ?? [])).toContain(label);
    label.click();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('preserved');
    fixture.detectChanges();
    expect(label.htmlFor).toBe(input.id);
  });

  it('keeps repeated inputs and simultaneous forms distinct', async () => {
    const config = { name: 'same-form', componentDefinitions: [{
      name: 'keywords', component: { class: 'RepeatableComponent' as const, config: {
        elementTemplate: { name: '', component: { class: 'GroupComponent' as const, config: { componentDefinitions: [{
          name: 'keyword', component: { class: 'SimpleInputComponent' as const },
          model: { class: 'SimpleInputModel' as const },
          layout: { class: 'DefaultLayout' as const, config: { label: 'Keyword' } }
        }] } }, model: { class: 'GroupModel' as const } }
      } }, model: { class: 'RepeatableModel' as const, config: { value: [{keyword:'first'}, {keyword:'second'}] } }
    }] };
    const first = await createFormAndWaitForReady(structuredClone(config));
    const second = await createFormAndWaitForReady(structuredClone(config));
    // TestBed's root renderer removes earlier roots when creating a fixture.
    document.body.appendChild(first.fixture.nativeElement);
    const inputs = [first, second].flatMap(({ fixture }) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input')));
    expect(inputs.length).toBe(4);
    expect(new Set(inputs.map(input => input.id)).size).toBe(4);
    for (const input of inputs) expect(input.labels?.[0]?.htmlFor).toBe(input.id);
    expect(first.formComponent.form?.getRawValue()).toEqual(second.formComponent.form?.getRawValue());
  });
});
