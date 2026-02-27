import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { FormComponent } from './form.component';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './component/simple-input.component';
import { GroupFieldComponent } from './component/group.component';
import { createFormAndWaitForReady, createTestbedModule } from "./helpers.spec";
import { FormService } from './form.service';
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { createFormDefinitionChangedEvent, createFormSaveExecuteEvent } from './form-state/events/form-component-event.types';

describe('FormComponent', () => {
  beforeEach(async () => {
    await createTestbedModule(
      {
        declarations: {
          "SimpleInputComponent": SimpleInputComponent,
          "GroupFieldComponent": GroupFieldComponent,
        }
      });
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

  it('should render debug sections inside rb-form-debug-panel wrappers', async () => {
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
    const debugPanels = fixture.nativeElement.querySelectorAll('.rb-form-debug-panel');
    expect(debugPanels.length).toBe(3);
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
    const headings = Array.from(fixture.nativeElement.querySelectorAll('h4') as NodeListOf<HTMLHeadingElement>).map(item => item.textContent?.trim() ?? '');
    expect(headings).toContain('Translated Form Config Debug');
  });

  it('hides all debug sections when debug mode is disabled', async () => {
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
    expect(fixture.nativeElement.querySelectorAll('.rb-form-debug-panel').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.rb-form-debug-expand').length).toBe(0);
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
    const expandButton = fixture.nativeElement.querySelector('.rb-form-debug-expand') as HTMLButtonElement;
    expect(expandButton).toBeTruthy();
    expandButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const detailRow = fixture.nativeElement.querySelector('.rb-form-debug-detail') as HTMLElement;
    expect(detailRow).toBeTruthy();
    expect(detailRow.textContent).toContain('Component Attributes');
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

});
