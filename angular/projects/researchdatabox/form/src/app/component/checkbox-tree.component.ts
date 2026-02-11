import { Component, Input, Injector, inject } from "@angular/core";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel, HandlebarsTemplateService } from "@researchdatabox/portal-ng-common";
import {
  CheckboxTreeComponentName,
  CheckboxTreeFieldComponentConfig,
  CheckboxTreeModelName,
  CheckboxTreeModelValueType,
  CheckboxTreeNode,
  CheckboxTreeSelectedItem
} from "@researchdatabox/sails-ng-common";
import { FormComponent } from "../form.component";
import { VocabTreeService, VocabTreeApiNode } from "../service/vocab-tree.service";

type CheckboxTreeRenderNode = CheckboxTreeNode & { children?: CheckboxTreeRenderNode[]; displayLabel: string };

export class CheckboxTreeModel extends FormFieldModel<CheckboxTreeModelValueType> {
  protected override logName = CheckboxTreeModelName;
}

@Component({
  selector: "redbox-checkbox-tree",
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <div class="redbox-checkbox-tree" role="tree" [attr.aria-label]="label || name || 'Checkbox tree'" (keydown)="onTreeKeydown($event)">
        @if (rootLoading) {
          <div class="rb-tree-status rb-tree-status-muted">Loading vocabulary tree...</div>
        }
        <ng-container *ngTemplateOutlet="treeNodes; context: { $implicit: rootNodes, level: 1 }"></ng-container>
      </div>
      @if (rootError) {
        <div class="rb-tree-status rb-tree-status-error">{{ rootError }}</div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }

    <ng-template #treeNodes let-nodes let-level="level">
      @for (node of nodes; track node.id) {
        <div class="rb-tree-node" role="treeitem"
          [attr.aria-level]="level"
          [attr.aria-expanded]="canExpand(node, level) ? isExpanded(node) : null"
          [attr.aria-checked]="getAriaChecked(node)"
          [attr.tabindex]="getTabIndex(node)"
          [class.rb-tree-focused]="focusedNodeId === node.id"
          [style.padding-left.rem]="(level - 1) * 1.15"
          (focus)="focusedNodeId = node.id"
          (click)="focusedNodeId = node.id">
          <div class="rb-tree-row">
            @if (canExpand(node, level)) {
              <button type="button" class="rb-expander" [attr.aria-label]="isExpanded(node) ? 'Collapse' : 'Expand'" (click)="toggleExpand(node, level)">
                <span class="rb-expander-glyph">{{ isExpanded(node) ? '\u25BC' : '\u25B6' }}</span>
              </button>
            } @else {
              <span class="rb-expander-placeholder" aria-hidden="true"></span>
            }

            @if (isSelectable(node)) {
              <input type="checkbox"
                class="rb-tree-checkbox"
                [checked]="isSelected(node)"
                [indeterminate]="isIndeterminate(node)"
                [attr.aria-checked]="getAriaChecked(node)"
                [id]="getCheckboxId(node)"
                (change)="onNodeChecked(node, $any($event.target).checked)"
              />
            }
            <label class="rb-tree-label" [class.rb-tree-label-root]="level === 1" [attr.for]="isSelectable(node) ? getCheckboxId(node) : null">{{ node.displayLabel }}</label>
          </div>
          @if (loadErrors.has(node.id)) {
            <div class="rb-tree-status rb-tree-status-error rb-tree-status-nested">{{ loadErrors.get(node.id) }}</div>
          }
          @if (isNodeLoading(node.id)) {
            <div class="rb-tree-status rb-tree-status-muted rb-tree-status-nested">Loading...</div>
          }
          @if (isExpanded(node) && (node.children?.length ?? 0) > 0) {
            <ng-container *ngTemplateOutlet="treeNodes; context: { $implicit: node.children, level: level + 1 }"></ng-container>
          }
        </div>
      }
    </ng-template>
  `,
  styles: [`
    .redbox-checkbox-tree {
      --rb-tree-border: #c9d3df;
      --rb-tree-bg: #f7f9fc;
      --rb-tree-bg-soft: #eef2f7;
      --rb-tree-text: #1d1f24;
      --rb-tree-muted: #5f6774;
      --rb-tree-accent: #0f3a66;
      --rb-focus-color: #0f3a66;
      border-radius: 0.6rem;
      padding: 0.55rem 0.5rem;
      font-size: inherit;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(247, 249, 252, 0.97) 80%),
        linear-gradient(90deg, var(--rb-tree-bg-soft) 0%, var(--rb-tree-bg) 100%);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    }

    .rb-tree-node {
      border-radius: 0.45rem;
      margin: 0.1rem 0;
    }

    .rb-tree-node[tabindex="0"]:focus-visible {
      outline: 2px solid var(--rb-focus-color);
      outline-offset: 2px;
      border-radius: 0.45rem;
    }

    .rb-tree-node[tabindex="0"]:focus:not(:focus-visible) {
      outline: none;
    }

    .rb-tree-row {
      min-height: 2rem;
      border-radius: 0.45rem;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.05rem 0.35rem 0.05rem 0.05rem;
      color: var(--rb-tree-text);
      transition: background-color 120ms ease, color 120ms ease;
    }

    .rb-tree-focused {
      background-color: rgba(15, 58, 102, 0.08);
    }

    .rb-expander,
    .rb-expander-placeholder {
      width: 1.05rem;
      height: 1.05rem;
      flex: 0 0 1.05rem;
    }

    .rb-expander {
      border: none;
      background: transparent;
      color: #0b0c0f;
      padding: 0;
      border-radius: 0.2rem;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .rb-expander:hover {
      background-color: rgba(15, 58, 102, 0.12);
      color: var(--rb-tree-accent);
    }

    .rb-expander:focus-visible {
      outline: 2px solid rgba(15, 58, 102, 0.45);
      outline-offset: 1px;
    }

    .rb-expander-glyph {
      font-family: "Courier New", monospace;
      font-size: 1rem;
      font-weight: 700;
      transform: translateY(-1px);
    }

    .rb-tree-checkbox {
      width: 1rem;
      height: 1rem;
      margin: 0;
      accent-color: #12497f;
      cursor: pointer;
    }

    .rb-tree-label {
      margin: 0;
      line-height: 1.25;
      font-size: inherit;
      font-weight: 500;
      letter-spacing: 0.005em;
      color: #272b31;
      cursor: pointer;
    }

    .rb-tree-label-root {
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .rb-tree-status {
      font-size: 0.8rem;
      line-height: 1.3;
      margin-top: 0.35rem;
    }

    .rb-tree-status-muted {
      color: var(--rb-tree-muted);
    }

    .rb-tree-status-error {
      color: #ad2a2a;
    }

    .rb-tree-status-nested {
      margin-left: 1.8rem;
    }
  `],
  standalone: false
})
export class CheckboxTreeComponent extends FormFieldBaseComponent<CheckboxTreeModelValueType> {
  protected override logName = CheckboxTreeComponentName;

  public rootNodes: CheckboxTreeRenderNode[] = [];
  public rootError: string | null = null;
  public rootLoading = false;
  public loadErrors = new Map<string, string>();
  public focusedNodeId: string | null = null;

  private readonly vocabTreeService = inject(VocabTreeService);
  private readonly injector = inject(Injector);
  private readonly handlebarsTemplateService = inject(HandlebarsTemplateService);
  private readonly selectedByNotation = new Map<string, CheckboxTreeSelectedItem>();
  private readonly nodeById = new Map<string, CheckboxTreeRenderNode>();
  private readonly parentById = new Map<string, string | null>();
  private readonly expandedNodeIds = new Set<string>();
  private readonly loadingNodeIds = new Set<string>();
  private readonly loadedNodeIds = new Set<string>();

  private leafOnly = true;
  private inlineVocab = false;
  private vocabRef = "";
  private maxDepth?: number;
  private labelTemplate = "";
  private labelTemplatePath: (string | number)[] = [];
  private compiledItems?: { evaluate: (key: (string | number)[], context: unknown, extra?: unknown) => unknown };

  @Input() public override model?: CheckboxTreeModel;

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const cfg = (this.componentDefinition?.config as CheckboxTreeFieldComponentConfig) ?? new CheckboxTreeFieldComponentConfig();
    this.leafOnly = cfg.leafOnly ?? true;
    this.inlineVocab = cfg.inlineVocab ?? false;
    this.vocabRef = String(cfg.vocabRef ?? "").trim();
    this.maxDepth = typeof cfg.maxDepth === "number" ? cfg.maxDepth : undefined;
    this.labelTemplate = String(cfg.labelTemplate ?? "").trim();
    this.labelTemplatePath = [...(this.formFieldCompMapEntry?.lineagePaths?.formConfig ?? []), "component", "config", "labelTemplate"];
    this.compiledItems = undefined;
    this.rootNodes = this.normalizeNodes(cfg.treeData ?? []);
    this.syncSelectionFromModel();
  }

  protected override async initData(): Promise<void> {
    await this.prepareLabelTemplate();
    this.applyDisplayLabels(this.rootNodes);
    this.rebuildIndexes(this.rootNodes, null);
    if (!this.inlineVocab && this.rootNodes.length === 0 && this.vocabRef) {
      await this.loadRootNodes();
    }
    const visible = this.getVisibleNodes();
    this.focusedNodeId = visible[0]?.id ?? null;
  }

  public isExpanded(node: CheckboxTreeRenderNode): boolean {
    return this.expandedNodeIds.has(node.id);
  }

  public isSelected(node: CheckboxTreeRenderNode): boolean {
    return this.selectedByNotation.has(this.getNotation(node));
  }

  public isSelectable(node: CheckboxTreeRenderNode): boolean {
    if (!this.leafOnly) {
      return true;
    }
    return !node.hasChildren;
  }

  public isIndeterminate(node: CheckboxTreeRenderNode): boolean {
    if (this.isSelected(node)) {
      return false;
    }
    return this.hasSelectedDescendant(node);
  }

  public getAriaChecked(node: CheckboxTreeRenderNode): "true" | "false" | "mixed" {
    if (this.isSelected(node)) {
      return "true";
    }
    if (this.isIndeterminate(node)) {
      return "mixed";
    }
    return "false";
  }

  public canExpand(node: CheckboxTreeRenderNode, level: number): boolean {
    if (!(node.hasChildren || (node.children?.length ?? 0) > 0)) {
      return false;
    }
    if (typeof this.maxDepth === "number" && this.maxDepth > 0 && level >= this.maxDepth) {
      return false;
    }
    return true;
  }

  public isNodeLoading(nodeId: string): boolean {
    return this.loadingNodeIds.has(nodeId);
  }

  public getCheckboxId(node: CheckboxTreeRenderNode): string {
    return `${this.name ?? "checkbox-tree"}-${node.id}`;
  }

  public getTabIndex(node: CheckboxTreeRenderNode): number {
    const firstVisibleId = this.getVisibleNodes()[0]?.id ?? null;
    const focusId = this.focusedNodeId ?? firstVisibleId;
    return node.id === focusId ? 0 : -1;
  }

  public async toggleExpand(node: CheckboxTreeRenderNode, level: number): Promise<void> {
    if (!this.canExpand(node, level)) {
      return;
    }
    if (this.isExpanded(node)) {
      this.expandedNodeIds.delete(node.id);
      return;
    }
    this.expandedNodeIds.add(node.id);
    if (!this.inlineVocab && node.hasChildren && (node.children?.length ?? 0) === 0 && !this.loadedNodeIds.has(node.id)) {
      await this.loadChildren(node);
    }
  }

  public onNodeChecked(node: CheckboxTreeRenderNode, checked: boolean): void {
    const notation = this.getNotation(node);
    if (!notation) {
      return;
    }
    if (checked) {
      this.selectedByNotation.set(notation, {
        notation,
        label: node.label,
        name: notation && node.label ? `${notation} - ${node.label}` : (node.label || notation),
        genealogy: this.getGenealogy(node)
      });
    } else {
      this.selectedByNotation.delete(notation);
    }
    this.syncModelFromSelection();
  }

  public onTreeKeydown(event: KeyboardEvent): void {
    const visible = this.getVisibleNodes();
    if (visible.length === 0) {
      return;
    }
    const focusedId = this.focusedNodeId ?? visible[0].id;
    const currentIndex = Math.max(0, visible.findIndex((node) => node.id === focusedId));
    const currentNode = visible[currentIndex];

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.focusedNodeId = visible[Math.min(currentIndex + 1, visible.length - 1)].id;
        break;
      case "ArrowUp":
        event.preventDefault();
        this.focusedNodeId = visible[Math.max(currentIndex - 1, 0)].id;
        break;
      case "ArrowRight":
        event.preventDefault();
        const currentLevel = this.getNodeLevel(currentNode.id);
        if (this.canExpand(currentNode, currentLevel)) {
          if (!this.isExpanded(currentNode)) {
            void this.toggleExpand(currentNode, currentLevel);
          } else if ((currentNode.children?.length ?? 0) > 0) {
            this.focusedNodeId = currentNode.children![0].id;
          }
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (this.isExpanded(currentNode)) {
          this.expandedNodeIds.delete(currentNode.id);
        } else {
          const parentId = this.parentById.get(currentNode.id);
          if (parentId) {
            this.focusedNodeId = parentId;
          }
        }
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        if (this.isSelectable(currentNode)) {
          this.onNodeChecked(currentNode, !this.isSelected(currentNode));
        }
        break;
      default:
        break;
    }
  }

  private async loadRootNodes(): Promise<void> {
    this.rootLoading = true;
    try {
      const response = await this.vocabTreeService.getChildren(this.vocabRef);
      this.rootNodes = this.toRenderNodes(response.data);
      this.rebuildIndexes(this.rootNodes, null);
    } catch (error) {
      this.rootError = this.describeLoadError(error);
    } finally {
      this.rootLoading = false;
    }
  }

  private async loadChildren(parent: CheckboxTreeRenderNode): Promise<void> {
    if (this.loadingNodeIds.has(parent.id)) {
      return;
    }
    this.loadingNodeIds.add(parent.id);
    this.loadErrors.delete(parent.id);
    try {
      const response = await this.vocabTreeService.getChildren(this.vocabRef, parent.id);
      parent.children = this.toRenderNodes(response.data);
      this.loadedNodeIds.add(parent.id);
      this.rebuildIndexes(parent.children, parent.id);
    } catch (error) {
      this.loadErrors.set(parent.id, this.describeLoadError(error));
    } finally {
      this.loadingNodeIds.delete(parent.id);
    }
  }

  private toRenderNodes(nodes: VocabTreeApiNode[]): CheckboxTreeRenderNode[] {
    const seen = new Set<string>();
    const normalized: CheckboxTreeRenderNode[] = [];
    for (const node of nodes) {
      const id = String(node.id ?? "").trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      normalized.push({
        id,
        label: String(node.label ?? ""),
        displayLabel: "",
        value: String(node.value ?? ""),
        notation: String(node.notation ?? node.value ?? ""),
        parent: String(node.parent ?? "").trim() || null,
        hasChildren: Boolean(node.hasChildren),
        children: []
      });
      normalized[normalized.length - 1].displayLabel = this.renderDisplayLabel(normalized[normalized.length - 1]);
    }
    return normalized;
  }

  private normalizeNodes(nodes: CheckboxTreeNode[], seen = new Set<string>()): CheckboxTreeRenderNode[] {
    const normalized: CheckboxTreeRenderNode[] = [];
    for (const node of nodes ?? []) {
      const id = String(node.id ?? "").trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      normalized.push({
        id,
        label: String(node.label ?? ""),
        displayLabel: "",
        value: String(node.value ?? ""),
        notation: String(node.notation ?? node.value ?? ""),
        parent: String(node.parent ?? "").trim() || null,
        hasChildren: Boolean(node.hasChildren || (node.children?.length ?? 0) > 0),
        children: this.normalizeNodes(node.children ?? [], seen)
      });
      normalized[normalized.length - 1].displayLabel = this.renderDisplayLabel(normalized[normalized.length - 1]);
    }
    return normalized;
  }

  private async prepareLabelTemplate(): Promise<void> {
    if (!this.labelTemplate) {
      return;
    }
    try {
      this.compiledItems = await this.getFormComponent.getRecordCompiledItems();
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Unable to load compiled label template, using node labels.`, error);
      this.compiledItems = undefined;
    }
  }

  private applyDisplayLabels(nodes: CheckboxTreeRenderNode[]): void {
    for (const node of nodes) {
      node.displayLabel = this.renderDisplayLabel(node);
      if ((node.children?.length ?? 0) > 0) {
        this.applyDisplayLabels(node.children ?? []);
      }
    }
  }

  private renderDisplayLabel(node: CheckboxTreeRenderNode): string {
    if (!this.labelTemplate || !this.compiledItems || this.labelTemplatePath.length === 0) {
      return node.label;
    }
    const notation = this.getNotation(node);
    try {
      const context = {
        node,
        id: node.id,
        label: node.label,
        value: node.value,
        notation,
        identifier: notation
      };
      const extra = { libraries: this.handlebarsTemplateService.getLibraries() };
      const rendered = this.compiledItems.evaluate(this.labelTemplatePath, context, extra);
      const output = String(rendered ?? "").trim();
      return output || node.label;
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Failed to evaluate checkbox tree label template for node '${node.id}'.`, error);
      return node.label;
    }
  }

  private rebuildIndexes(nodes: CheckboxTreeRenderNode[], parentId: string | null): void {
    if (parentId === null) {
      this.nodeById.clear();
      this.parentById.clear();
    }
    for (const node of nodes) {
      if (!node.id) {
        continue;
      }
      this.nodeById.set(node.id, node);
      this.parentById.set(node.id, parentId);
      if ((node.children?.length ?? 0) > 0) {
        this.rebuildIndexes(node.children ?? [], node.id);
      }
    }
  }

  private getVisibleNodes(): CheckboxTreeRenderNode[] {
    const result: CheckboxTreeRenderNode[] = [];
    const walk = (nodes: CheckboxTreeRenderNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (this.expandedNodeIds.has(node.id) && (node.children?.length ?? 0) > 0) {
          walk(node.children ?? []);
        }
      }
    };
    walk(this.rootNodes);
    return result;
  }

  private getNodeLevel(nodeId: string): number {
    let level = 1;
    let cursor = this.parentById.get(nodeId) ?? null;
    while (cursor) {
      level += 1;
      cursor = this.parentById.get(cursor) ?? null;
    }
    return level;
  }

  private getNotation(node: CheckboxTreeRenderNode): string {
    return String(node.notation ?? node.value ?? "").trim();
  }

  private hasSelectedDescendant(node: CheckboxTreeRenderNode): boolean {
    const children = node.children ?? [];
    for (const child of children) {
      if (this.isSelected(child) || this.hasSelectedDescendant(child)) {
        return true;
      }
    }
    return false;
  }

  private getGenealogy(node: CheckboxTreeRenderNode): string[] {
    const genealogy: string[] = [];
    let cursor = this.parentById.get(node.id) ?? null;
    while (cursor) {
      const ancestor = this.nodeById.get(cursor);
      const notation = ancestor ? this.getNotation(ancestor) : "";
      if (notation) {
        genealogy.unshift(notation);
      }
      cursor = this.parentById.get(cursor) ?? null;
    }
    return genealogy;
  }

  private syncSelectionFromModel(): void {
    this.selectedByNotation.clear();
    const values = Array.isArray(this.formControl?.value) ? this.formControl.value : [];
    for (const selected of values) {
      const notation = String((selected as CheckboxTreeSelectedItem)?.notation ?? "").trim();
      if (!notation) {
        continue;
      }
      const label = String((selected as CheckboxTreeSelectedItem)?.label ?? "");
      const name = String((selected as CheckboxTreeSelectedItem)?.name ?? (label ? `${notation} - ${label}` : notation));
      const genealogy = Array.isArray((selected as CheckboxTreeSelectedItem)?.genealogy)
        ? (selected as CheckboxTreeSelectedItem).genealogy?.map((item: string) => String(item))
        : undefined;
      this.selectedByNotation.set(notation, { notation, label, name, genealogy });
    }
  }

  private syncModelFromSelection(): void {
    const value = Array.from(this.selectedByNotation.values());
    this.formControl.setValue(value);
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  private describeLoadError(error: unknown): string {
    return (error as Error)?.message || "Unable to load vocabulary tree.";
  }
}
