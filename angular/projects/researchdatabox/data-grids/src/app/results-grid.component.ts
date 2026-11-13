import { ChangeDetectionStrategy, Component, CSP_NONCE, inject, Input } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { ClientSideRowModelModule, ColDef, GetRowIdParams, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { GridRow } from './data-grid.model';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

/** Loaded with the first grid response, including its CSS and only the client row model. */
@Component({
  selector: 'rb-explorer-results-grid',
  imports: [AgGridAngular],
  styleUrls: ['./results-grid.component.scss'],
  template: `<ag-grid-angular
    class="ag-theme-quartz grid-results"
    [theme]="theme"
    [styleNonce]="styleNonce"
    [rowData]="rows"
    [columnDefs]="columns"
    [defaultColDef]="defaults"
    [getRowId]="getRowId"
    [pagination]="false"
    [animateRows]="false"
    [rowBuffer]="0"
    [suppressNoRowsOverlay]="true"
    [attr.aria-label]="label"
  ></ag-grid-angular>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsGridComponent {
  @Input() rows: GridRow[] = [];
  @Input() columns: ColDef<GridRow>[] = [];
  @Input() defaults: ColDef = {};
  @Input() label = '';
  readonly styleNonce = inject(CSP_NONCE, { optional: true }) ?? undefined;
  readonly theme = themeQuartz.withParams({
    fontFamily: 'inherit',
    fontSize: 13,
    backgroundColor: 'var(--admin-bg)',
    foregroundColor: 'var(--admin-ink)',
    headerBackgroundColor: 'var(--admin-surface)',
    headerTextColor: 'var(--admin-ink)',
    borderColor: 'var(--admin-line)',
    accentColor: 'var(--admin-primary)',
    rowHoverColor: 'var(--admin-brand-tint)',
    selectedRowBackgroundColor: 'var(--admin-brand-tint)',
    wrapperBorderRadius: 'var(--admin-radius)',
    rowHeight: 42,
  });
  readonly getRowId = (params: GetRowIdParams<GridRow>): string => params.data.oid;
}
