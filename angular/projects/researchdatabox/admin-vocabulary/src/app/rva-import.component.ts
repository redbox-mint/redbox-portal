import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'rva-import',
  templateUrl: './rva-import.component.html',
  styleUrls: ['./rva-import.component.scss'],
  standalone: false
})
export class RvaImportComponent {
  rvaId = '';

  @Output() importRequested = new EventEmitter<string>();

  get canImport(): boolean {
    return !!this.rvaId.trim();
  }

  runImport(): void {
    this.importRequested.emit(this.rvaId.trim());
    this.rvaId = '';
  }
}
