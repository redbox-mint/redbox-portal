import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '../i18next.pipe';
import { RecordAuditComponent } from './record-audit.component';

@NgModule({
  declarations: [RecordAuditComponent],
  imports: [CommonModule, FormsModule, I18NextPipe],
  exports: [RecordAuditComponent],
})
export class RecordAuditModule {}
