import { TestBed } from "@angular/core/testing";
import { PendingTasks } from "@angular/core";
import { By } from "@angular/platform-browser";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule, type FormComponentProps } from "../helpers.spec";
import { RichTextEditorComponent } from "./rich-text-editor.component";

describe("RichTextEditorComponent", () => {
  const editModeProps: FormComponentProps = {
    oid: "oid-editable-rich-text",
    recordType: "rdmp",
    editMode: true,
    formName: "default-1.0-draft",
    downloadAndCreateOnInit: false,
  };
  beforeEach(async () => {
    await createTestbedModule({ declarations: { "RichTextEditorComponent": RichTextEditorComponent } });
  });

  it("should create component", () => {
    const fixture = TestBed.createComponent(RichTextEditorComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it("renders HTML in readonly mode and sanitizes unsafe tags", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "htmlField",
          component: {
            class: "RichTextEditorComponent",
            config: {
              readonly: true,
              outputFormat: "html"
            }
          },
          model: {
            class: "RichTextEditorModel",
            config: {
              value: "<script>alert('xss')</script><p><strong>Safe</strong> body</p>"
            }
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector("script")).toBeNull();
    const content = (compiled.querySelector(".redbox-rich-text-view") as HTMLElement)?.innerHTML ?? "";
    expect(content).toContain("<p><strong>Safe</strong> body</p>");
  });

  it("renders markdown as HTML in readonly mode", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "markdownField",
          component: {
            class: "RichTextEditorComponent",
            config: {
              readonly: true,
              outputFormat: "markdown"
            }
          },
          model: {
            class: "RichTextEditorModel",
            config: {
              value: "**Bold markdown**"
            }
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const content = (compiled.querySelector(".redbox-rich-text-view") as HTMLElement)?.innerHTML ?? "";
    expect(content).toContain("<strong>Bold markdown</strong>");
  });

  it("keeps readonly view content in sync with formControl setValue", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "syncField",
          component: {
            class: "RichTextEditorComponent",
            config: {
              readonly: true,
              outputFormat: "html"
            }
          },
          model: {
            class: "RichTextEditorModel",
            config: {
              value: "<p>Before</p>"
            }
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    (formComponent as any).form.controls.syncField.setValue("<p>After</p>");
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const content = (compiled.querySelector(".redbox-rich-text-view") as HTMLElement)?.innerHTML ?? "";
    expect(content).toContain("<p>After</p>");
  });

  it("applies toolbar actions in editable mode", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "<p>Alpha</p>" } }
      }]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    richTextComponent.editor?.commands.selectAll();
    richTextComponent.onToolbarAction("bold");
    await fixture.whenStable();
    expect(richTextComponent.editor?.getHTML()).toContain("<strong>");
  });

  it("adds and removes a link through the toolbar without losing the selected text", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: {class: "RichTextEditorComponent"},
        model: {class: "RichTextEditorModel", config: {value: "<p>Project homepage</p>"}}
      }]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig, editModeProps);
    const component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const prompt = spyOn(globalThis, "prompt").and.returnValues("https://example.test/project", null, "");

    component.editor?.commands.selectAll();
    component.onToolbarAction("link");
    await fixture.whenStable();
    expect(component.editor?.getHTML()).toContain('href="https://example.test/project"');
    expect(formComponent.form?.controls["editableField"].value).toContain('href="https://example.test/project"');

    component.editor?.commands.selectAll();
    component.onToolbarAction("link");
    expect(component.editor?.getHTML()).toContain('href="https://example.test/project"');

    component.editor?.commands.selectAll();
    component.onToolbarAction("link");
    await fixture.whenStable();
    expect(component.editor?.getHTML()).not.toContain("<a ");
    expect(prompt).toHaveBeenCalledTimes(3);
  });

  it("persists editable Markdown and shows the Markdown source label", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "markdownField",
        component: {class: "RichTextEditorComponent", config: {outputFormat: "markdown", showSourceToggle: true}},
        model: {class: "RichTextEditorModel", config: {value: "**Before**"}}
      }]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig, editModeProps);
    const component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;

    expect(component.getSourceToggleLabelKey()).toBe("@rich-text-editor-source-toggle-markdown");
    component.editor?.commands.setContent("<p><strong>After</strong></p>");
    await fixture.whenStable();
    expect(formComponent.form?.controls["markdownField"].value).toContain("**After**");
    expect(component.getSourceLabel()).toBe("Markdown");
  });

  it("does not render source toggle by default", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "<p>Alpha</p>" } }
      }]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, editModeProps);
    const compiled = fixture.nativeElement as HTMLElement;
    const sourceToggleButton = compiled.querySelector("[data-source-toggle-button='true']");
    expect(sourceToggleButton).toBeNull();
  });

  it("toggles to raw source mode and syncs source edits", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: {
          class: "RichTextEditorComponent",
          config: { showSourceToggle: true, outputFormat: "html" }
        },
        model: { class: "RichTextEditorModel", config: { value: "<p>Before</p>" } }
      }]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const compiled = fixture.nativeElement as HTMLElement;

    const toggleButton = compiled.querySelector("[data-source-toggle-button='true']") as HTMLButtonElement | null;
    expect(toggleButton).not.toBeNull();
    if (!toggleButton) {
      return;
    }
    toggleButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const sourceTextarea = compiled.querySelector(".redbox-rich-text-source") as HTMLTextAreaElement | null;
    expect(sourceTextarea).not.toBeNull();
    if (!sourceTextarea) {
      return;
    }
    sourceTextarea.value = "<p>From source</p>";
    sourceTextarea.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.form?.controls["editableField"].value).toContain("<p>From source</p>");
    expect(richTextComponent.editor?.getHTML()).toContain("<p>From source</p>");

    // Returning from source mode must remount the same editable document.
    const editor = richTextComponent.editor;
    toggleButton.click();
    await fixture.whenStable();
    expect(richTextComponent.editor).toBe(editor);
    expect(compiled.querySelector('[contenteditable="true"]')?.textContent).toBe("From source");
  });

  it("syncs editor updates to formControl", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "<p>Before</p>" } }
      }]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    richTextComponent.editor?.commands.setContent("<p>After editor</p>");
    await fixture.whenStable();
    expect(formComponent.form?.controls["editableField"].value).toContain("<p>After editor</p>");
  });

  it("syncs formControl updates to editor", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "<p>Before</p>" } }
      }]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    formComponent.form?.controls["editableField"].setValue("<p>Updated by formControl</p>");
    await fixture.whenStable();
    expect(richTextComponent.editor?.getHTML()).toContain("<p>Updated by formControl</p>");
  });

  it("syncs the editor when an expression updates model.value with emitEvent false", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "" } }
      }]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const control = formComponent.form?.controls["editableField"];
    expect(control).toBeDefined();
    if (!control) {
      return;
    }

    // Expression-driven updates bypass valueChanges, then the framework calls syncDisplayFromModel.
    control.setValue("<p>Archival data record created for v5 verification.</p>", { emitEvent: false });
    await richTextComponent.syncDisplayFromModel();
    await fixture.whenStable();

    expect(richTextComponent.editor?.getHTML()).toContain("Archival data record created for v5 verification.");
  });

  it("does not write back to the formControl when syncing display from the model", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "<p>Before</p>" } }
      }]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const control = formComponent.form?.controls["editableField"];
    expect(control).toBeDefined();
    if (!control) {
      return;
    }
    control.setValue("<p>Set by expression</p>", { emitEvent: false });
    const setValueSpy = spyOn(control, "setValue").and.callThrough();

    await richTextComponent.syncDisplayFromModel();
    await fixture.whenStable();

    expect(setValueSpy.calls.count()).toBe(0);
    expect(control.value).toContain("<p>Set by expression</p>");
  });

  it("syncs the readonly view when an expression updates model.value with emitEvent false", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "syncField",
        component: {
          class: "RichTextEditorComponent",
          config: {
            readonly: true,
            outputFormat: "html"
          }
        },
        model: { class: "RichTextEditorModel", config: { value: "<p>Before</p>" } }
      }]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    (formComponent as any).form.controls.syncField.setValue("<p>Set by expression</p>", { emitEvent: false });
    await richTextComponent.syncDisplayFromModel();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const content = (compiled.querySelector(".redbox-rich-text-view") as HTMLElement)?.innerHTML ?? "";
    expect(content).toContain("<p>Set by expression</p>");
  });

  it("prevents value sync loops between editor and formControl", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "<p>Before</p>" } }
      }]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const control = formComponent.form?.controls["editableField"];
    expect(control).toBeDefined();
    if (!control) {
      return;
    }
    const setValueSpy = spyOn(control, "setValue").and.callThrough();

    richTextComponent.editor?.commands.setContent("<p>One way update</p>");
    await fixture.whenStable();
    const callsAfterEditorUpdate = setValueSpy.calls.count();

    control.setValue("<p>Other way update</p>");
    await fixture.whenStable();
    expect(setValueSpy.calls.count()).toBe(callsAfterEditorUpdate + 1);
  });

  it("returns undefined when injected CSP nonce is absent", () => {
    const fixture = TestBed.createComponent(RichTextEditorComponent);
    const component = fixture.componentInstance as any;
    component.cspNonce = undefined;
    expect(component.resolveCspNonce()).toBeUndefined();
  });

  it("prefers injected CSP nonce when present", () => {
    const fixture = TestBed.createComponent(RichTextEditorComponent);
    const component = fixture.componentInstance as any;
    component.cspNonce = "injected-csp-nonce";

    expect(component.resolveCspNonce()).toBe("injected-csp-nonce");
  });

  it("updates editor editable state when disabled changes", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [{
        name: "editableField",
        component: { class: "RichTextEditorComponent" },
        model: { class: "RichTextEditorModel", config: { value: "<p>Before</p>" } }
      }]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, editModeProps);
    const richTextComponent = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    expect(richTextComponent.editor?.isEditable).toBe(true);

    richTextComponent.setDisabled(true);
    await fixture.whenStable();
    expect(richTextComponent.editor?.isEditable).toBe(false);

    richTextComponent.setDisabled(false);
    await fixture.whenStable();
    expect(richTextComponent.editor?.isEditable).toBe(true);
  });
  const editableConfig: FormConfigFrame = {
    name: "lazy-editor",
    componentDefinitions: [{
      name: "description",
      component: { class: "RichTextEditorComponent", config: {} },
      model: { class: "RichTextEditorModel", config: { value: "<p>Saved description</p>" } },
    }],
  };

  it("does not request editor dependencies for readonly HTML or hidden fields", async () => {
    const loader = spyOn<any>(RichTextEditorComponent.prototype, "loadRuntime").and.callThrough();
    const config = structuredClone(editableConfig);
    config.componentDefinitions![0].component!.config = { readonly: true };
    const { fixture } = await createFormAndWaitForReady(config, editModeProps);
    expect(loader).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("Saved description");
    fixture.destroy();

    config.componentDefinitions![0].component!.config = { visible: false };
    const hidden = await createFormAndWaitForReady(config, editModeProps);
    expect(loader).not.toHaveBeenCalled();
    const component = hidden.fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    component.setProperty("visible", true);
    await hidden.fixture.whenStable();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(component.editor?.getHTML()).toContain("Saved description");

    const editor = component.editor;
    component.setProperty("visible", false);
    await hidden.fixture.whenStable();
    expect(hidden.fixture.nativeElement.querySelector('[contenteditable="true"]')).toBeNull();
    component.setProperty("visible", true);
    await hidden.fixture.whenStable();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(component.editor).toBe(editor);
    expect(hidden.fixture.nativeElement.querySelector('[contenteditable="true"]').textContent).toBe("Saved description");
  });

  it("uses the latest silent model update when editor loading is delayed", async () => {
    const runtime = await import('./rich-text-editor.runtime');
    let release!: (runtime: typeof import('./rich-text-editor.runtime')) => void;
    let component!: RichTextEditorComponent;
    let started!: () => void;
    const loading = new Promise<void>(resolve => started = resolve);
    const deferred = new Promise<typeof runtime>(resolve => release = resolve);
    spyOn<any>(RichTextEditorComponent.prototype, "loadRuntime").and.callFake(function(this: RichTextEditorComponent) {
      component = this;
      started();
      return deferred;
    });
    const ready = createFormAndWaitForReady(editableConfig, editModeProps);
    await loading;
    const control = (component as any).formControl;
    control.setValue("<p>Updated during loading</p>", { emitEvent: false });
    release(runtime);
    await ready;
    expect(component.editor?.getHTML()).toContain("Updated during loading");
    expect(control.pristine).toBeTrue();
  });

  it("retains saved content after a load failure and explains how to recover", async () => {
    spyOn<any>(RichTextEditorComponent.prototype, "loadRuntime").and.rejectWith(new Error("offline"));
    const { fixture, formComponent } = await createFormAndWaitForReady(editableConfig, editModeProps);
    const component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain("Unable to load rich text");
    expect(formComponent.form?.get('description')?.value).toBe("<p>Saved description</p>");
    expect(component.editorLoadFailed).toBeTrue();
    expect(component.editor).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain("Save your changes and reload");
    expect(formComponent.form?.get('description')?.pristine).toBeTrue();
  });

  for (const property of ['visible', 'readonly', 'disabled'] as const) {
    it(`respects ${property} changes during loading and resumes with the current value`, async () => {
      const runtime = await import('./rich-text-editor.runtime');
      let component!: RichTextEditorComponent;
      let release!: (value: typeof runtime) => void;
      let started!: () => void;
      const loading = new Promise<void>(resolve => started = resolve);
      const deferred = new Promise<typeof runtime>(resolve => release = resolve);
      const loader = spyOn<any>(RichTextEditorComponent.prototype, 'loadRuntime').and.callFake(function(this: RichTextEditorComponent) {
        component = this;
        started();
        return deferred;
      });
      const config = structuredClone(editableConfig);
      config.componentDefinitions![0].component!.config = { visible: false };
      const { fixture } = await createFormAndWaitForReady(config, editModeProps);
      component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
      component.setProperty('visible', true);
      await loading;
      component.setProperty(property, property !== 'visible');
      component.model!.formControl!.setValue('<p>Updated while waiting</p>', { emitEvent: false });
      release(runtime);
      await fixture.whenStable();
      expect(component.editor).toBeNull();
      expect(fixture.nativeElement.querySelector('[contenteditable="true"]')).toBeNull();

      component.setProperty(property, property === 'visible');
      await fixture.whenStable();
      expect(component.editor?.getHTML()).toBe('<p>Updated while waiting</p>');
      expect(component.editor?.isEditable).toBeTrue();
      expect(component.model!.formControl!.pristine).toBeTrue();
      expect(loader).toHaveBeenCalledTimes(1);
    });
  }

  it('restores editing after readonly and disabled state changes without a render loop', async () => {
    const { fixture } = await createFormAndWaitForReady(editableConfig, editModeProps);
    const component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    component.setProperty('readonly', true);
    component.setDisabled(false);
    await fixture.whenStable();
    expect(component.editor?.isEditable).toBeFalse();
    component.setProperty('readonly', false);
    await fixture.whenStable();
    expect(component.editor?.isEditable).toBeTrue();
    const render = spyOn(component, 'requestRender').and.callThrough();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(render).not.toHaveBeenCalled();
    component.editor!.commands.insertContent('User edit');
    await fixture.whenStable();
    expect(component.model!.formControl!.value).toContain('User edit');
  });

  it('keeps an empty stored value pristine through readonly and disabled transitions', async () => {
    const config = structuredClone(editableConfig);
    config.componentDefinitions![0].model!.config = { value: '<p></p>' };
    const { fixture } = await createFormAndWaitForReady(config, editModeProps);
    const component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const control = component.model!.formControl!;
    component.setDisabled(true);
    await fixture.whenStable();
    component.setDisabled(false);
    component.setProperty('readonly', true);
    await fixture.whenStable();
    component.setProperty('readonly', false);
    await fixture.whenStable();
    expect(control.value).toBe('<p></p>');
    expect(control.pristine).toBeTrue();
    expect(control.untouched).toBeTrue();
    expect(component.editor?.isEditable).toBeTrue();
  });

  it('persists the first user edit after a silent model update to equivalent empty content', async () => {
    const config = structuredClone(editableConfig);
    config.componentDefinitions![0].model!.config = { value: '' };
    const { fixture } = await createFormAndWaitForReady(config, editModeProps);
    const component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const control = component.model!.formControl!;
    control.setValue('<p></p>', { emitEvent: false });
    await component.syncDisplayFromModel();
    component.editor!.commands.insertContent('First user edit');
    await fixture.whenStable();
    expect(control.value).toBe('<p>First user edit</p>');
    expect(control.dirty).toBeTrue();
  });

  it("does not create an editor after destruction during loading", async () => {
    const runtime = await import('./rich-text-editor.runtime');
    let component!: RichTextEditorComponent;
    spyOn<any>(RichTextEditorComponent.prototype, "loadRuntime").and.callFake(function(this: RichTextEditorComponent) {
      component = this;
      this.ngOnDestroy();
      return Promise.resolve(runtime);
    });
    await createFormAndWaitForReady(editableConfig, editModeProps);
    expect(component.editor).toBeNull();
  });

  it('releases the Angular pending task when destroyed before a stalled download finishes', async () => {
    const runtime = await import('./rich-text-editor.runtime');
    let release!: (value: typeof runtime) => void;
    let started!: () => void;
    const loading = new Promise<void>(resolve => started = resolve);
    const deferred = new Promise<typeof runtime>(resolve => release = resolve);
    spyOn<any>(RichTextEditorComponent.prototype, 'loadRuntime').and.callFake(() => {
      started();
      return deferred;
    });
    const config = structuredClone(editableConfig);
    config.componentDefinitions![0].component!.config = { visible: false };
    const { fixture } = await createFormAndWaitForReady(config, editModeProps);
    const component = fixture.debugElement.query(By.directive(RichTextEditorComponent)).componentInstance as RichTextEditorComponent;
    const tasks = TestBed.inject(PendingTasks);
    const addTask = tasks.add.bind(tasks);
    const removeTask = jasmine.createSpy('remove pending editor task');
    spyOn(tasks, 'add').and.callFake(() => {
      removeTask.and.callFake(addTask());
      return removeTask;
    });
    component.setProperty('visible', true);
    await loading;
    fixture.destroy();
    expect(removeTask).toHaveBeenCalledTimes(1);
    release(runtime);
    await deferred;
    expect(component.editor).toBeNull();
    expect(removeTask).toHaveBeenCalledTimes(1);
  });

});
