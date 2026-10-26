import { FormConfigFrame, TabFieldComponentConfigFrame, TabContentFormComponentDefinitionFrame, handlebarsCompile } from '@researchdatabox/sails-ng-common';
import { get } from 'lodash-es';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { ContentComponent } from './content.component';
import { SimpleInputComponent } from './simple-input.component';
import { TabComponent, TabComponentLayout, TabContentComponent, TabSelectionErrorType } from './tab.component';

// The server removes denied definitions in place, leaving {} at their original array positions.
function tabFixture(removed: number[], selected: number[] = []): FormConfigFrame {
  return {
    name: 'pruned-tabs',
    componentDefinitions: [{
      name: 'main_tab', layout: { class: 'TabLayout' },
      component: { class: 'TabComponent', config: { tabs: [0, 1, 2].map(index => removed.includes(index) ? {} as TabContentFormComponentDefinitionFrame : {
        name: `tab${index}`, layout: { class: 'TabContentLayout', config: { buttonLabel: `Tab ${index}` } },
        component: { class: 'TabContentComponent', config: {
          selected: selected.includes(index),
          componentDefinitions: [
            { name: `field${index}`, model: { class: 'SimpleInputModel', config: { value: `value${index}` } }, component: { class: 'SimpleInputComponent' } },
            { name: `content${index}`, component: { class: 'ContentComponent', config: { content: {}, template: `<p>Compiled original tab ${index}</p>` } } },
          ],
        } },
      }) } },
    }],
  };
}

async function render(removed: number[], selected: number[] = []) {
  const config = tabFixture(removed, selected);
  const compiledKeys: string[] = [];
  const result = await createFormAndWaitForReady(config, undefined, undefined, { entries: [{
    urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
    callable: (keyString, key, context) => {
      compiledKeys.push(keyString);
      const template = get(config, key);
      if (typeof template !== 'string') throw new Error(`No original compiled template at ${keyString}`);
      return handlebarsCompile(template)(context);
    },
  }] });
  const mainTab = result.formComponent.getComponentDefByName('main_tab')!.component as TabComponent;
  return { ...result, mainTab, compiledKeys, config, element: result.fixture.nativeElement as HTMLElement };
}

describe('Authorization-pruned tabs', () => {
  beforeEach(async () => {
    const url = new URL(window.location.href); url.search = ''; window.history.replaceState({}, '', url);
    await createTestbedModule({ declarations: { SimpleInputComponent, ContentComponent, TabComponent, TabContentComponent, TabComponentLayout } });
  });

  for (const removed of [[0], [1], [2], [0, 1], [0, 1, 2]]) {
    it(`keeps named navigation, pane/control mapping and original compiled indices after removing ${removed}`, async () => {
      const { fixture, mainTab, formComponent, element, compiledKeys, config } = await render(removed);
      const remaining = [0, 1, 2].filter(index => !removed.includes(index));
      expect(mainTab.tabs.map(tab => tab.name)).toEqual(remaining.map(index => `tab${index}`));
      expect(mainTab.wrapperRefs.length).toBe(remaining.length);
      expect(element.querySelectorAll('[role="tab"]').length).toBe(remaining.length);
      expect(element.querySelectorAll('redbox-form-tab-content').length).toBe(remaining.length);
      expect(mainTab.activeTabId).toBe(remaining.length ? `tab${remaining[0]}` : null);
      expect(element.querySelectorAll('[role="tab"].active').length).toBe(remaining.length ? 1 : 0);
      expect(Object.keys(formComponent.form?.controls ?? {}).sort()).toEqual(remaining.map(index => `field${index}`));
      expect((config.componentDefinitions[0].component!.config as TabFieldComponentConfigFrame).tabs!.length).toBe(3);
      for (const index of remaining) {
        const button = element.querySelector<HTMLButtonElement>(`#tab${index}-tab-button`)!;
        expect(button.textContent?.trim()).toBe(`Tab ${index}`);
        const pane = element.querySelector<HTMLElement>(`#${button.getAttribute('aria-controls')}`)!;
        expect(pane.textContent).toContain(`Compiled original tab ${index}`);
        expect(formComponent.form!.get(`field${index}`)!.value).toBe(`value${index}`);
        expect(compiledKeys).toContain(`componentDefinitions__0__component__config__tabs__${index}__component__config__componentDefinitions__1__component__config__template`);
        button.click(); fixture.detectChanges(); await fixture.whenStable();
        expect(mainTab.activeTabId).toBe(`tab${index}`);
        expect(button.getAttribute('aria-selected')).toBe('true');
        expect(mainTab.wrapperRefs.filter(ref => ref.instance.hostBindingCssClasses?.includes('active')).length).toBe(1);
        expect(mainTab.wrapperRefs.find(ref => ref.instance.hostBindingCssClasses?.includes('active'))!.location.nativeElement.contains(pane)).toBeTrue();
      }
      expect(mainTab.selectTab(`tab${removed[0]}`).errorType).toBe(TabSelectionErrorType.INVALID_TAB);
      fixture.destroy();
    });
  }

  for (const [focus, expected] of [[undefined, 'tab2'], ['tab1', 'tab1'], ['tab0', 'tab2']] as const) {
    it(`selects ${expected} with last surviving configured selection and focusTabId=${focus}`, async () => {
      const url = new URL(window.location.href);
      url.search = focus ? `?focusTabId=${focus}` : '';
      window.history.replaceState({}, '', url);
      const result = await render([0], [1, 2]);
      expect(result.mainTab.activeTabId).toBe(expected);
      result.fixture.destroy();
    });
  }

  it('recomputes the surviving default after a page/form recreation with a different pruned response', async () => {
    let result = await render([0], [0]);
    expect(result.mainTab.activeTabId).toBe('tab1'); result.fixture.destroy();
    result = await render([1], [1]);
    expect(result.mainTab.activeTabId).toBe('tab0');
    expect(result.element.querySelectorAll('[role="tab"]').length).toBe(2); result.fixture.destroy();
    result = await render([0, 1, 2]);
    expect(result.element.querySelectorAll('[role="tab"]').length).toBe(0); result.fixture.destroy();
    result = await render([2], [1]);
    expect(result.mainTab.activeTabId).toBe('tab1'); result.fixture.destroy();
  });
});
