import { Component, EventEmitter, Input, Output } from '@angular/core';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import type { EmailAdminHistory } from './email-templates.model';
import { WhenPipe } from './when.pipe';

/** Version list for one template. Restoring only ever copies into the draft. */
@Component({
  selector: 'email-templates-history',
  standalone: true,
  imports: [I18NextPipe, WhenPipe],
  template: `
    @if (loading) {
      <div class="et-empty" role="status">
        <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span
        >{{ 'email-templates-loading' | i18next }}
      </div>
    } @else if (failed) {
      <div class="alert alert-danger" role="alert">{{ 'email-templates-history-load-failed' | i18next }}</div>
    } @else {
      <p class="et-sub mb-3">{{ 'email-templates-history-intro' | i18next }}</p>
      <div class="table-responsive et-table-wrap">
        <table class="table et-table align-middle mb-0">
          <caption class="visually-hidden">
            {{
              'email-templates-history-caption' | i18next
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'email-templates-col-version' | i18next }}</th>
              <th scope="col">{{ 'email-templates-col-event' | i18next }}</th>
              <th scope="col">{{ 'email-templates-col-by' | i18next }}</th>
              <th scope="col">{{ 'email-templates-col-when' | i18next }}</th>
              <th scope="col">
                <span class="visually-hidden">{{ 'email-templates-col-actions' | i18next }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (entry of versions; track entry.version) {
              <tr [attr.data-version]="entry.version">
                <td class="text-nowrap">
                  <span class="et-version fw-semibold">v{{ entry.version }}</span>
                  @if (entry.live) {
                    <span class="et-badge et-badge-live ms-1">{{ 'email-templates-badge-live' | i18next }}</span>
                  }
                  @if (!entry.applied) {
                    <span class="et-badge et-badge-invalid ms-1">{{
                      'email-templates-badge-not-applied' | i18next
                    }}</span>
                  }
                </td>
                <td>
                  @switch (entry.event) {
                    @case ('reset') {
                      {{ 'email-templates-event-reset' | i18next }}
                    }
                    @case ('restore-published') {
                      {{ 'email-templates-event-restore-published' | i18next: { version: entry.restoredFromVersion } }}
                    }
                    @default {
                      {{ 'email-templates-event-publish' | i18next }}
                    }
                  }
                </td>
                <td>{{ entry.actorDisplayName || ('email-templates-unknown-actor' | i18next) }}</td>
                <td class="text-nowrap">{{ entry.createdAt | emailWhen }}</td>
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="view.emit(entry)">
                    {{ 'email-templates-action-view' | i18next }}
                    <span class="visually-hidden">v{{ entry.version }}</span>
                  </button>
                  @if (entry.event !== 'reset') {
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary ms-1"
                      [disabled]="!entry.applied || busy"
                      (click)="restore.emit(entry)"
                    >
                      {{ 'email-templates-action-restore' | i18next }}
                      <span class="visually-hidden">v{{ entry.version }}</span>
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="et-empty">{{ 'email-templates-history-empty' | i18next }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="et-sub mt-3 mb-0">{{ 'email-templates-history-retention' | i18next: { count: retention } }}</p>
    }
  `,
  styleUrls: ['./email-templates.shared.scss'],
})
export class HistoryPanelComponent {
  @Input() versions: EmailAdminHistory[] = [];
  @Input() loading = false;
  @Input() failed = false;
  @Input() busy = false;
  @Input() retention = 50;
  @Output() view = new EventEmitter<EmailAdminHistory>();
  @Output() restore = new EventEmitter<EmailAdminHistory>();
}
