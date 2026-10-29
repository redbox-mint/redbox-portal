import { afterNextRender, Component, ElementRef, EventEmitter, Inject, Injector, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe, LoggerService } from '@researchdatabox/portal-ng-common';
import { EmailTemplateAdminService } from './email-template-admin.service';
import { RAW_INTERPOLATION, type EmailAdminCatalogueEntry } from './email-templates.model';
import { WhenPipe } from './when.pipe';

export type CatalogueFilter = 'all' | 'overridden' | 'drafts' | 'attention';

export function needsAttention(entry: EmailAdminCatalogueEntry): boolean {
  return entry.invalid || entry.defaultUpdated || entry.consistency.length > 0;
}

const FILTERS: Record<CatalogueFilter, (entry: EmailAdminCatalogueEntry) => boolean> = {
  all: () => true,
  overridden: entry => entry.source === 'override',
  drafts: entry => entry.hasDraft,
  attention: needsAttention,
};

@Component({
  selector: 'email-templates-catalogue',
  standalone: true,
  imports: [FormsModule, I18NextPipe, WhenPipe],
  templateUrl: './catalogue.component.html',
  styleUrls: ['./email-templates.shared.scss', './catalogue.component.scss'],
})
export class CatalogueComponent implements OnInit, OnDestroy {
  @Input() returnFocus: { templateId: string; action: string } | null = null;
  openingAction = 'open';
  private destroyed = false;
  @Output() openTemplate = new EventEmitter<string>();

  readonly raw = RAW_INTERPOLATION;
  readonly filterKeys: CatalogueFilter[] = ['all', 'overridden', 'drafts', 'attention'];
  entries: EmailAdminCatalogueEntry[] = [];
  loading = true;
  loadFailed = false;
  query = '';
  filter: CatalogueFilter = 'all';

  constructor(
    private api: EmailTemplateAdminService,
    private host: ElementRef<HTMLElement>,
    private injector: Injector,
    @Inject(LoggerService) private logger: LoggerService
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void { this.destroyed = true; }

  async load(): Promise<void> {
    this.loading = true;
    this.loadFailed = false;
    try {
      this.entries = await this.api.catalogue();
    } catch (error) {
      this.loadFailed = true;
      this.logger.error('Email template catalogue failed to load', error);
    } finally {
      this.loading = false;
      afterNextRender(() => {
        if (this.destroyed || !this.returnFocus) return;
        const row = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-template-id]'))
          .find(item => item.dataset['templateId'] === this.returnFocus!.templateId);
        const actions = Array.from(row?.querySelectorAll<HTMLButtonElement>('[data-template-action]') ?? []);
        (actions.find(button => button.dataset['templateAction'] === this.returnFocus!.action) ??
          actions.find(button => button.dataset['templateAction'] === 'open'))?.focus();
      }, { injector: this.injector });
    }
  }

  count(filter: CatalogueFilter): number {
    return this.entries.filter(FILTERS[filter]).length;
  }

  get visible(): EmailAdminCatalogueEntry[] {
    const query = this.query.trim().toLowerCase();
    return this.entries.filter(
      entry =>
        FILTERS[this.filter](entry) &&
        (!query || entry.templateId.toLowerCase().includes(query) || (entry.description ?? '').toLowerCase().includes(query) || entry.subject.toLowerCase().includes(query))
    );
  }

  hasIncompleteTransition(entry: EmailAdminCatalogueEntry): boolean {
    return entry.consistency.some(item => item.code === 'INCOMPLETE_LIVE_TRANSITION');
  }

  open(entry: EmailAdminCatalogueEntry, event?: Event): void {
    this.openingAction = (event?.currentTarget as HTMLElement | null)?.dataset['templateAction'] ?? 'open';
    this.openTemplate.emit(entry.templateId);
  }
}
