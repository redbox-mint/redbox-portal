import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import {
  BulkTemplateUpgradePreview,
  BulkTemplateUpgradeRoleConflict,
  BulkTemplateUpgradeRolePreview,
  RoleImpactPreview,
} from '../authorization-admin.models';

@Component({
  selector: 'authorization-impact-preview',
  templateUrl: './impact-preview.component.html',
  styleUrls: ['./impact-preview.component.scss'],
  standalone: false,
})
export class ImpactPreviewComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) public preview!: RoleImpactPreview | BulkTemplateUpgradePreview;
  @Input() public pending = false;
  @Input() public confirmLabel = 'Apply confirmed change';
  @Input() public returnFocusTo?: HTMLElement;
  @Output() public readonly confirmed = new EventEmitter<void>();
  @Output() public readonly dismissed = new EventEmitter<void>();
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  public get rolePreview(): RoleImpactPreview | undefined {
    return 'current' in this.preview ? this.preview : undefined;
  }
  public get bulkPreview(): BulkTemplateUpgradePreview | undefined {
    return 'roles' in this.preview ? this.preview : undefined;
  }
  public get canConfirm(): boolean {
    return Boolean(this.preview.confirmationToken) && this.preview.fatalErrors.length === 0 && !this.pending;
  }
  public get showConfirm(): boolean {
    return (
      this.preview.operation !== 'role-delete' ||
      (Boolean(this.preview.confirmationToken) && this.preview.fatalErrors.length === 0)
    );
  }

  public describeBulkRole(role: BulkTemplateUpgradeRolePreview | BulkTemplateUpgradeRoleConflict): string {
    if ('conflict' in role) {
      return `Role ${role.roleId} — conflict: ${role.conflict.code}`;
    }
    return `${role.roleKey} — ${role.changed ? 'will change' : 'no change'}`;
  }

  public ngAfterViewInit(): void {
    queueMicrotask(() => this.dialog?.nativeElement.focus());
  }
  public ngOnDestroy(): void {
    setTimeout(() => this.returnFocusTo?.focus());
  }

  @HostListener('document:keydown.escape')
  public escape(): void {
    if (!this.pending) this.dismissed.emit();
  }

  public trapFocus(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const container = this.dialog?.nativeElement;
    if (!container) return;
    const controls = Array.from(container.querySelectorAll<HTMLElement>('button, [tabindex]')).filter(
      element => !element.hasAttribute('disabled') && element.tabIndex >= 0
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
