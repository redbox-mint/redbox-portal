/**
 * Menu Configuration Visual Editor
 * 
 * A custom Formly field type that provides a user-friendly visual editor
 * for managing navigation menu items with support for:
 * - Collapsible menu items
 * - Nested children (dropdown menus)
 * - Live preview
 * - Drag-and-drop reordering (future enhancement)
 */
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import { MenuItem } from './menu-item.interface';

@Component({
  selector: 'formly-menu-editor-type',
  templateUrl: './menu-editor.type.html',
  styleUrls: ['./menu-editor.type.scss'],
  standalone: false
})
export class MenuEditorTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  /** Currently expanded item indices */
  expandedItems: Set<number> = new Set([0]);
  
  /** Resolve translation labels in preview */
  resolveTranslations = true;
  
  /** Available roles for selection */
  availableRoles: string[] = ['Admin', 'Librarians', 'Researcher', 'Guest'];
  
  /** Child editor modal state */
  childEditorState: {
    visible: boolean;
    mode: 'add' | 'edit';
    parentIndex: number;
    childIndex: number;
    item: Partial<MenuItem>;
  } = {
    visible: false,
    mode: 'add',
    parentIndex: -1,
    childIndex: -1,
    item: {}
  };

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    // Initialize model if empty
    if (!this.model || !this.model[this.key as string]) {
      this.formControl.setValue([]);
    }
  }

  get items(): MenuItem[] {
    return this.formControl.value || [];
  }

  get showSearch(): boolean {
    // Access the parent model to get showSearch value
    return this.model?.showSearch ?? true;
  }

  onShowSearchToggle(value: boolean): void {
    this.updateShowSearch(value);
  }

  private updateShowSearch(value: boolean): void {
    const parentControl: any = this.formControl?.parent;
    const showSearchControl = parentControl?.get ? parentControl.get('showSearch') : null;

    if (showSearchControl) {
      showSearchControl.setValue(value);
      showSearchControl.markAsDirty();
      showSearchControl.markAsTouched();
    }

    if (this.model) {
      (this.model as any).showSearch = value;
    }
  }

  toggleItem(index: number): void {
    if (this.expandedItems.has(index)) {
      this.expandedItems.delete(index);
    } else {
      this.expandedItems.add(index);
    }
  }

  isExpanded(index: number): boolean {
    return this.expandedItems.has(index);
  }

  addItem(): void {
    const newItem: MenuItem = {
      id: `new-item-${Date.now()}`,
      labelKey: 'new-menu-item',
      href: '/',
      requiresAuth: true,
      children: []
    };
    const items = [...this.items, newItem];
    this.formControl.setValue(items);
    this.expandedItems.add(items.length - 1);
    this.formControl.markAsDirty();
  }

  removeItem(index: number): void {
    const items = this.items.filter((_, i) => i !== index);
    this.formControl.setValue(items);
    this.expandedItems.delete(index);
    // Adjust expanded indices
    const newExpanded = new Set<number>();
    this.expandedItems.forEach(i => {
      if (i < index) newExpanded.add(i);
      else if (i > index) newExpanded.add(i - 1);
    });
    this.expandedItems = newExpanded;
    this.formControl.markAsDirty();
  }

  duplicateItem(index: number): void {
    const item = { ...this.items[index] };
    item.id = `${item.id}-copy-${Date.now()}`;
    if (item.children) {
      item.children = item.children.map((child: MenuItem) => ({
        ...child,
        id: `${child.id}-copy`
      }));
    }
    const items = [...this.items];
    items.splice(index + 1, 0, item);
    this.formControl.setValue(items);
    this.expandedItems.add(index + 1);
    this.formControl.markAsDirty();
  }

  moveItem(index: number, direction: 'up' | 'down'): void {
    const items = [...this.items];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    this.formControl.setValue(items);
    
    // Update expanded state
    const wasExpanded = this.expandedItems.has(index);
    const targetWasExpanded = this.expandedItems.has(newIndex);
    this.expandedItems.delete(index);
    this.expandedItems.delete(newIndex);
    if (wasExpanded) this.expandedItems.add(newIndex);
    if (targetWasExpanded) this.expandedItems.add(index);
    
    this.formControl.markAsDirty();
  }

  updateItemField(index: number, field: keyof MenuItem, value: any): void {
    const items = [...this.items];
    items[index] = { ...items[index], [field]: value };
    this.formControl.setValue(items);
    this.formControl.markAsDirty();
  }

  toggleRole(index: number, role: string): void {
    const items = [...this.items];
    const item = { ...items[index] };
    const roles = new Set(item.requiredRoles || []);
    
    if (roles.has(role)) {
      roles.delete(role);
    } else {
      roles.add(role);
    }
    
    item.requiredRoles = Array.from(roles);
    items[index] = item;
    this.formControl.setValue(items);
    this.formControl.markAsDirty();
  }

  hasRole(index: number, role: string): boolean {
    return this.items[index]?.requiredRoles?.includes(role) || false;
  }

  // Child item management
  openChildEditor(parentIndex: number, childIndex: number = -1): void {
    const parent = this.items[parentIndex];
    const isEdit = childIndex >= 0;
    
    this.childEditorState = {
      visible: true,
      mode: isEdit ? 'edit' : 'add',
      parentIndex,
      childIndex,
      item: isEdit && parent.children
        ? { ...parent.children[childIndex] }
        : {
            id: `${parent.id}-child-${Date.now()}`,
            labelKey: '',
            href: '',
            requiresAuth: true
          }
    };
    this.cdr.detectChanges();
  }

  closeChildEditor(): void {
    this.childEditorState.visible = false;
    this.cdr.detectChanges();
  }

  saveChildItem(): void {
    const { parentIndex, childIndex, item, mode } = this.childEditorState;
    const items = [...this.items];
    const parent = { ...items[parentIndex] };
    const children = [...(parent.children || [])];

    if (mode === 'add') {
      children.push(item as MenuItem);
    } else {
      children[childIndex] = item as MenuItem;
    }

    parent.children = children;
    items[parentIndex] = parent;
    this.formControl.setValue(items);
    this.formControl.markAsDirty();
    this.closeChildEditor();
  }

  removeChild(parentIndex: number, childIndex: number): void {
    const items = [...this.items];
    const parent = { ...items[parentIndex] };
    parent.children = (parent.children || []).filter((_: MenuItem, i: number) => i !== childIndex);
    items[parentIndex] = parent;
    this.formControl.setValue(items);
    this.formControl.markAsDirty();
  }

  moveChild(parentIndex: number, childIndex: number, direction: 'up' | 'down'): void {
    const items = [...this.items];
    const parent = { ...items[parentIndex] };
    const children = [...(parent.children || [])];
    const newIndex = direction === 'up' ? childIndex - 1 : childIndex + 1;
    
    if (newIndex < 0 || newIndex >= children.length) return;
    
    [children[childIndex], children[newIndex]] = [children[newIndex], children[childIndex]];
    parent.children = children;
    items[parentIndex] = parent;
    this.formControl.setValue(items);
    this.formControl.markAsDirty();
  }

  // Preview helpers
  getResolvedLabel(labelKey: string): string {
    if (!this.resolveTranslations) return labelKey;
    // Simple label resolution - in production this would use TranslationService
    return labelKey
      .replace(/^menu-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  getAuthenticatedItems(): MenuItem[] {
    return this.items.filter(item => 
      item.requiresAuth !== false && !item.hideWhenAuth
    );
  }

  getAnonymousItems(): MenuItem[] {
    return this.items.filter(item => 
      !item.requiresAuth || item.hideWhenAuth
    );
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackById(index: number, item: MenuItem): string {
    return item.id || index.toString();
  }
}
