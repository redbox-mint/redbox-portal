import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';

/** Header counts describe the matching set; ranges belong in the table footer. */
@Pipe({ name: 'adminCount', standalone: true, pure: false })
export class AdminCountPipe implements PipeTransform {
  private readonly translations = inject(TranslationService);

  transform(count: number, item: string, total?: number): string {
    const filtered = total != null && total > count;
    const items = this.translations.t('admin-count-' + item, { count: filtered ? total : count });
    return this.translations.t(filtered ? 'admin-count-filtered' : 'admin-count-total', { count, total, items });
  }
}
