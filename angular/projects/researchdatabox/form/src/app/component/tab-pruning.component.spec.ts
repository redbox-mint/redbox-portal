import { FormConfigFrame, FormFieldComponentStatus, TabContentFormComponentDefinitionFrame, handlebarsCompile } from '@researchdatabox/sails-ng-common';
import { get } from 'lodash-es';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { ContentComponent } from './content.component';
import { SimpleInputComponent } from './simple-input.component';
import { TabComponent, TabComponentLayout, TabContentComponent, TabSelectionErrorType } from './tab.component';

// The server deletes denied definitions' properties in place, retaining their array positions.
function tabFixture(removed: number[], selected: number[] = []): FormConfigFrame {
  return {
    name: 'pruned-tabs',
    componentDefinitions: [{
      name: 'main_tab', layout: { class: 'TabLayout' },
      component: { class: 'TabComponent', config: { tabs: [0, 1, 2].map(index => {
        const tab: TabContentFormComponentDefinitionFrame = {
          name: `tab${index}`, layout: { class: 'TabContentLayout', config: { buttonLabel: `Tab ${index}` } },
          component: { class: 'TabContentComponent', config: {
            selected: selected.includes(index),
            componentDefinitions: [
              { name: `field${index}`, model: { class: 'SimpleInputModel', config: { value: `value${index}` } }, component: { class: 'SimpleInputComponent' } },
              { name: `content${index}`, component: { class: 'ContentComponent', config: { content: {}, template: `<p>Compiled original tab ${index}</p>` } } },
            ],
          } },
        };
        if (removed.includes(index)) {
          Object.keys(tab).forEach(key => Reflect.deleteProperty(tab, key));
        }
        return tab;
      }) } },
    }],
  };
}

function getTabConfig(config: FormConfigFrame) {
  const component = config.componentDefinitions[0].component;
  if (component.class !== 'TabComponent' || !component.config) throw new Error('Expected tab configuration');
  return component.config;
}

async function render(removed: number[], selected: number[] = [], configure?: (config: FormConfigFrame) => void) {
  const config = tabFixture(removed, selected);
  configure?.(config);
  const compiledConfig = tabFixture([]);
  const compiledKeys: string[] = [];
  const result = await createFormAndWaitForReady(config, undefined, undefined, { entries: [{
    urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
    callable: (keyString, key, context) => {
      compiledKeys.push(keyString);
      const template = get(compiledConfig, key);
      if (typeof template !== 'string') throw new Error(`No original compiled template at ${keyString}`);
      return handlebarsCompile(template)(context);
    },
  }] });
  const mainTab = result.formComponent.getComponentDefByName('main_tab')?.component;
  if (!(mainTab instanceof TabComponent)) throw new Error('Expected runtime tab component');
  expect(mainTab.status()).toBe(FormFieldComponentStatus.READY);
  return { ...result, mainTab, compiledKeys, config, element: result.fixture.nativeElement as HTMLElement };
}

