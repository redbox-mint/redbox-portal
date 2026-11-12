import { Component, ElementRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSidePanelComponent, I18NextPipe, TranslationService } from '@researchdatabox/portal-ng-common';
import { defaultColumns, GridField, LIMITS } from './data-grid.model';
import { fieldGroups } from './field-presentation';

@Component({
  selector: 'rb-explorer-columns',
  imports: [FormsModule, AdminSidePanelComponent, I18NextPipe],
  templateUrl: './columns-panel.component.html',
})
export class ColumnsPanelComponent implements OnInit {
  @Input() fields: GridField[] = [];
  @Input() selected: string[] = [];
  @Input() subtitle = '';
  @Output() closed = new EventEmitter<void>();
  @Output() applied = new EventEmitter<string[]>();
  columns: string[] = [];
  search = '';
  showRepeating = false;
  announcement = '';
  dragIndex: number | null = null;
  readonly limit = LIMITS.columns;
  constructor(
    private host: ElementRef<HTMLElement>,
    private i18n: TranslationService
  ) {}
  ngOnInit(): void {
    this.columns = [...this.selected];
  }
  label(id: string): string {
    const field = this.fields.find(f => f.id === id);
    if (!field) return id;
    return field.label;
  }
  get groups(): { label: string; fields: GridField[] }[] {
    const groups = new Map<string, GridField[]>();
    const needle = this.search.toLocaleLowerCase().trim();
    for (const field of this.fields) {
      if (field.repeatingSubfield && !this.showRepeating) continue;
      const group =
        field.groupPath?.join(' / ') ||
        field.group ||
        String(
          this.i18n.t(
            field.id.startsWith('record:') ? 'data-grids-field-group-record' : 'data-grids-field-group-metadata'
          )
        );
      if (needle && ![field.label, field.path, group].join(' ').toLocaleLowerCase().includes(needle)) continue;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(field);
    }
    return fieldGroups(
      [...groups].flatMap(([group, fields]) => fields.map(field => ({ ...field, group, groupPath: [] })))
    );
  }
  get repeatingCount(): number {
    return this.fields.filter(f => f.repeatingSubfield).length;
  }
  toggle(id: string, restoreFocus = false): void {
    const index = this.columns.indexOf(id);
    if (index !== -1) {
      this.columns = this.columns.filter(key => key !== id);
      if (restoreFocus) {
        const next = this.columns[Math.min(index, this.columns.length - 1)];
        setTimeout(() =>
          this.host.nativeElement
            .querySelector<HTMLElement>(next ? `[data-column-id="${CSS.escape(next)}"]` : '#field-search')
            ?.focus()
        );
      }
    }
    else if (this.fields.some(f => f.id === id && f.selectable) && this.columns.length < this.limit)
      this.columns = [...this.columns, id];
  }
  reset(): void {
    this.columns = defaultColumns(this.fields);
  }
  move(from: number, to: number, focus = false): void {
    if (from < 0 || to < 0 || from >= this.columns.length || to >= this.columns.length || from === to) return;
    const columns = [...this.columns];
    const [id] = columns.splice(from, 1);
    columns.splice(to, 0, id);
    this.columns = columns;
    this.announcement = `${this.label(id)}: ${to + 1} / ${columns.length}`;
    if (focus)
      setTimeout(() =>
        this.host.nativeElement.querySelector<HTMLButtonElement>(`[data-column-id="${CSS.escape(id)}"]`)?.focus()
      );
  }
  reorder(event: KeyboardEvent, index: number): void {
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? this.columns.length - 1
          : ['ArrowLeft', 'ArrowUp'].includes(event.key)
            ? index - 1
            : ['ArrowRight', 'ArrowDown'].includes(event.key)
              ? index + 1
              : null;
    if (to === null) return;
    event.preventDefault();
    this.move(index, to, true);
  }
  drop(event: DragEvent, index: number): void {
    event.preventDefault();
    if (this.dragIndex !== null) this.move(this.dragIndex, index);
    this.dragIndex = null;
  }
}
