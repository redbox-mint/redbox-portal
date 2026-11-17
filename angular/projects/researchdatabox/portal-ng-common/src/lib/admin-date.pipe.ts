import { Pipe, PipeTransform, inject } from '@angular/core';
import { AdminDateService } from './admin-date.service';

@Pipe({ name: 'adminDate', standalone: true, pure: false })
export class AdminDatePipe implements PipeTransform {
  private readonly dates = inject(AdminDateService);
  transform(value: string | number | Date | null | undefined, dateOnly = false): string {
    return this.dates.format(value, dateOnly);
  }
}
