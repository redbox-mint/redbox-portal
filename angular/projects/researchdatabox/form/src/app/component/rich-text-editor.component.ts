import {ChangeEvent} from "@ckeditor/ckeditor5-angular";
import {Component, Input, OnDestroy} from "@angular/core";
import {FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel} from "@researchdatabox/portal-ng-common";
import {
  RichTextEditorComponentName,
  RichTextEditorFieldComponentConfig,
  RichTextEditorModelName,
  type RichTextEditorOutputFormatType,
} from "@researchdatabox/sails-ng-common";
import {
  BlockQuote,
  Bold,
  ClassicEditor,
  Essentials,
  Heading,
  Italic,
  Link,
  List,
  Markdown,
  MarkdownGfmMdToHtml,
  Paragraph,
  Table,
  TableToolbar,
  type Editor,
  type EditorConfig,
  Undo
} from "ckeditor5";
import {Subscription} from "rxjs";

export class RichTextEditorModel extends FormFieldModel<string> {
  protected override logName = RichTextEditorModelName;
}

@Component({
  selector: "redbox-rich-text-editor",
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      @if (isReadonly) {
        <div class="redbox-rich-text-view form-control" [style.minHeight]="minHeight" [innerHTML]="renderedViewHtml"></div>
      } @else {
        <div class="redbox-rich-text-editor" [style.--redbox-rich-text-min-height]="minHeight">
          <ckeditor
            [editor]="Editor"
            [config]="editorConfig"
            [data]="editorData"
            [disabled]="isDisabled"
            (change)="onEditorChange($event)"
            (ready)="onEditorReady($event)"
          />
        </div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  styles: [`
    :host ::ng-deep .redbox-rich-text-editor .ck {
      box-sizing: border-box;
    }

    :host ::ng-deep .redbox-rich-text-editor .ck.ck-toolbar {
      flex-wrap: wrap;
      row-gap: 0.25rem;
    }

    :host ::ng-deep .redbox-rich-text-editor .ck.ck-button,
    :host ::ng-deep .redbox-rich-text-editor .ck.ck-button.ck-on {
      min-height: 2rem;
      min-width: 2rem;
      padding: 0.25rem 0.375rem;
      font-size: 0.875rem;
      line-height: 1.2;
    }

    :host ::ng-deep .redbox-rich-text-editor .ck.ck-button .ck-icon {
      width: 1rem;
      height: 1rem;
      font-size: 1rem;
    }

    :host ::ng-deep .redbox-rich-text-editor .ck.ck-button .ck-button__label {
      font-size: 0.875rem;
      line-height: 1.2;
    }

    :host ::ng-deep .redbox-rich-text-editor .ck-editor__editable_inline {
      min-height: var(--redbox-rich-text-min-height, 200px);
      max-height: 60vh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  `],
  standalone: false
})
export class RichTextEditorComponent extends FormFieldBaseComponent<string> implements OnDestroy {
  protected override logName = RichTextEditorComponentName;

  public Editor = ClassicEditor;
  public editorConfig: EditorConfig = {};
  public editorData = "";
  public renderedViewHtml = "";

  public outputFormat: RichTextEditorOutputFormatType = "html";
  public toolbar: string[] = [];
  public minHeight = "200px";
  public placeholder = "";
  public removePlugins: string[] = [];

  private readonly markdownConverter = new MarkdownGfmMdToHtml();
  private valueSyncSub?: Subscription;

  @Input() public override model?: RichTextEditorModel;

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const componentConfig = this.componentDefinition?.config as RichTextEditorFieldComponentConfig | undefined;
    const defaults = new RichTextEditorFieldComponentConfig();

    this.outputFormat = componentConfig?.outputFormat ?? defaults.outputFormat;
    this.toolbar = componentConfig?.toolbar ?? defaults.toolbar;
    this.minHeight = componentConfig?.minHeight ?? defaults.minHeight;
    this.placeholder = componentConfig?.placeholder ?? defaults.placeholder;
    this.removePlugins = componentConfig?.removePlugins ?? defaults.removePlugins;

    this.editorConfig = this.buildEditorConfig();
    this.editorData = this.formControl.value ?? "";
    this.renderedViewHtml = this.toViewHtml(this.editorData);

    if (this.outputFormat === "markdown" && /<[a-z][\s\S]*>/i.test(this.editorData)) {
      this.loggerService.warn(`${this.logName}: '${this.formFieldConfigName()}' is configured as markdown but appears to contain HTML.`);
    }
  }

  protected override async initEventHandlers() {
    this.valueSyncSub?.unsubscribe();
    this.valueSyncSub = this.formControl.valueChanges.subscribe((value) => {
      const nextValue = value ?? "";
      if (nextValue !== this.editorData) {
        this.editorData = nextValue;
      }
      this.renderedViewHtml = this.toViewHtml(nextValue);
    });
  }

  ngOnDestroy(): void {
    this.valueSyncSub?.unsubscribe();
  }

  public onEditorReady(editor: Editor): void {
    if (this.editorData && editor.getData() !== this.editorData) {
      editor.setData(this.editorData);
    }
  }

  public onEditorChange(event: ChangeEvent<Editor>): void {
    const data = event.editor.getData();
    if (data !== this.formControl.value) {
      this.formControl.setValue(data);
      this.formControl.markAsDirty();
      this.formControl.markAsTouched();
    }
    this.editorData = data;
    this.renderedViewHtml = this.toViewHtml(data);
  }

  private buildEditorConfig(): EditorConfig {
    const plugins: NonNullable<EditorConfig["plugins"]> = [
      Essentials,
      Paragraph,
      Heading,
      Bold,
      Italic,
      Link,
      List,
      BlockQuote,
      Table,
      TableToolbar,
      Undo,
    ];
    if (this.outputFormat === "markdown") {
      plugins.push(Markdown);
    }
    return {
      licenseKey: "GPL",
      plugins,
      toolbar: this.toolbar,
      placeholder: this.placeholder,
      removePlugins: this.removePlugins
    };
  }

  private toViewHtml(value: string): string {
    if (!value) {
      return "";
    }
    if (this.outputFormat === "markdown") {
      try {
        return this.markdownConverter.parse(value);
      } catch (error) {
        this.loggerService.error(`${this.logName}: Failed to parse markdown for view mode.`, error);
        return `<pre>${this.escapeHtml(value)}</pre>`;
      }
    }
    return value;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }
}
