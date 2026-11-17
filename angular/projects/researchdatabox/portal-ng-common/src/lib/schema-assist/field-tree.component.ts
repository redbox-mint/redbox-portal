import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { I18NextPipe } from '../i18next.pipe';
import { FieldNode, FieldRow, buildFieldTree, searchFieldRows, visibleFieldRows } from './field-tree';
import type { ContextSchemaField } from '@researchdatabox/sails-ng-common';

let nextTreeId = 0;

/**
 * Browsable, searchable field list. The feature adapter supplies insertion syntax,
 * roots and expansion choices. Groups expand and collapse.
 */
@Component({
  selector: 'rb-field-tree, email-templates-field-tree',
  standalone: true,
  imports: [I18NextPipe],
  templateUrl: './field-tree.component.html',
  styleUrls: ['./field-tree.component.scss'],
})
export class FieldTreeComponent implements OnChanges {
  @Input() idPrefix = `schema-fields-${++nextTreeId}`;
  @Input() fields: ContextSchemaField[] = [];
  @Input() roots: string[] = [];
  @Input() disabled = false;
  @Input() initialExpanded: string[] = [];
  @Input() aliasRoots: string[] = [];
  @Input() insertion: (node: FieldNode) => string | null = node => node.path;
  @Input() translationPrefix = 'schema-assist';
  @Output() insert = new EventEmitter<string>();

  nodes: FieldNode[] = [];
  rows: FieldRow[] = [];
  query = '';
  fieldCount = 0;
  private expanded = new Set<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialExpanded']) this.expanded = new Set(this.initialExpanded);
    if (changes['fields'] || changes['roots']) {
      this.nodes = buildFieldTree(this.fields, this.roots);
      this.fieldCount = this.fields.length + this.roots.filter(root => !this.fields.some(f => f.path === root)).length;
    }
    if (changes['fields'] || changes['roots'] || changes['initialExpanded'] || changes['aliasRoots']) this.refresh();
  }

  get searching(): boolean {
    return this.query.trim() !== '';
  }

  isExpanded(node: FieldNode): boolean {
    return this.expanded.has(node.path);
  }

  /** Objects open and close from their name; lists and values insert. */
  isGroup(node: FieldNode): boolean {
    return node.children.length > 0 && !node.isArray;
  }

  toggle(node: FieldNode): void {
    if (this.expanded.has(node.path)) this.expanded.delete(node.path);
    else this.expanded.add(node.path);
    this.refresh();
  }

  choose(node: FieldNode): void {
    if (this.isGroup(node)) {
      if (this.searching) this.reveal(node);
      else this.toggle(node);
      return;
    }
    const text = this.disabled ? null : this.insertion(node);
    if (text !== null) this.insert.emit(text);
  }

  /** Leave search and show a group in place, its ancestors expanded. */
  reveal(node: FieldNode): void {
    let cut = node.path.indexOf('.');
    while (cut > 0) {
      this.expanded.add(node.path.slice(0, cut).replace(/\[\]$/, ''));
      cut = node.path.indexOf('.', cut + 1);
    }
    this.expanded.add(node.path);
    this.query = '';
    this.refresh();
  }

  onSearch(value: string): void {
    this.query = value;
    this.refresh();
  }

  onEscape(event: Event, input: HTMLInputElement): void {
    if (!this.searching) return;
    event.preventDefault();
    this.clearSearch(input);
  }

  clearSearch(input: HTMLInputElement): void {
    this.onSearch('');
    input.value = '';
    input.focus();
  }

  /** Search results show the full path, allowed to wrap only after a dot. */
  displayPath(node: FieldNode): string {
    return node.path.replace(/\./g, '.\u200b');
  }

  hint(node: FieldNode): string | null {
    return [node.title, node.description].filter(Boolean).join(' — ') || null;
  }

  private refresh(): void {
    this.rows = this.searching
      ? searchFieldRows(this.nodes, this.query, 100, this.aliasRoots)
      : visibleFieldRows(this.nodes, this.expanded);
  }
}
