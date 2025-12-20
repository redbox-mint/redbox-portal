/**
 * Home Panels Configuration Visual Editor
 * 
 * A custom Formly field type that provides a user-friendly visual editor
 * for managing home panels with support for:
 * - Collapsible panel cards
 * - Nested panel items
 * - Live preview with panel grid layout
 * - Drag-and-drop reordering (future enhancement)
 */
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import { HomePanel, HomePanelItem } from './home-panel.interface';

@Component({
  selector: 'formly-home-panels-editor-type',
  templateUrl: './home-panels-editor.type.html',
  styleUrls: ['./home-panels-editor.type.scss'],
  standalone: false
})
export class HomePanelsEditorTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  /** Currently expanded panel indices */
  expandedPanels: Set<number> = new Set([0]);
  
  /** Resolve translation labels in preview */
  resolveTranslations = true;
  
  /** Available roles for selection */
  availableRoles: string[] = ['Admin', 'Librarians', 'Researcher', 'Guest'];
  
  /** Common icon classes for quick selection */
  commonIcons: string[] = [
    'icon-checklist icon-3x',
    'fa fa-sitemap fa-3x',
    'fa fa-laptop fa-3x',
    'fa fa-rocket fa-3x',
    'fa fa-file fa-3x',
    'fa fa-folder fa-3x',
    'fa fa-users fa-3x',
    'fa fa-cog fa-3x',
    'fa fa-search fa-3x',
    'fa fa-database fa-3x'
  ];

  /** Item editor modal state */
  itemEditorState: {
    visible: boolean;
    mode: 'add' | 'edit';
    panelIndex: number;
    itemIndex: number;
    item: Partial<HomePanelItem>;
  } = {
    visible: false,
    mode: 'add',
    panelIndex: -1,
    itemIndex: -1,
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

  get panels(): HomePanel[] {
    return this.formControl.value || [];
  }

  togglePanel(index: number): void {
    if (this.expandedPanels.has(index)) {
      this.expandedPanels.delete(index);
    } else {
      this.expandedPanels.add(index);
    }
  }

  isPanelExpanded(index: number): boolean {
    return this.expandedPanels.has(index);
  }

  addPanel(): void {
    const newPanel: HomePanel = {
      id: `panel-${Date.now()}`,
      titleKey: 'new-panel',
      iconClass: 'fa fa-folder fa-3x',
      columnClass: 'col-md-3 homepanel',
      items: []
    };
    const panels = [...this.panels, newPanel];
    this.formControl.setValue(panels);
    this.expandedPanels.add(panels.length - 1);
    this.formControl.markAsDirty();
  }

  removePanel(index: number): void {
    const panels = this.panels.filter((_, i) => i !== index);
    this.formControl.setValue(panels);
    this.expandedPanels.delete(index);
    // Adjust expanded indices
    const newExpanded = new Set<number>();
    this.expandedPanels.forEach(i => {
      if (i < index) newExpanded.add(i);
      else if (i > index) newExpanded.add(i - 1);
    });
    this.expandedPanels = newExpanded;
    this.formControl.markAsDirty();
  }

  duplicatePanel(index: number): void {
    const panel = { ...this.panels[index] };
    panel.id = `${panel.id}-copy-${Date.now()}`;
    panel.items = panel.items.map((item: HomePanelItem) => ({
      ...item,
      id: item.id ? `${item.id}-copy` : undefined
    }));
    const panels = [...this.panels];
    panels.splice(index + 1, 0, panel);
    this.formControl.setValue(panels);
    this.expandedPanels.add(index + 1);
    this.formControl.markAsDirty();
  }

  movePanel(index: number, direction: 'up' | 'down'): void {
    const panels = [...this.panels];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= panels.length) return;
    
    [panels[index], panels[newIndex]] = [panels[newIndex], panels[index]];
    this.formControl.setValue(panels);
    
    // Update expanded state
    const wasExpanded = this.expandedPanels.has(index);
    const targetWasExpanded = this.expandedPanels.has(newIndex);
    this.expandedPanels.delete(index);
    this.expandedPanels.delete(newIndex);
    if (wasExpanded) this.expandedPanels.add(newIndex);
    if (targetWasExpanded) this.expandedPanels.add(index);
    
    this.formControl.markAsDirty();
  }

  updatePanelField(index: number, field: keyof HomePanel, value: any): void {
    const panels = [...this.panels];
    panels[index] = { ...panels[index], [field]: value };
    this.formControl.setValue(panels);
    this.formControl.markAsDirty();
  }

  // Item management
  openItemEditor(panelIndex: number, itemIndex: number = -1): void {
    const panel = this.panels[panelIndex];
    const isEdit = itemIndex >= 0;
    
    this.itemEditorState = {
      visible: true,
      mode: isEdit ? 'edit' : 'add',
      panelIndex,
      itemIndex,
      item: isEdit && panel.items
        ? { ...panel.items[itemIndex] }
        : {
            id: `${panel.id}-item-${Date.now()}`,
            labelKey: '',
            href: '',
            requiresAuth: true
          }
    };
    this.cdr.detectChanges();
  }

  closeItemEditor(): void {
    this.itemEditorState.visible = false;
    this.cdr.detectChanges();
  }

  saveItem(): void {
    const { panelIndex, itemIndex, item, mode } = this.itemEditorState;
    const panels = [...this.panels];
    const panel = { ...panels[panelIndex] };
    const items = [...(panel.items || [])];

    if (mode === 'add') {
      items.push(item as HomePanelItem);
    } else {
      items[itemIndex] = item as HomePanelItem;
    }

    panel.items = items;
    panels[panelIndex] = panel;
    this.formControl.setValue(panels);
    this.formControl.markAsDirty();
    this.closeItemEditor();
  }

  removeItem(panelIndex: number, itemIndex: number): void {
    const panels = [...this.panels];
    const panel = { ...panels[panelIndex] };
    panel.items = (panel.items || []).filter((_: HomePanelItem, i: number) => i !== itemIndex);
    panels[panelIndex] = panel;
    this.formControl.setValue(panels);
    this.formControl.markAsDirty();
  }

  moveItem(panelIndex: number, itemIndex: number, direction: 'up' | 'down'): void {
    const panels = [...this.panels];
    const panel = { ...panels[panelIndex] };
    const items = [...(panel.items || [])];
    const newIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    
    if (newIndex < 0 || newIndex >= items.length) return;
    
    [items[itemIndex], items[newIndex]] = [items[newIndex], items[itemIndex]];
    panel.items = items;
    panels[panelIndex] = panel;
    this.formControl.setValue(panels);
    this.formControl.markAsDirty();
  }

  toggleItemRole(role: string): void {
    const item = this.itemEditorState.item;
    const roles = new Set(item.requiredRoles || []);
    
    if (roles.has(role)) {
      roles.delete(role);
    } else {
      roles.add(role);
    }
    
    item.requiredRoles = Array.from(roles);
  }

  hasItemRole(role: string): boolean {
    return this.itemEditorState.item?.requiredRoles?.includes(role) || false;
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

  getAuthenticatedPanels(): HomePanel[] {
    return this.panels.map(panel => ({
      ...panel,
      items: panel.items.filter(item => 
        item.requiresAuth !== false && !item.hideWhenAuth
      )
    })).filter(panel => panel.items.length > 0);
  }

  getAnonymousPanels(): HomePanel[] {
    return this.panels.map(panel => ({
      ...panel,
      items: panel.items.filter(item => 
        !item.requiresAuth || item.hideWhenAuth
      )
    })).filter(panel => panel.items.length > 0);
  }

  getIconPreviewClass(iconClass: string): string {
    // Convert from panel size to preview size
    return iconClass.replace('fa-3x', 'fa-lg').replace('icon-3x', 'icon-lg');
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackById(index: number, item: HomePanel | HomePanelItem): string {
    return item.id || index.toString();
  }
}
