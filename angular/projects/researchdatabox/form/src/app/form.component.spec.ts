import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { FormComponent } from './form.component';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './component/simple-input.component';
import { GroupFieldComponent } from './component/group.component';
import { createFormAndWaitForReady, createTestbedModule } from "./helpers.spec";
import { FormService } from './form.service';
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { createFieldValueChangedEvent, createFormDefinitionChangedEvent, createFormSaveExecuteEvent, createFormStatusDirtyRequestEvent, FormComponentEventType } from './form-state/events/form-component-event.types';

describe('FormComponent', () => {
  const setFormDebugUrl = (value?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('formDebug');
    if (value) {
      url.searchParams.set('formDebug', value);
    }
    window.history.replaceState({}, '', url.toString());
  };

  const ensureDebugPanelOpen = async (fixture: { nativeElement: HTMLElement; detectChanges: () => void; whenStable: () => Promise<any> }) => {
    const launchButton = fixture.nativeElement.querySelector('.rb-form-debug-launch') as HTMLButtonElement | null;
    if (launchButton) {
      launchButton.click();
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };

  beforeEach(async () => {
    setFormDebugUrl('1');
    await createTestbedModule(
      {
        declarations: {
          "SimpleInputComponent": SimpleInputComponent,
          "GroupFieldComponent": GroupFieldComponent,
        }
      });
  });

  afterEach(() => {
    setFormDebugUrl();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render basic form config', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'hello world!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect(inputElement).toBeTruthy();
  });

  it('should call saveForm when form.save.execute is published (Task 15)', async () => {
    // Ensure initComponent runs so the EventBus subscription is created
    const formConfig: FormConfigFrame = {
      name: 'save-exec-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_exec',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'trigger save exec'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    const spy = spyOn(formComponent, 'saveForm').and.stub();

    // Publish execute command after subscription is in place
    bus.publish(createFormSaveExecuteEvent({ force: true, enabledValidationGroups: ["none"], targetStep: 'S1' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true, 'S1', ["none"]);
  });

  it('allows legacy callers to invoke saveForm directly (Task 17)', async () => {
    const formConfig: FormConfigFrame = {
      name: 'legacy-save',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_legacy',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'legacy value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const submitSpy = spyOn(formComponent, 'saveForm').and.stub();
    await formComponent.saveForm(true, 'legacy-step', ["none"]);
    expect(submitSpy).toHaveBeenCalledWith(true, 'legacy-step', ["none"]);
  });

  it('omits disabled controls from Form Values Debug data', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-filter-disabled',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'enabled_text',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'enabled value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'disabled_group',
          model: {
            class: 'GroupModel',
            config: {
              disabled: true,
              value: {}
            }
          },
          component: {
            class: 'GroupComponent',
            config: {
              disabled: true,
              componentDefinitions: []
            }
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const debugValues = formComponent.getDebugFormValue();

    expect(debugValues['enabled_text']).toBe('enabled value');
    expect(debugValues['disabled_group']).toBeUndefined();
  });

  it('updates URL to edit path after successful create', async () => {
    const formConfig: FormConfigFrame = {
      name: 'create-url-update',
      debugValue: false,
      componentDefinitions: [
        {
          name: 'text_create',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'create value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: '',
      recordType: 'rdmp',
      editMode: true,
      formName: 'default-1.0-draft',
      downloadAndCreateOnInit: false
    });

    const location = fixture.debugElement.injector.get(Location);
    const replaceStateSpy = spyOn(location, 'replaceState').and.stub();
    (formComponent.recordService as any).brandingAndPortalUrl = 'http://localhost/default/rdmp';
    spyOn(formComponent.recordService, 'create').and.resolveTo({
      success: true,
      oid: 'oid-123'
    } as any);

    await formComponent.saveForm(true);

    expect(formComponent.oid()).toBe('oid-123');
    expect(replaceStateSpy).toHaveBeenCalledWith('/default/rdmp/record/edit/oid-123');
  });

  it('renders the debug panel component when URL debug mode is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-layout',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_debug_layout',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const debugPanels = fixture.nativeElement.querySelectorAll('redbox-form-debug-panel');
    expect(debugPanels.length).toBe(1);
  });

  it('renders translated config debug section when debug mode is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'translated-config-debug',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_translated_config',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    await ensureDebugPanelOpen(fixture);
    const configTabButton = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-debug-tabs button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Config');
    configTabButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const headings = Array.from(fixture.nativeElement.querySelectorAll('h4') as NodeListOf<HTMLHeadingElement>).map(item => item.textContent?.trim() ?? '');
    expect(headings).toContain('Form Debug');
    const subheadings = Array.from(fixture.nativeElement.querySelectorAll('h5') as NodeListOf<HTMLHeadingElement>).map(item => item.textContent?.trim() ?? '');
    expect(subheadings).toContain('Translated Form Config Debug');
  });

  it('hides all debug sections when debug mode is disabled', async () => {
    setFormDebugUrl();
    const formConfig: FormConfigFrame = {
      name: 'debug-hidden',
      debugValue: false,
      componentDefinitions: [
        {
          name: 'text_hidden',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelectorAll('redbox-form-debug-panel').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.rb-form-debug-expand').length).toBe(0);
  });

  it('enables debug UI when formDebug query param is true-like', async () => {
    setFormDebugUrl('YES');
    const formConfig: FormConfigFrame = {
      name: 'debug-query-enabled',
      componentDefinitions: [
        {
          name: 'text_query_enabled',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelectorAll('redbox-form-debug-panel').length).toBe(1);
  });

  it('does not enable debug UI for invalid formDebug query param values', async () => {
    setFormDebugUrl('off');
    const formConfig: FormConfigFrame = {
      name: 'debug-query-disabled',
      componentDefinitions: [
        {
          name: 'text_query_disabled',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelectorAll('redbox-form-debug-panel').length).toBe(0);
  });

  it('renders event stream debug section when debug mode is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-debug-visible',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'event_stream_debug',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    await ensureDebugPanelOpen(fixture);
    const eventsTabButton = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-debug-tabs button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Events');
    eventsTabButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const headings = Array.from(fixture.nativeElement.querySelectorAll('h5') as NodeListOf<HTMLHeadingElement>).map(item => item.textContent?.trim() ?? '');
    expect(headings).toContain('Event Stream Debug');
  });

  it('captures published events in debug stream', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-capture',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'capture_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const initialLength = formComponent.debugEvents().length;

    bus.publish(createFieldValueChangedEvent({ fieldId: 'capture_event', value: 'updated', sourceId: 'capture-source' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const events = formComponent.debugEvents();
    expect(events.length).toBeGreaterThan(initialLength);
    expect(events[events.length - 1].type).toBe(FormComponentEventType.FIELD_VALUE_CHANGED);
  });

  it('does not append events while paused', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-paused',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'pause_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    formComponent.debugEventPaused.set(true);
    const initialLength = formComponent.debugEvents().length;

    bus.publish(createFieldValueChangedEvent({ fieldId: 'pause_event', value: 'updated', sourceId: 'pause-source' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.debugEvents().length).toBe(initialLength);
  });

  it('clears captured debug events', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-clear',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'clear_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'clear_event', value: 'updated', sourceId: 'clear-source' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(formComponent.debugEvents().length).toBeGreaterThan(0);

    formComponent.clearDebugEvents();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.debugEvents().length).toBe(0);
  });

  it('filters events by type', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-type-filter',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'type_filter_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'type_filter_event', value: 'updated', sourceId: 'source-a' }));
    bus.publish(createFormDefinitionChangedEvent({ sourceId: 'source-b' }));
    fixture.detectChanges();
    await fixture.whenStable();

    formComponent.debugEventFilterType.set(FormComponentEventType.FIELD_VALUE_CHANGED);
    const filtered = formComponent.getFilteredDebugEvents();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(event => event.type === FormComponentEventType.FIELD_VALUE_CHANGED)).toBeTrue();
  });

  it('filters events by field and source identifiers', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-id-filters',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'field_alpha',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'field_alpha', value: 'updated', sourceId: 'source-primary' }));
    bus.publish(createFieldValueChangedEvent({ fieldId: 'field_beta', value: 'updated', sourceId: 'source-secondary' }));
    fixture.detectChanges();
    await fixture.whenStable();

    formComponent.debugEventFilterFieldId.set('alpha');
    formComponent.debugEventFilterSourceId.set('primary');
    const filtered = formComponent.getFilteredDebugEvents();
    expect(filtered.length).toBe(1);
    expect(filtered[0].fieldId).toBe('field_alpha');
    expect(filtered[0].sourceId).toBe('source-primary');
  });

  it('enforces max debug event history by trimming oldest entries', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-max-items',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'max_items_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    formComponent.clearDebugEvents();
    formComponent.setDebugEventMaxItems(2);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'max_items_event', value: '1', sourceId: 's1' }));
    bus.publish(createFieldValueChangedEvent({ fieldId: 'max_items_event', value: '2', sourceId: 's2' }));
    bus.publish(createFieldValueChangedEvent({ fieldId: 'max_items_event', value: '3', sourceId: 's3' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const events = formComponent.debugEvents();
    expect(events.length).toBe(2);
    expect(events[0].payload['value']).toBe('2');
    expect(events[1].payload['value']).toBe('3');
  });

  it('renders event payload as text content without html evaluation', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-safe-payload',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'safe_payload_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    await ensureDebugPanelOpen(fixture);
    const bus = TestBed.inject(FormComponentEventBus);
    const dangerousPayload = '<img src=x onerror=alert(1)>';
    formComponent.clearDebugEvents();

    bus.publish(createFieldValueChangedEvent({ fieldId: 'safe_payload_event', value: dangerousPayload, sourceId: 'safe-source' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const eventsTabButton = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-debug-tabs button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Events');
    eventsTabButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const expandButton = fixture.nativeElement.querySelector('.rb-form-debug-event-expand') as HTMLButtonElement;
    expandButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const payloadPre = fixture.nativeElement.querySelector('.rb-form-debug-event-payload') as HTMLElement;
    expect(payloadPre.textContent).toContain('onerror=alert(1)');
    expect(payloadPre.querySelector('img')).toBeNull();
  });

  it('populates initial translated config snapshot for provided-config path', async () => {
    const formConfig: FormConfigFrame = {
      name: 'initial-snapshot-provided',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_snapshot',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'snapshot value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const initialConfig = formComponent.debugTranslatedFormConfigInitial();
    expect(initialConfig['name']).toBe('initial-snapshot-provided');
  });

  it('populates initial translated config snapshot for download path', async () => {
    const formConfig: FormConfigFrame = {
      name: 'initial-snapshot-download',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_snapshot_download',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'snapshot value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit.set(false);
    formComponent.oid.set('oid-download-path');
    formComponent.recordType.set('rdmp');
    formComponent.editMode.set(true);
    formComponent.formName.set('default-1.0-draft');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    const formService = TestBed.inject(FormService);
    const parentLineagePaths = formService.buildLineagePaths({
      angularComponents: [],
      dataModel: [],
      formConfig: ['componentDefinitions'],
      layout: [],
    });
    const map = await formService.createFormComponentsMap(formConfig, parentLineagePaths);
    const downloadSpy = spyOn(formService, 'downloadFormComponents').and.resolveTo(map);

    await formComponent.downloadAndCreateFormComponents();
    await fixture.whenStable();

    expect(downloadSpy).toHaveBeenCalled();
    expect(formComponent.debugTranslatedFormConfigInitial()['name']).toBe('initial-snapshot-download');
  });

  it('updates translated config current snapshot on FORM_DEFINITION_CHANGED event', async () => {
    const formConfig: FormConfigFrame = {
      name: 'definition-change-debug',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_initial',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    formComponent.formDefMap?.formConfig?.componentDefinitions?.push({
      name: 'text_added',
      model: {
        class: 'SimpleInputModel',
        config: {
          value: 'new'
        }
      },
      component: {
        class: 'SimpleInputComponent'
      }
    } as any);

    bus.publish(createFormDefinitionChangedEvent({}));
    fixture.detectChanges();
    await fixture.whenStable();

    const current = formComponent.debugTranslatedFormConfigCurrent();
    expect((current['componentDefinitions'] as unknown[]).length).toBe(2);
  });

  it('updates model current/previous snapshots and changed paths after value change', async () => {
    const formConfig: FormConfigFrame = {
      name: 'model-snapshots',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_model',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'before'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    formComponent.form?.get('text_model')?.setValue('after');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.debugModelCurrent()['text_model']).toBe('after');
    expect(formComponent.debugModelPrevious()['text_model']).toBe('before');
    expect(formComponent.debugModelChangedPaths()).toContain('text_model');
  });

  it('returns dotted/bracket changed paths for nested structures', async () => {
    const formConfig: FormConfigFrame = {
      name: 'path-diff-format',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_diff_format',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'x'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const changedPaths = (formComponent as any).computeChangedPaths(
      { contributors: [{ name: 'old' }] },
      { contributors: [{ name: 'new' }] },
      { maxDepth: 5, maxPaths: 200 }
    );
    expect(changedPaths).toContain('contributors[0].name');
  });

  it('renders expand controls and detail rows in component debug table', async () => {
    const formConfig: FormConfigFrame = {
      name: 'expand-row',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_expand',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    await ensureDebugPanelOpen(fixture);
    const expandButton = fixture.nativeElement.querySelector('.rb-form-debug-expand') as HTMLButtonElement;
    expect(expandButton).toBeTruthy();
    expandButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const detailRow = fixture.nativeElement.querySelector('.rb-form-debug-detail') as HTMLElement;
    expect(detailRow).toBeTruthy();
    expect(detailRow.textContent).toContain('Component Attributes');
  });

  it('shows loading indicator before components are loaded', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit.set(false);
    fixture.autoDetectChanges();
    await fixture.whenStable();

    const loadingElement = fixture.nativeElement.querySelector('.rb-form-loading');
    expect(loadingElement).toBeTruthy();
  });

  it('hides loading indicator after components are loaded', async () => {
    const formConfig: FormConfigFrame = {
      name: 'loading-indicator-hidden',
      componentDefinitions: [
        {
          name: 'text_loading_hidden',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit.set(false);
    fixture.autoDetectChanges();
    await fixture.whenStable();

    await formComponent.downloadAndCreateFormComponents(formConfig);
    fixture.detectChanges();
    await fixture.whenStable();

    const loadingElement = fixture.nativeElement.querySelector('.rb-form-loading');
    expect(loadingElement).toBeNull();
  });

  it('tracks FORM_DEFINITION_CHANGED debug subscription in subMaps and cleans up on destroy', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-subscription-cleanup',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_sub_cleanup',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    expect(formComponent.subMaps['formDefinitionChangedDebugSub']).toBeTruthy();
    formComponent.ngOnDestroy();
    expect(() => bus.publish(createFormDefinitionChangedEvent({}))).not.toThrow();
    fixture.destroy();
  });

  it('marks the form dirty when a FORM_STATUS_DIRTY_REQUEST event is published', async () => {
    const formConfig: FormConfigFrame = {
      name: 'dirty-request-event',
      componentDefinitions: [
        {
          name: 'text_dirty_request',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    expect(formComponent.form?.dirty).toBeFalse();
    bus.publish(createFormStatusDirtyRequestEvent({ fieldId: 'text_dirty_request', sourceId: 'test-spec', reason: 'user-delete' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.form?.dirty).toBeTrue();
    expect(formComponent.form?.get('text_dirty_request')?.dirty).toBeTrue();
    expect(formComponent.subMaps['formStatusDirtyRequestSub']).toBeTruthy();
  });

  it('tracks debugEventStreamSub in subMaps and cleanup is safe on destroy', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-subscription-cleanup',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'event_sub_cleanup',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    expect(formComponent.subMaps['debugEventStreamSub']).toBeTruthy();
    formComponent.ngOnDestroy();
    expect(() => bus.publish(createFieldValueChangedEvent({ fieldId: 'event_sub_cleanup', value: 'v' }))).not.toThrow();
    fixture.destroy();
  });

});
