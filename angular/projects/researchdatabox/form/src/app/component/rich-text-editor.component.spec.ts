import { TestBed } from "@angular/core/testing";
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
});