describe('Authorization-pruned tabs', () => {
  beforeEach(async () => {
    const url = new URL(window.location.href); url.search = ''; window.history.replaceState({}, '', url);
    await createTestbedModule({ declarations: { SimpleInputComponent, ContentComponent, TabComponent, TabContentComponent, TabComponentLayout } });
  });

  afterEach(() => {
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url);
  });

  for (const focus of [undefined, '2']) {
    it(`preserves original positional names for unnamed surviving tabs with focusTabId=${focus}`, async () => {
      const url = new URL(window.location.href);
      url.search = focus ? `?focusTabId=${focus}` : '';
      window.history.replaceState({}, '', url);
      const { fixture, mainTab, element, compiledKeys } = await render([0], [], config => {
        const tabs = getTabConfig(config).tabs;
        tabs[1].name = '';
        tabs[2].name = '';
      });
      expect(mainTab.tabs.map(tab => tab.name)).toEqual(['1', '2']);
      expect(mainTab.activeTabId).toBe(focus ?? '1');
      expect(element.querySelector('[role="tab"].active')?.getAttribute('aria-controls')).toBe(`${focus ?? '1'}-tab-content`);
      expect(element.querySelector(`[id="${focus ?? '1'}-tab-content"]`)?.textContent).toContain(`Compiled original tab ${focus ?? '1'}`);
      expect(compiledKeys).toContain('componentDefinitions__0__component__config__tabs__2__component__config__componentDefinitions__1__component__config__template');
      fixture.destroy();
    });
  }

  it('keeps a positional fallback distinct from an explicitly numbered surviving tab', async () => {
    const { fixture, mainTab, element } = await render([1], [], config => {
      const tabs = getTabConfig(config).tabs;
      tabs[0].name = '1';
      tabs[2].name = '';
    });
    expect(mainTab.tabs.map(tab => tab.name)).toEqual(['1', '2']);
    const buttons = element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(new Set(Array.from(buttons, button => button.id)).size).toBe(2);
    buttons[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mainTab.activeTabId).toBe('2');
    const selectedWrapper = mainTab.wrapperRefs.find(ref => ref.instance.hostBindingCssClasses?.includes('active'))!;
    expect(selectedWrapper.location.nativeElement.textContent).toContain('Compiled original tab 2');
    expect(selectedWrapper.location.nativeElement.textContent).not.toContain('Compiled original tab 0');
    fixture.destroy();
  });

  it('skips a layout-only placeholder while retaining an explicitly empty component-bearing tab', async () => {
    const { fixture, mainTab, element, formComponent, compiledKeys } = await render([], [], config => {
      const tabs = getTabConfig(config).tabs;
      Reflect.deleteProperty(tabs[0], 'component');
      delete tabs[1].component.config;
    });
    expect(mainTab.tabs.map(tab => tab.name)).toEqual(['tab1', 'tab2']);
    expect(mainTab.activeTabId).toBe('tab1');
    expect(element.querySelectorAll('[role="tab"]').length).toBe(2);
    expect(element.querySelectorAll('redbox-form-tab-content').length).toBe(2);
    expect(Object.keys(formComponent.form?.controls ?? {})).toEqual(['field2']);
    expect(element.querySelector('#tab2-tab-content')?.textContent).toContain('Compiled original tab 2');
    expect(compiledKeys).toEqual(['componentDefinitions__0__component__config__tabs__2__component__config__componentDefinitions__1__component__config__template']);
    fixture.destroy();
  });

  for (const mode of ['config-unset', 'tabs-unset', 'empty-tabs']) {
    it(`renders no phantom tab for ${mode}`, async () => {
      const { fixture, mainTab, element } = await render([], [], config => {
        const component = config.componentDefinitions[0].component;
        if (mode === 'config-unset') {
          delete component.config;
        } else {
          const tabConfig = getTabConfig(config);
          if (mode === 'tabs-unset') Reflect.deleteProperty(tabConfig, 'tabs');
          else tabConfig.tabs = [];
        }
      });
      expect(mainTab.tabs).toEqual([]);
      expect(mainTab.wrapperRefs).toEqual([]);
      expect(mainTab.activeTabId).toBeNull();
      expect(element.querySelectorAll('[role="tab"]').length).toBe(0);
      expect(element.querySelectorAll('redbox-form-tab-content').length).toBe(0);
      fixture.destroy();
    });
  }

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
      expect(getTabConfig(config).tabs.length).toBe(3);
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


  it('recreates runtime tabs and controls when the same form receives a differently pruned response', async () => {
    const { fixture, formComponent, element, mainTab } = await render([0]);
    let previousTab = mainTab;
    for (const removed of [[1], [0, 1, 2], [2]]) {
      const previousWrappers = [...previousTab.wrapperRefs];
      await formComponent.downloadAndCreateFormComponents(tabFixture(removed));
      await fixture.whenStable();
      const currentTab = formComponent.getComponentDefByName('main_tab')?.component;
      if (!(currentTab instanceof TabComponent)) throw new Error('Expected replacement tab component');
      const remaining = [0, 1, 2].filter(index => !removed.includes(index));
      expect(currentTab).not.toBe(previousTab);
      expect(previousWrappers.every(ref => ref.hostView.destroyed)).toBeTrue();
      expect(currentTab.tabs.map(tab => tab.name)).toEqual(remaining.map(index => `tab${index}`));
      expect(currentTab.activeTabId).toBe(remaining.length ? `tab${remaining[0]}` : null);
      expect(element.querySelectorAll('[role="tab"]').length).toBe(remaining.length);
      expect(Object.keys(formComponent.form?.controls ?? {}).sort()).toEqual(remaining.map(index => `field${index}`));
      for (const index of remaining) {
        expect(element.querySelector(`#tab${index}-tab-content`)?.textContent).toContain(`Compiled original tab ${index}`);
      }
      previousTab = currentTab;
    }
    fixture.destroy();
  });

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
