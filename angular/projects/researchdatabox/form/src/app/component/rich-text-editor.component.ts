import { Component, Input, OnDestroy } from "@angular/core";
import { Editor, type AnyExtension } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Subscription } from "rxjs";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  RichTextEditorComponentName,
  RichTextEditorFieldComponentConfig,
  RichTextEditorModelName,
  type RichTextEditorOutputFormatType,
} from "@researchdatabox/sails-ng-common";

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
          @if (showSourceToggle) {
            <div class="redbox-rich-text-toolbar">
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                data-source-toggle-button="true"
                [disabled]="isDisabled"
                (click)="toggleSourceMode()">
                {{ getSourceToggleLabelKey() | i18next }}
              </button>
            </div>
          }
          @if (toolbar.length) {
            <div class="redbox-rich-text-toolbar">
              @for (action of toolbar; track action) {
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  [disabled]="isDisabled || !editor"
                  (click)="onToolbarAction(action)">
                  {{ getToolbarLabelKey(action) | i18next }}
                </button>
              }
            </div>
          }
          @if (editor && editor.isActive('table')) {
            <div class="redbox-rich-text-toolbar redbox-rich-text-toolbar-table">
              <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="isDisabled" (click)="addTableRow()">{{ "@rich-text-editor-toolbar-table-add-row" | i18next }}</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="isDisabled" (click)="addTableColumn()">{{ "@rich-text-editor-toolbar-table-add-column" | i18next }}</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="isDisabled" (click)="removeTableRow()">{{ "@rich-text-editor-toolbar-table-remove-row" | i18next }}</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="isDisabled" (click)="removeTableColumn()">{{ "@rich-text-editor-toolbar-table-remove-column" | i18next }}</button>
            </div>
          }
          @if (isSourceMode) {
            <textarea
              class="form-control redbox-rich-text-source"
              [style.minHeight]="minHeight"
              [value]="sourceValue"
              [attr.aria-label]="'Raw ' + getSourceLabel() + ' editor'"
              [disabled]="isDisabled"
              (input)="onSourceValueChange(($any($event.target)).value)"></textarea>
          } @else if (editor) {
            <div class="redbox-rich-text-editor-surface" tiptapEditor [editor]="editor"></div>
          }
        </div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  styles: [`
    .redbox-rich-text-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .redbox-rich-text-toolbar-table {
      margin-top: -0.25rem;
    }

    :host ::ng-deep .redbox-rich-text-editor .ProseMirror {
      min-height: var(--redbox-rich-text-min-height, 200px);
      max-height: 60vh;
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid #ced4da;
      border-radius: 0.25rem;
      padding: 0.75rem;
      background: #fff;
      outline: none;
    }

    :host ::ng-deep .redbox-rich-text-editor .ProseMirror table,
    :host ::ng-deep .redbox-rich-text-view table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1px solid #adb5bd;
    }

    :host ::ng-deep .redbox-rich-text-editor .ProseMirror th,
    :host ::ng-deep .redbox-rich-text-editor .ProseMirror td,
    :host ::ng-deep .redbox-rich-text-view th,
    :host ::ng-deep .redbox-rich-text-view td {
      border: 1px solid #adb5bd;
      padding: 0.4rem 0.5rem;
      vertical-align: top;
    }

    :host ::ng-deep .redbox-rich-text-editor .ProseMirror th,
    :host ::ng-deep .redbox-rich-text-view th {
      background: #f8f9fa;
      font-weight: 600;
    }

    :host ::ng-deep .redbox-rich-text-editor .ProseMirror .selectedCell {
      background: #e7f1ff;
    }

    .redbox-rich-text-source {
      font-family: monospace;
      resize: vertical;
    }
  `],
  standalone: false
})
export class RichTextEditorComponent extends FormFieldBaseComponent<string> implements OnDestroy {
  protected override logName = RichTextEditorComponentName;

  public editor: Editor | null = null;
  public renderedViewHtml = "";

