import { Component, Input, Output, EventEmitter, OnChanges, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { ColumnDetailComponent } from './column-detail.component';
import { DashboardFieldCatalogue, DashboardRowConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'column-editor',
  template: `
    <div class="dc-column-editor">
      <div class="dc-column-toolbar"><p class="rb-admin-hint">{{ 'admin-dashboard-columns-help' | i18next }}</p><button type="button" class="btn btn-outline-secondary btn-sm" #addColumnButton (click)="beginAdd()">{{ 'admin-dashboard-add-column' | i18next }}</button></div>
      <section *ngIf="adding" class="rb-admin-form-section dc-add-column">
        <div class="rb-admin-form-section-body">
          <div class="rb-admin-form-grid">
            <div><label [for]="pickerId">{{ 'admin-dashboard-record-field' | i18next }}</label><dashboard-field-picker [inputId]="pickerId" [catalogue]="catalogue" [(value)]="newField"></dashboard-field-picker></div>
            <div><label [for]="pickerId + '-title'">{{ 'admin-dashboard-heading' | i18next }}</label><input [id]="pickerId + '-title'" class="form-control" [(ngModel)]="newTitle" /></div>
          </div>
          <p class="rb-admin-hint">{{ 'admin-dashboard-add-help' | i18next }}</p>
          <div class="rb-admin-page-actions"><button type="button" class="btn btn-outline-secondary btn-sm" (click)="adding = false">{{ 'admin-dashboard-cancel' | i18next }}</button><button type="button" class="btn btn-primary btn-sm" (click)="addColumn()">{{ 'admin-dashboard-add-column' | i18next }}</button></div>
        </div>
      </section>
      <div class="table-responsive" *ngIf="columns.length; else emptyTpl">
        <table class="table table-hover dc-columns-table"><thead><tr><th scope="col"><span class="visually-hidden">{{ 'admin-dashboard-reorder' | i18next }}</span></th><th scope="col">{{ 'admin-dashboard-heading' | i18next }}</th><th scope="col">{{ 'admin-dashboard-record-field' | i18next }}</th><th scope="col">{{ 'admin-dashboard-sort' | i18next }}</th><th scope="col" class="text-end">{{ 'admin-dashboard-actions' | i18next }}</th></tr></thead>
          <tbody><tr *ngFor="let col of columns; let i = index" [class.dc-column-selected]="selectedColumn === col">
            <td><div class="dc-reorder"><button type="button" class="btn btn-outline-secondary btn-sm rb-admin-row-action" [disabled]="i === 0" (click)="moveColumn(i, -1)" [attr.aria-label]="'admin-dashboard-move-up' | i18next: { name: ((col.title || 'admin-dashboard-untitled') | i18next) }"><i class="fa fa-chevron-up" aria-hidden="true"></i></button><button type="button" class="btn btn-outline-secondary btn-sm rb-admin-row-action" [disabled]="i === columns.length - 1" (click)="moveColumn(i, 1)" [attr.aria-label]="'admin-dashboard-move-down' | i18next: { name: ((col.title || 'admin-dashboard-untitled') | i18next) }"><i class="fa fa-chevron-down" aria-hidden="true"></i></button></div></td>
            <td><button type="button" class="dc-column-edit rb-admin-row-action" [attr.aria-controls]="detailId" (click)="selectColumn(col)" [attr.aria-expanded]="selectedColumn === col">{{ (col.title || 'admin-dashboard-untitled') | i18next }}</button></td>
            <td><code>{{ col.variable || '—' }}</code></td>
            <td>{{ col.initialSort || '—' }}<span *ngIf="col.defaultSort"> · {{ 'admin-dashboard-default' | i18next }}</span></td>
            <td class="text-end"><button type="button" class="btn btn-outline-danger btn-sm rb-admin-row-action" [title]="'admin-dashboard-remove-column' | i18next: { name: ((col.title || 'admin-dashboard-untitled') | i18next) }" (click)="removeColumn(i, $event)" [attr.aria-label]="'admin-dashboard-remove-column' | i18next: { name: ((col.title || 'admin-dashboard-untitled') | i18next) }"><i class="fa fa-trash" aria-hidden="true"></i></button></td>
          </tr></tbody>
        </table>
      </div>
      <ng-template #emptyTpl><div class="rb-admin-empty"><p>{{ 'admin-dashboard-no-columns' | i18next }}</p></div></ng-template>
      <div [id]="detailId" [hidden]="!selectedColumn"><div class="rb-admin-form-section dc-column-detail-wrap" *ngIf="selectedColumn"><div class="rb-admin-form-section-body"><column-detail [headingLevel]="detailHeadingLevel" [column]="selectedColumn" [catalogue]="catalogue" (columnChange)="columnsChange.emit(columns)"></column-detail></div></div></div>
      <div *ngIf="pendingRemoval" class="dc-modal-backdrop"></div>
      <div *ngIf="pendingRemoval" class="dc-modal" role="alertdialog" aria-modal="true" [attr.aria-labelledby]="pickerId + '-remove-title'" [attr.aria-describedby]="pickerId + '-remove-help'" rbAdminModal cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (keydown.escape)="pendingRemoval = null">
        <header class="dc-modal-header"><h2 [id]="pickerId + '-remove-title'">{{ 'admin-dashboard-remove-column' | i18next: { name: ((pendingRemoval.title || 'admin-dashboard-untitled') | i18next) } }}</h2></header>
        <div class="dc-modal-body"><p [id]="pickerId + '-remove-help'">{{ 'admin-dashboard-remove-confirm' | i18next }}</p></div>
        <footer class="dc-modal-footer">
          <button type="button" class="btn btn-outline-secondary" cdkFocusInitial (click)="pendingRemoval = null">{{ 'admin-dashboard-cancel' | i18next }}</button>
          <button type="button" class="btn rb-admin-danger-confirm" (click)="confirmRemoval()">{{ 'admin-dashboard-remove' | i18next }}</button>
        </footer>
      </div>
    </div>
  `,
  standalone: false
})
export class ColumnEditorComponent implements OnChanges, AfterViewChecked {
  @Input() detailHeadingLevel = 4;
  @ViewChild(ColumnDetailComponent) detail?: ColumnDetailComponent;
  @ViewChild('addColumnButton') addColumnButton?: ElementRef<HTMLButtonElement>;
  pendingRemoval: DashboardRowConfig | null = null;
  private revealDetail = false;
  @Input() columns: DashboardRowConfig[] = [];
  @Input() catalogue: DashboardFieldCatalogue | null = null;
  @Output() columnsChange = new EventEmitter<DashboardRowConfig[]>();
  selectedColumn: DashboardRowConfig | null = null;
  adding = false;
  newField = '';
  newTitle = '';
  static nextId = 0;
  readonly pickerId = `dc-add-field-${++ColumnEditorComponent.nextId}`;

