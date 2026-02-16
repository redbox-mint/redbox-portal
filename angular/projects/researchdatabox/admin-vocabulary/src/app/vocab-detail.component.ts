import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { VocabularyDetail, VocabularyEntry } from './vocabulary-api.service';

interface PreviewTreeNode {
  id: string;
  display: string;
  children: PreviewTreeNode[];
}

@Component({
  selector: 'vocab-detail',
  templateUrl: './vocab-detail.component.html',
  styleUrls: ['./vocab-detail.component.scss'],
  standalone: false
})
export class VocabDetailComponent implements OnChanges {
  private tempIdCounter = 0;
  private parentEditorEntryId: string | null = null;
  private collapsedPreviewNodeIds = new Set<string>();
  isTreePreviewVisible = false;
  previewTree: PreviewTreeNode[] = [];

  @Input() draft: VocabularyDetail = {
    name: '',
    type: 'flat',
    source: 'local',
    entries: []
  };

  @Input() selectedVocabularyId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('draft' in changes) {
      this.ensureEntryIds();
    }
  }

  get hasEntries(): boolean {
    return !!this.draft.entries && this.draft.entries.length > 0;
  }

  addEntry(): void {
    if (!this.draft.entries) {
      this.draft.entries = [];
    }
    this.draft.entries.push({
      id: this.newTempId(),
      label: '',
      value: '',
      historical: false,
      order: this.draft.entries.length
    });
    this.refreshTreePreviewIfVisible();
  }

  removeEntry(index: number): void {
    if (!this.draft.entries) {
      return;
    }
    const removedEntryId = this.entryId(this.draft.entries[index]);
    if (removedEntryId && removedEntryId === this.parentEditorEntryId) {
      this.parentEditorEntryId = null;
    }
    if (removedEntryId) {
      this.draft.entries.forEach((entry: VocabularyEntry) => {
        if (entry.parent === removedEntryId) {
          entry.parent = null;
        }
      });
    }
    this.draft.entries.splice(index, 1);
    this.reindexEntries();
    this.refreshTreePreviewIfVisible();
  }

  moveEntryUp(index: number): void {
    if (!this.draft.entries || index <= 0) {
      return;
    }
    const list = this.draft.entries;
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    this.reindexEntries();
    this.refreshTreePreviewIfVisible();
  }

  moveEntryDown(index: number): void {
    if (!this.draft.entries || index >= this.draft.entries.length - 1) {
      return;
    }
    const list = this.draft.entries;
    [list[index], list[index + 1]] = [list[index + 1], list[index]];
    this.reindexEntries();
    this.refreshTreePreviewIfVisible();
  }

  trackByEntryIndex(index: number): number {
    return index;
  }

  getParentOptions(entry: VocabularyEntry): Array<{ id: string; label: string }> {
    if (!this.draft.entries || this.draft.type === 'flat') {
      return [];
    }

    const entryId = this.entryId(entry);
    if (!entryId) {
      return [];
    }
    const blockedIds = this.collectDescendantIds(entryId);
    blockedIds.add(entryId);

    return this.draft.entries
      .filter((candidate: VocabularyEntry) => {
        const candidateId = this.entryId(candidate);
        return !!candidateId && !blockedIds.has(candidateId);
      })
      .map((candidate: VocabularyEntry) => ({
        id: this.entryId(candidate)!,
        label: this.optionLabel(candidate)
      }));
  }

  onParentChanged(entry: VocabularyEntry, parentId: string): void {
    entry.parent = parentId || undefined;
    this.refreshTreePreviewIfVisible();
  }

  isParentEditorOpen(entry: VocabularyEntry): boolean {
    return this.parentEditorEntryId !== null && this.parentEditorEntryId === this.entryId(entry);
  }

  openParentEditor(entry: VocabularyEntry): void {
    this.parentEditorEntryId = this.entryId(entry) || null;
  }

  closeParentEditor(): void {
    this.parentEditorEntryId = null;
  }

  onEntryEdited(): void {
    this.refreshTreePreviewIfVisible();
  }

  toggleTreePreview(): void {
    this.isTreePreviewVisible = !this.isTreePreviewVisible;
    if (this.isTreePreviewVisible) {
      this.refreshTreePreview();
    }
  }

  refreshTreePreview(): void {
    this.previewTree = this.buildPreviewTree();
    this.syncCollapsedPreviewNodes();
  }

  trackByPreviewNode(_index: number, node: PreviewTreeNode): string {
    return node.id;
  }

  hasPreviewChildren(node: PreviewTreeNode): boolean {
    return node.children.length > 0;
  }

  isPreviewNodeCollapsed(node: PreviewTreeNode): boolean {
    return this.collapsedPreviewNodeIds.has(node.id);
  }

  togglePreviewNode(node: PreviewTreeNode): void {
    if (!this.hasPreviewChildren(node)) {
      return;
    }
    if (this.collapsedPreviewNodeIds.has(node.id)) {
      this.collapsedPreviewNodeIds.delete(node.id);
      return;
    }
    this.collapsedPreviewNodeIds.add(node.id);
  }

  parentDisplayValue(entry: VocabularyEntry): string {
    if (!entry.parent || !this.draft.entries) {
      return '';
    }
    const parent = this.draft.entries.find((candidate: VocabularyEntry) => this.entryId(candidate) === entry.parent);
    if (!parent) {
      return entry.parent;
    }
    return this.optionLabel(parent);
  }

  private reindexEntries(): void {
    if (!this.draft.entries) {
      return;
    }
    this.draft.entries = this.draft.entries.map((entry: VocabularyEntry, idx: number) => ({ ...entry, order: idx }));
    this.ensureEntryIds();

    if (this.parentEditorEntryId) {
      const stillExists = this.draft.entries.some((entry: VocabularyEntry) => this.entryId(entry) === this.parentEditorEntryId);
      if (!stillExists) {
        this.parentEditorEntryId = null;
      }
    }
  }

  private ensureEntryIds(): void {
    if (!this.draft.entries) {
      return;
    }
    this.draft.entries.forEach((entry: VocabularyEntry) => {
      if (!this.entryId(entry)) {
        entry.id = this.newTempId();
      }
      if (typeof entry.historical !== 'boolean') {
        entry.historical = false;
      }
    });
  }

  private refreshTreePreviewIfVisible(): void {
    if (this.isTreePreviewVisible) {
      this.refreshTreePreview();
    }
  }

  private syncCollapsedPreviewNodes(): void {
    const expandableIds = new Set<string>();
    const collect = (nodes: PreviewTreeNode[]): void => {
      nodes.forEach((node: PreviewTreeNode) => {
        if (node.children.length > 0) {
          expandableIds.add(node.id);
          collect(node.children);
        }
      });
    };
    collect(this.previewTree);

    this.collapsedPreviewNodeIds.forEach((id: string) => {
      if (!expandableIds.has(id)) {
        this.collapsedPreviewNodeIds.delete(id);
      }
    });
  }

  private newTempId(): string {
    const id = `tmp-${this.tempIdCounter}`;
    this.tempIdCounter += 1;
    return id;
  }

  private entryId(entry: VocabularyEntry): string | undefined {
    return typeof entry.id === 'string' && entry.id.trim() ? entry.id : undefined;
  }

  private optionLabel(entry: VocabularyEntry): string {
    const value = (entry.value || '').trim();
    const label = (entry.label || '').trim();
    if (value && label) {
      return `${value} - ${label}`;
    }
    return value || label || this.entryId(entry) || '';
  }

  private collectDescendantIds(entryId: string): Set<string> {
    const descendants = new Set<string>();
    if (!this.draft.entries || this.draft.entries.length === 0) {
      return descendants;
    }

    const parentToChildren = new Map<string, string[]>();
    this.draft.entries.forEach((entry: VocabularyEntry) => {
      const id = this.entryId(entry);
      const parentId = entry.parent;
      if (!id || !parentId) {
        return;
      }
      const children = parentToChildren.get(parentId) || [];
      children.push(id);
      parentToChildren.set(parentId, children);
    });

    const stack = [...(parentToChildren.get(entryId) || [])];
    while (stack.length > 0) {
      const childId = stack.pop()!;
      if (descendants.has(childId)) {
        continue;
      }
      descendants.add(childId);
      const grandChildren = parentToChildren.get(childId) || [];
      grandChildren.forEach((id: string) => stack.push(id));
    }

    return descendants;
  }

  private buildPreviewTree(): PreviewTreeNode[] {
    if (!this.draft.entries || this.draft.entries.length === 0 || this.draft.type !== 'tree') {
      return [];
    }

    this.ensureEntryIds();
    const entries = [...this.draft.entries].sort((a: VocabularyEntry, b: VocabularyEntry) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.label || '').localeCompare(b.label || '');
    });

    const nodesById = new Map<string, PreviewTreeNode>();
    entries.forEach((entry: VocabularyEntry) => {
      const id = this.entryId(entry);
      if (!id) {
        return;
      }
      nodesById.set(id, {
        id,
        display: this.optionLabel(entry),
        children: []
      });
    });

    const roots: PreviewTreeNode[] = [];
    entries.forEach((entry: VocabularyEntry) => {
      const id = this.entryId(entry);
      if (!id) {
        return;
      }
      const current = nodesById.get(id);
      if (!current) {
        return;
      }

      if (!entry.parent || entry.parent === id) {
        roots.push(current);
        return;
      }

      const parent = nodesById.get(entry.parent);
      if (!parent) {
        roots.push(current);
        return;
      }
      parent.children.push(current);
    });

    const attached = new Set<string>();
    const markAttached = (nodes: PreviewTreeNode[]): void => {
      nodes.forEach((node: PreviewTreeNode) => {
        if (attached.has(node.id)) {
          return;
        }
        attached.add(node.id);
        markAttached(node.children);
      });
    };
    markAttached(roots);

    nodesById.forEach((node: PreviewTreeNode, id: string) => {
      if (!attached.has(id)) {
        roots.push(node);
      }
    });

    return roots;
  }
}