  public outputFormat: RichTextEditorOutputFormatType = "html";
  public showSourceToggle = false;
  public toolbar: string[] = [];
  public minHeight = "200px";
  public placeholder = "";
  public isSourceMode = false;
  public sourceValue = "";

  private valueSyncSub?: Subscription;
  private markdownViewEditor: Editor | null = null;
  private skipNextSync = false;

  @Input() public override model?: RichTextEditorModel;

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const componentConfig = this.componentDefinition?.config as RichTextEditorFieldComponentConfig | undefined;
    const defaults = new RichTextEditorFieldComponentConfig();

    this.outputFormat = componentConfig?.outputFormat ?? defaults.outputFormat;
    this.showSourceToggle = componentConfig?.showSourceToggle ?? defaults.showSourceToggle;
    this.toolbar = componentConfig?.toolbar ?? defaults.toolbar;
    this.minHeight = componentConfig?.minHeight ?? defaults.minHeight;
    this.placeholder = componentConfig?.placeholder ?? defaults.placeholder;

    const initialValue = this.formControl.value ?? "";
    this.sourceValue = initialValue;
    this.renderedViewHtml = this.toViewHtml(initialValue);
    this.createEditor(initialValue);
  }

  protected override async initEventHandlers() {
    this.valueSyncSub?.unsubscribe();
    this.valueSyncSub = this.formControl.valueChanges.subscribe((value) => {
      const nextValue = value ?? "";
      this.sourceValue = nextValue;
      this.renderedViewHtml = this.toViewHtml(nextValue);
      if (!this.editor) {
        return;
      }
      if (this.skipNextSync) {
        this.skipNextSync = false;
        return;
      }
      if (nextValue === this.getEditorValue(this.editor)) {
        return;
      }
      this.skipNextSync = true;
      this.setEditorValue(nextValue);
    });
  }

  public onToolbarAction(action: string): void {
    if (!this.editor || this.isDisabled) {
      return;
    }
    const chain = this.editor.chain().focus();
    switch (action) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "heading":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "link":
        this.toggleLink();
        break;
      case "bulletList":
        chain.toggleBulletList().run();
        break;
      case "orderedList":
        chain.toggleOrderedList().run();
        break;
      case "blockquote":
        chain.toggleBlockquote().run();
        break;
      case "table":
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case "undo":
        chain.undo().run();
        break;
      case "redo":
        chain.redo().run();
        break;
      default:
        this.loggerService.warn(`${this.logName}: Unknown toolbar action '${action}' on '${this.formFieldConfigName()}'.`);
        break;
    }
  }

  public getToolbarLabelKey(action: string): string {
    const labelKeys: Record<string, string> = {
      heading: "@rich-text-editor-toolbar-heading",
      bold: "@rich-text-editor-toolbar-bold",
      italic: "@rich-text-editor-toolbar-italic",
      link: "@rich-text-editor-toolbar-link",
      bulletList: "@rich-text-editor-toolbar-bullet-list",
      orderedList: "@rich-text-editor-toolbar-ordered-list",
      blockquote: "@rich-text-editor-toolbar-blockquote",
      table: "@rich-text-editor-toolbar-table",
      undo: "@rich-text-editor-toolbar-undo",
      redo: "@rich-text-editor-toolbar-redo",
    };
    return labelKeys[action] ?? action;
  }

  public toggleSourceMode(): void {
    this.isSourceMode = !this.isSourceMode;
  }

  public onSourceValueChange(value: string): void {
    this.sourceValue = value;
    if (value === (this.formControl.value ?? "")) {
      return;
    }
    this.formControl.setValue(value);
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  public getSourceToggleLabelKey(): string {
    if (this.isSourceMode) {
      return "@rich-text-editor-source-toggle-rich-text";
    }
    if (this.outputFormat === "markdown") {
      return "@rich-text-editor-source-toggle-markdown";
    }
    return "@rich-text-editor-source-toggle-html";
  }

  public getSourceLabel(): string {
    return this.outputFormat === "markdown" ? "Markdown" : "HTML";
  }

  public addTableRow(): void {
    this.editor?.chain().focus().addRowAfter().run();
  }

  public addTableColumn(): void {
    this.editor?.chain().focus().addColumnAfter().run();
  }

  public removeTableRow(): void {
    this.editor?.chain().focus().deleteRow().run();
  }

  public removeTableColumn(): void {
    this.editor?.chain().focus().deleteColumn().run();
  }

  ngOnDestroy(): void {
    this.valueSyncSub?.unsubscribe();
    this.editor?.destroy();
    this.editor = null;
    this.markdownViewEditor?.destroy();
    this.markdownViewEditor = null;
  }

  private createEditor(initialValue: string): void {
    this.editor?.destroy();
    this.editor = null;
    try {
      this.editor = new Editor({
        extensions: this.buildExtensions(),
        contentType: this.outputFormat === "markdown" ? "markdown" : "html",
        content: initialValue,
        editable: !this.isReadonly && !this.isDisabled,
        editorProps: {
          attributes: {
            "aria-label": this.placeholder || "Rich text editor",
            class: "redbox-rich-text-prosemirror",
          }
        },
        onUpdate: ({ editor }) => {
          const value = this.getEditorValue(editor);
          this.renderedViewHtml = this.toViewHtml(value);
          if (this.skipNextSync) {
            this.skipNextSync = false;
            return;
          }
          if (value === (this.formControl.value ?? "")) {
            return;
          }
          this.skipNextSync = true;
          this.formControl.setValue(value);
          this.formControl.markAsDirty();
          this.formControl.markAsTouched();
        }
      });
    } catch (error) {
      this.loggerService.error(`${this.logName}: Failed to create editor instance.`, error);
      this.editor = null;
    }
  }

  private buildExtensions(): AnyExtension[] {
    const extensions: AnyExtension[] = [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ];
    if (this.outputFormat === "markdown") {
      extensions.push(Markdown);
    }
    return extensions;
  }

  private getEditorValue(editor: Editor): string {
    if (this.outputFormat === "markdown") {
      try {
        if (typeof (editor as Editor & { getMarkdown?: () => string }).getMarkdown === "function") {
          return this.normalizeEditorValue((editor as Editor & { getMarkdown: () => string }).getMarkdown());
        }
      } catch {
      }
    }
    return this.normalizeEditorValue(editor.getHTML());
  }

  private setEditorValue(value: string): void {
    if (!this.editor) {
      return;
    }
    this.editor.commands.setContent(value, {
      contentType: this.outputFormat === "markdown" ? "markdown" : "html",
    });
  }

  private toggleLink(): void {
    if (!this.editor) {
      return;
    }
    const activeHref = this.editor.getAttributes("link")?.["href"] as string | undefined;
    const enteredHref = globalThis?.prompt?.("Enter URL", activeHref || "https://");
    if (enteredHref === null) {
      return;
    }
    if (enteredHref === "") {
      this.editor.chain().focus().unsetLink().run();
      return;
    }
    this.editor.chain().focus().toggleLink({ href: enteredHref }).run();
  }

  private toViewHtml(value: string): string {
    if (!value) {
      return "";
    }
    if (this.outputFormat !== "markdown") {
      return value;
    }
    try {
      const mdEditor = this.getOrCreateMarkdownViewEditor();
      mdEditor.commands.setContent(value, { contentType: "markdown" });
      return mdEditor.getHTML();
    } catch (error) {
      this.loggerService.error(`${this.logName}: Failed to parse markdown for view mode.`, error);
      return `<pre>${this.escapeHtml(value)}</pre>`;
    }
  }

  private getOrCreateMarkdownViewEditor(): Editor {
    if (!this.markdownViewEditor) {
      this.markdownViewEditor = new Editor({
        extensions: this.buildExtensions(),
        contentType: "markdown",
        content: "",
        editable: false,
      });
    }
    return this.markdownViewEditor;
  }

  private normalizeEditorValue(value: string): string {
    if (value === "<p></p>") {
      return "";
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
