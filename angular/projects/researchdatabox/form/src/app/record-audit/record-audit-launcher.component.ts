import { Component, inject, input, signal } from '@angular/core';
import { UserService } from '@researchdatabox/portal-ng-common';

@Component({
  selector: 'record-audit-launcher',
  templateUrl: './record-audit-launcher.component.html',
  styleUrls: ['./record-audit-launcher.component.scss'],
  standalone: false,
})
export class RecordAuditLauncherComponent {
  private readonly userService = inject(UserService);

  readonly oid = input<string>('');
  readonly branding = input<string>('');
  readonly portal = input<string>('');
  readonly allowedRoles = input<string[]>(['Admin', 'Librarians']);

  readonly isOpen = signal(false);
  readonly canView = signal(false);
  readonly isAdmin = signal(false);

  constructor() {
    this.initRoleResolution();
  }

  private async initRoleResolution(): Promise<void> {
    try {
      await this.userService.waitForInit();
      const res = await this.userService.getInfo();
      const user = (res as any)?.user ?? res;
      const userRoles = (user?.roles ?? []) as Array<{ name?: string }>;
      const allowed = this.allowedRoles();
      const matchedRoles = userRoles.filter(r => r.name && allowed.includes(r.name));
      this.canView.set(matchedRoles.length > 0);
      this.isAdmin.set(matchedRoles.some(r => r.name === 'Admin'));
    } catch {
      this.canView.set(false);
      this.isAdmin.set(false);
    }
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  openStandalonePage(): void {
    const url = `/${this.branding()}/${this.portal()}/record/viewAudit/${this.oid()}`;
    window.open(url, '_blank');
    this.close();
  }
}
