/**
 * Admin Sidebar Configuration Visual Editor
 * 
 * A custom Formly field type that provides a user-friendly visual editor
 * for managing admin sidebar configuration with support for:
 * - Header configuration
 * - Collapsible sections with items
 * - Footer links
 * - Live preview
 */
import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import { AdminSidebarItem, AdminSidebarSection, AdminSidebarHeader } from './admin-sidebar-item.interface';

@Component({
  selector: 'formly-admin-sidebar-editor-type',
  templateUrl: './admin-sidebar-editor.type.html',
  styleUrls: ['./admin-sidebar-editor.type.scss'],
  standalone: false
})
export class AdminSidebarEditorTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  @ViewChild('modalDialog') modalDialog?: ElementRef;
  private previousActiveElement: HTMLElement | null = null;

  /** Currently expanded section indices */
  expandedSections: Set<number> = new Set([0]);
  
  /** Currently expanded footer link indices */
  expandedFooterLinks: Set<number> = new Set();
  
  /** Resolve translation labels in preview */
  resolveTranslations = true;
  
  /** Available roles for selection */
  availableRoles: string[] = ['Admin', 'Librarians', 'Researcher', 'Guest'];
  
  /** Item editor modal state */
  itemEditorState: {
    visible: boolean;
    mode: 'add' | 'edit';
    context: 'section' | 'footer';
    sectionIndex: number;
    itemIndex: number;
    item: Partial<AdminSidebarItem>;
  } = {
    visible: false,
    mode: 'add',
    context: 'section',
    sectionIndex: -1,
    itemIndex: -1,
    item: {}
  };

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    // Initialize model defaults if needed
    if (!this.header) {
      this.updateHeader({ titleKey: 'menu-admin', iconClass: 'fa fa-cog' });
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (!this.itemEditorState.visible || !this.modalDialog) return;

    if (event.key === 'Escape') {
      this.closeItemEditor();
      return;
    }

    if (event.key === 'Tab') {
      const dialogElement = this.modalDialog.nativeElement;
      const focusableElements = dialogElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          event.preventDefault();
        }
      }
    }
  }

  // ============ Header Accessors ============
  
  get header(): AdminSidebarHeader | undefined {
    return this.model?.header;
  }

  updateHeader(header: AdminSidebarHeader): void {
    const parentControl = this.formControl?.parent as FormGroup | null;
    const headerControl = parentControl?.get ? parentControl.get('header') : null;

    if (headerControl) {
      headerControl.setValue(header);
      headerControl.markAsDirty();
      headerControl.markAsTouched();
    }

    if (this.model) {
      this.model.header = header;
    }
  }

  updateHeaderField(field: keyof AdminSidebarHeader, value: string): void {
    const currentHeader = this.header || { titleKey: 'menu-admin', iconClass: 'fa fa-cog' };
    this.updateHeader({ ...currentHeader, [field]: value });
  }

  // ============ Sections Accessors ============
  
  get sections(): AdminSidebarSection[] {
    return this.model?.sections || [];
  }

  private updateSections(sections: AdminSidebarSection[]): void {
    const parentControl: any = this.formControl?.parent;
    const sectionsControl = parentControl?.get ? parentControl.get('sections') : null;

    if (sectionsControl) {
      sectionsControl.setValue(sections);
      sectionsControl.markAsDirty();
      sectionsControl.markAsTouched();
    }

    if (this.model) {
      (this.model as any).sections = sections;
    }
  }

  // ============ Footer Links Accessors ============
  
  get footerLinks(): AdminSidebarItem[] {
    return this.model?.footerLinks || [];
  }

  private updateFooterLinks(links: AdminSidebarItem[]): void {
    const parentControl: any = this.formControl?.parent;
    const footerLinksControl = parentControl?.get ? parentControl.get('footerLinks') : null;

    if (footerLinksControl) {
      footerLinksControl.setValue(links);
      footerLinksControl.markAsDirty();
      footerLinksControl.markAsTouched();
    }

    if (this.model) {
      (this.model as any).footerLinks = links;
    }
  }

  // ============ Section Management ============
  
  toggleSection(index: number): void {
    if (this.expandedSections.has(index)) {
      this.expandedSections.delete(index);
    } else {
      this.expandedSections.add(index);
    }
  }

  isSectionExpanded(index: number): boolean {
    return this.expandedSections.has(index);
  }

  addSection(): void {
    const newSection: AdminSidebarSection = {
      id: `new-section-${Date.now()}`,
      titleKey: 'new-section-title',
      defaultExpanded: true,
      items: []
    };
    const sections = [...this.sections, newSection];
    this.updateSections(sections);
    this.expandedSections.add(sections.length - 1);
  }

  removeSection(index: number): void {
    const sections = this.sections.filter((_, i) => i !== index);
    this.updateSections(sections);
    this.expandedSections.delete(index);
    // Adjust expanded indices
    const newExpanded = new Set<number>();
    this.expandedSections.forEach(i => {
      if (i < index) newExpanded.add(i);
      else if (i > index) newExpanded.add(i - 1);
    });
    this.expandedSections = newExpanded;
  }

  duplicateSection(index: number): void {
    const section = { ...this.sections[index] };
    section.id = `${section.id}-copy-${Date.now()}`;
    section.items = section.items.map((item: AdminSidebarItem) => ({
      ...item,
      id: item.id ? `${item.id}-copy` : undefined
    }));
    const sections = [...this.sections];
    sections.splice(index + 1, 0, section);
    this.updateSections(sections);
    this.expandedSections.add(index + 1);
  }

  moveSection(index: number, direction: 'up' | 'down'): void {
    const sections = [...this.sections];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    
    [sections[index], sections[newIndex]] = [sections[newIndex], sections[index]];
    this.updateSections(sections);
    
    // Update expanded state
    const wasExpanded = this.expandedSections.has(index);
    const targetWasExpanded = this.expandedSections.has(newIndex);
    this.expandedSections.delete(index);
    this.expandedSections.delete(newIndex);
    if (wasExpanded) this.expandedSections.add(newIndex);
    if (targetWasExpanded) this.expandedSections.add(index);
  }

  updateSectionField(index: number, field: keyof AdminSidebarSection, value: any): void {
    const sections = [...this.sections];
    sections[index] = { ...sections[index], [field]: value };
    this.updateSections(sections);
  }

  toggleSectionRole(index: number, role: string): void {
    const sections = [...this.sections];
    const section = { ...sections[index] };
    const roles = new Set(section.requiredRoles || []);
    
    if (roles.has(role)) {
      roles.delete(role);
    } else {
      roles.add(role);
    }
    
    section.requiredRoles = Array.from(roles);
    sections[index] = section;
    this.updateSections(sections);
  }

  sectionHasRole(index: number, role: string): boolean {
    return this.sections[index]?.requiredRoles?.includes(role) || false;
  }

  // ============ Section Item Management ============
  
  openItemEditor(sectionIndex: number, itemIndex: number = -1): void {
    this.previousActiveElement = document.activeElement as HTMLElement;
    const section = this.sections[sectionIndex];
    
    // Validate edit request
    const isEditRequest = itemIndex >= 0;
    const hasItems = section && Array.isArray(section.items);
    const isValidIndex = hasItems && itemIndex < section.items.length;
    
    const isEdit = isEditRequest && isValidIndex;
    
    this.itemEditorState = {
      visible: true,
      mode: isEdit ? 'edit' : 'add',
      context: 'section',
      sectionIndex,
      itemIndex: isEdit ? itemIndex : -1,
      item: isEdit && section.items
        ? { ...section.items[itemIndex] }
        : {
            id: `${section?.id || 'section'}-item-${Date.now()}`,
            labelKey: '',
            href: '',
            requiresAuth: true
          }
    };
    this.cdr.detectChanges();
    this.focusFirstModalElement();
  }

  closeItemEditor(): void {
    this.itemEditorState.visible = false;
    this.cdr.detectChanges();
    
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
      this.previousActiveElement = null;
    }
  }

  private focusFirstModalElement(): void {
    setTimeout(() => {
      if (this.modalDialog) {
        const focusable = this.modalDialog.nativeElement.querySelector('input, button, [href], [tabindex]:not([tabindex="-1"])');
        if (focusable) {
          focusable.focus();
        } else {
          this.modalDialog.nativeElement.focus();
        }
      }
    });
  }

  saveItem(): void {
    const { sectionIndex, itemIndex, item, mode, context } = this.itemEditorState;
    
    // Validate required fields
    if (!item.labelKey?.trim() || !item.href?.trim()) {
      console.error('Item must have labelKey and href');
      return;
    }
    
    if (context === 'section') {
      const sections = [...this.sections];
      const section = { ...sections[sectionIndex] };
      const items = [...(section.items || [])];

      if (mode === 'add') {
        items.push(item as AdminSidebarItem);
      } else {
        items[itemIndex] = item as AdminSidebarItem;
      }

      section.items = items;
      sections[sectionIndex] = section;
      this.updateSections(sections);
    } else {
      const links = [...this.footerLinks];
      if (mode === 'add') {
        links.push(item as AdminSidebarItem);
      } else {
        links[itemIndex] = item as AdminSidebarItem;
      }
      this.updateFooterLinks(links);
    }
    
    this.closeItemEditor();
  }

  removeItem(sectionIndex: number, itemIndex: number): void {
    const sections = [...this.sections];
    const section = { ...sections[sectionIndex] };
    section.items = (section.items || []).filter((_: AdminSidebarItem, i: number) => i !== itemIndex);
    sections[sectionIndex] = section;
    this.updateSections(sections);
  }

  moveItem(sectionIndex: number, itemIndex: number, direction: 'up' | 'down'): void {
    const sections = [...this.sections];
    const section = { ...sections[sectionIndex] };
    const items = [...(section.items || [])];
    const newIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    
    if (newIndex < 0 || newIndex >= items.length) return;
    
    [items[itemIndex], items[newIndex]] = [items[newIndex], items[itemIndex]];
    section.items = items;
    sections[sectionIndex] = section;
    this.updateSections(sections);
  }

  // ============ Footer Link Management ============
  
  toggleFooterLink(index: number): void {
    if (this.expandedFooterLinks.has(index)) {
      this.expandedFooterLinks.delete(index);
    } else {
      this.expandedFooterLinks.add(index);
    }
  }

  isFooterLinkExpanded(index: number): boolean {
    return this.expandedFooterLinks.has(index);
  }

  addFooterLink(): void {
    const newLink: AdminSidebarItem = {
      id: `footer-link-${Date.now()}`,
      labelKey: 'new-footer-link',
      href: '/',
      requiresAuth: true
    };
    const links = [...this.footerLinks, newLink];
    this.updateFooterLinks(links);
    this.expandedFooterLinks.add(links.length - 1);
  }

  removeFooterLink(index: number): void {
    const links = this.footerLinks.filter((_, i) => i !== index);
    this.updateFooterLinks(links);
    this.expandedFooterLinks.delete(index);
    // Adjust expanded indices
    const newExpanded = new Set<number>();
    this.expandedFooterLinks.forEach(i => {
      if (i < index) newExpanded.add(i);
      else if (i > index) newExpanded.add(i - 1);
    });
    this.expandedFooterLinks = newExpanded;
  }

  moveFooterLink(index: number, direction: 'up' | 'down'): void {
    const links = [...this.footerLinks];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= links.length) return;
    
    [links[index], links[newIndex]] = [links[newIndex], links[index]];
    this.updateFooterLinks(links);
    
    // Update expanded state
    const wasExpanded = this.expandedFooterLinks.has(index);
    const targetWasExpanded = this.expandedFooterLinks.has(newIndex);
    this.expandedFooterLinks.delete(index);
    this.expandedFooterLinks.delete(newIndex);
    if (wasExpanded) this.expandedFooterLinks.add(newIndex);
    if (targetWasExpanded) this.expandedFooterLinks.add(index);
  }

  updateFooterLinkField(index: number, field: keyof AdminSidebarItem, value: any): void {
    const links = [...this.footerLinks];
    links[index] = { ...links[index], [field]: value };
    this.updateFooterLinks(links);
  }

  openFooterLinkEditor(itemIndex: number = -1): void {
    this.previousActiveElement = document.activeElement as HTMLElement;
    
    // Validate edit request
    const isEditRequest = itemIndex >= 0;
    const isValidIndex = isEditRequest && itemIndex < this.footerLinks.length;
    const isEdit = isEditRequest && isValidIndex;
    
    this.itemEditorState = {
      visible: true,
      mode: isEdit ? 'edit' : 'add',
      context: 'footer',
      sectionIndex: -1,
      itemIndex: isEdit ? itemIndex : -1,
      item: isEdit
        ? { ...this.footerLinks[itemIndex] }
        : {
            id: `footer-link-${Date.now()}`,
            labelKey: '',
            href: '',
            requiresAuth: true
          }
    };
    this.cdr.detectChanges();
    this.focusFirstModalElement();
  }

  // ============ Preview Helpers ============
  
  getResolvedLabel(labelKey: string): string {
    if (!this.resolveTranslations) return labelKey;
    // Simple label resolution - in production this would use TranslationService
    return labelKey
      .replace(/^menu-/, '')
      .replace(/^admin-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  getVisibleSections(): AdminSidebarSection[] {
    // Filter sections based on visibility criteria for preview
    return this.sections.filter(section => 
      section.requiresAuth !== false && !section.hideWhenAuth
    );
  }

  getVisibleItems(section: AdminSidebarSection): AdminSidebarItem[] {
    return (section.items || []).filter(item =>
      item.requiresAuth !== false && !item.hideWhenAuth
    );
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackById(index: number, item: AdminSidebarSection | AdminSidebarItem): string {
    return (item as any).id || index.toString();
  }
}
