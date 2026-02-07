import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'rva-import',
  templateUrl: './rva-import.component.html',
  standalone: false
})
export class RvaImportComponent {
  rvaId = '';

  @Output() importRequested = new EventEmitter<string>();

  runImport(): void {
    this.importRequested.emit(this.rvaId.trim());
    this.rvaId = '';
  }
}
