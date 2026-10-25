import { Component, DestroyRef, effect, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { RecordPermissionsComponentName } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../form.component';
import { FormComponentEventBus } from '../form-state';
import { RecordPermissionsService, RecordPermissionsSummary } from '../service/record-permissions.service';

@Component({
  selector: 'redbox-record-permissions',
  template: `
    @if (isVisible && getFormComponent.editMode()) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <section class="redbox-record-permissions" [attr.aria-busy]="loading()">
        @if (loading()) {
          <p role="status">{{ '@form-record-permissions-loading' | i18next }}</p>
        } @else if (failed()) {
          <p role="alert">{{ '@form-record-permissions-error' | i18next }}</p>
          <button type="button" class="btn btn-secondary" (click)="refresh()">
            {{ '@form-record-permissions-retry' | i18next }}
          </button>
        } @else {
          @if (!summary()) {
            <p role="status">{{ '@form-record-permissions-save-first' | i18next }}</p>
          }
          @for (table of userTables; track table.key) {
            <div class="table-responsive">
              <table class="table">
                <caption class="h4 caption-top">
                  {{
                    table.label | i18next
                  }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{{ 'form-record-permissions-usernametableheading' | i18next }}</th>
                    <th scope="col">{{ 'form-record-permissions-nametableheading' | i18next }}</th>
                    <th scope="col">{{ 'form-record-permissions-emailtableheading' | i18next }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (user of (summary()?.[table.key] ?? []); track $index) {
                    <tr>
                      <td>{{ user.username }}</td>
                      <td>{{ user.name }}</td>
                      <td>{{ user.email }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @for (table of stringTables; track table.key) {
            <div class="table-responsive">
              <table class="table">
                <caption class="h4 caption-top">
                  {{
                    table.label | i18next
                  }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{{ table.column | i18next }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (value of (summary()?.[table.key] ?? []); track $index) {
                    <tr>
                      <td>{{ value }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </section>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false,
})
export class RecordPermissionsComponent extends FormFieldBaseComponent<undefined> {
  protected override logName = RecordPermissionsComponentName;
  private readonly permissionsService = inject(RecordPermissionsService);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly summary = signal<RecordPermissionsSummary | null>(null);
  private requestVersion = 0;
  private pendingOid = '';

  readonly userTables = [
    { key: 'edit', label: 'form-record-permissions-usereditheading' },
    { key: 'view', label: 'form-record-permissions-userviewheading' },
  ] as const;
  readonly stringTables = [
    {
      key: 'editPending',
      label: 'form-record-permissions-userpendingeditheading',
      column: 'form-record-permissions-emailtableheading',
    },
    {
      key: 'viewPending',
      label: 'form-record-permissions-userpendingviewheading',
      column: 'form-record-permissions-emailtableheading',
    },
    {
      key: 'editRoles',
      label: 'form-record-permissions-roleeditheading',
      column: 'form-record-permissions-rolenametableheading',
    },
    {
      key: 'viewRoles',
      label: 'form-record-permissions-roleviewheading',
      column: 'form-record-permissions-rolenametableheading',
    },
  ] as const;

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected override async initData(): Promise<void> {
    // OID is reactive: the first successful create must load this summary too.
    effect(
      () => {
        void this.refresh();
      },
      { injector: this.injector }
    );
    this.eventBus
      .select$('form.save.success')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.refresh();
      });
    this.destroyRef.onDestroy(() => {
      ++this.requestVersion;
    });
  }

  public async refresh(): Promise<void> {
    const oid = this.getFormComponent.oid()?.trim() ?? '';
    if (!this.isVisible || !this.getFormComponent.editMode() || !oid) {
      ++this.requestVersion;
      this.pendingOid = '';
      this.summary.set(null);
      this.loading.set(false);
      this.failed.set(false);
      return;
    }
    // The OID effect and save event can describe the same first create.
    if (this.pendingOid === oid) return;
    const request = ++this.requestVersion;
    this.pendingOid = oid;
    this.summary.set(null);
    this.loading.set(true);
    this.failed.set(false);
    try {
      const summary = await this.permissionsService.getSummary(oid);
      if (request === this.requestVersion) this.summary.set(summary);
    } catch {
      if (request === this.requestVersion) this.failed.set(true);
    } finally {
      if (request === this.requestVersion) {
        this.pendingOid = '';
        this.loading.set(false);
      }
    }
  }
}