  readonly detailId = `${this.pickerId}-detail`;

  moveColumn(index: number, offset: number): void {
    const next = [...this.columns];
    const destination = index + offset;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    this.columns = next;
    this.columnsChange.emit(next);
  }

  beginAdd(): void { this.adding = true; this.newField = ''; this.newTitle = ''; }

  ngOnChanges(): void {
    if (this.selectedColumn && !this.columns.includes(this.selectedColumn)) this.selectedColumn = null;
    this.adding = false;
    this.pendingRemoval = null;
  }

  selectColumn(col: DashboardRowConfig): void {
    this.selectedColumn = col;
    this.revealDetail = true;
  }

  ngAfterViewChecked(): void {
    if (!this.revealDetail) return;
    this.revealDetail = false;
    this.detail?.focusHeading();
  }

  addColumn(): void {
    const field = this.catalogue?.fields.find((item) => item.path === this.newField);
    const newCol: DashboardRowConfig = { title: this.newTitle.trim() || field?.label || this.newField.trim(), variable: this.newField.trim(), template: '' };
    this.adding = false;
    this.columns = [...this.columns, newCol];
    this.columnsChange.emit(this.columns);
    this.selectColumn(newCol);
  }

  removeColumn(index: number, event: Event): void {
    event.stopPropagation();
    this.pendingRemoval = this.columns[index] ?? null;
  }

  confirmRemoval(): void {
    if (!this.pendingRemoval) return;
    this.columns = this.columns.filter((column) => column !== this.pendingRemoval);
    this.pendingRemoval = null;
    this.columnsChange.emit(this.columns);
    if (this.selectedColumn && !this.columns.includes(this.selectedColumn)) {
      this.selectedColumn = null;
    }
    // The removed row's trigger no longer exists; return to the column toolbar.
    setTimeout(() => this.addColumnButton?.nativeElement.focus({ preventScroll: true }));
  }
}
