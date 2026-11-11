import { Component, Input, ViewEncapsulation } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { ClientSideRowModelModule, ColDef, GetRowIdParams, ModuleRegistry } from 'ag-grid-community';
import { GridRow } from './data-grid.model';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

/** Loaded with the first grid response, including its CSS and only the client row model. */
@Component({
  selector: 'rb-explorer-results-grid',
  imports: [AgGridAngular],
  template: `<ag-grid-angular
    class="ag-theme-quartz grid-results"
    theme="legacy"
    [rowData]="rows"
    [columnDefs]="columns"
    [defaultColDef]="defaults"
    [getRowId]="getRowId"
    [pagination]="false"
    [animateRows]="false"
    [suppressNoRowsOverlay]="true"
    [attr.aria-label]="label"
  ></ag-grid-angular>`,
  styleUrls: ['./results-grid.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ResultsGridComponent {
  @Input() rows: GridRow[] = [];
  @Input() columns: ColDef<GridRow>[] = [];
  @Input() defaults: ColDef = {};
  @Input() label = '';
  readonly getRowId = (params: GetRowIdParams<GridRow>): string => params.data.oid;
}
