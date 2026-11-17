import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Only explicitly edited properties are emitted; optional/unknown config stays untouched. */
@Component({ selector: 'rb-navigation-fields', standalone: false, templateUrl: './navigation-fields.component.html' })
export class NavigationFieldsComponent {
  @Input() item: any = {};
  @Input() kind: 'link' | 'panel' | 'section' | 'header' = 'link';
  @Input() prefix = 'navigation';
  @Output() fieldChange = new EventEmitter<{ field: string; value: any }>();
  roleDraft = '';
  readonly presetIcons = [
    { css: 'icon-checklist icon-3x', labelKey: 'admin-navigation-icon-checklist' },
    { css: 'fa fa-sitemap fa-3x', labelKey: 'admin-navigation-icon-sitemap' },
    { css: 'fa fa-laptop fa-3x', labelKey: 'admin-navigation-icon-laptop' },
    { css: 'fa fa-rocket fa-3x', labelKey: 'admin-navigation-icon-rocket' },
    { css: 'fa fa-file fa-3x', labelKey: 'admin-navigation-icon-file' },
    { css: 'fa fa-folder fa-3x', labelKey: 'admin-navigation-icon-folder' },
    { css: 'fa fa-users fa-3x', labelKey: 'admin-navigation-icon-users' },
    { css: 'fa fa-cog fa-3x', labelKey: 'admin-navigation-icon-cog' },
    { css: 'fa fa-search fa-3x', labelKey: 'admin-navigation-icon-search' },
    { css: 'fa fa-database fa-3x', labelKey: 'admin-navigation-icon-database' },
  ];
  get fields(): string[] {
    return this.kind === 'header' ? ['titleKey', 'iconClass'] : this.kind === 'panel' ? ['id', 'titleKey', 'iconClass', 'columnClass'] : this.kind === 'section' ? ['id', 'titleKey'] : ['id', 'labelKey', 'href'];
  }
  get roles(): string[] { return [...new Set(['Admin', 'Librarians', 'Researcher', 'Guest', ...(this.item.requiredRoles || [])])]; }
  change(field: string, value: any): void { this.fieldChange.emit({ field, value }); }
  audience(value: string): void {
    this.change('requiresAuth', value === 'in');
    this.change('hideWhenAuth', value === 'out');
  }
  get audienceValue(): string { return this.item.hideWhenAuth ? 'out' : this.item.requiresAuth !== false ? 'in' : 'all'; }
  toggleRole(role: string): void {
    const roles = new Set<string>(this.item.requiredRoles || []);
    roles.has(role) ? roles.delete(role) : roles.add(role);
    this.change('requiredRoles', [...roles]);
  }
  addRole(): void {
    const role = this.roleDraft.trim();
    if (role) this.change('requiredRoles', [...new Set([...(this.item.requiredRoles || []), role])]);
    this.roleDraft = '';
  }
}
