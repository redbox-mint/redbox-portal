import { Component, Injector, Input, inject } from "@angular/core";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  PublishDataLocationModelValueType,
  PublishDataLocationSelectorComponentName,
  PublishDataLocationSelectorFieldComponentConfig,
  PublishDataLocationSelectorFieldComponentConfigOutline,
  PublishDataLocationSelectorModelName,
  PublishDataLocationSelectionCriterion,
  PublishDataLocationValueType,
} from "@researchdatabox/sails-ng-common";
import { FormComponent } from "../form.component";

export class PublishDataLocationSelectorModel extends FormFieldModel<PublishDataLocationModelValueType> {
  protected override logName = PublishDataLocationSelectorModelName;
}

@Component({
  selector: "redbox-publish-data-location-selector",
  templateUrl: "./publish-data-location-selector.component.html",
  standalone: false,
})
export class PublishDataLocationSelectorComponent extends FormFieldBaseComponent<PublishDataLocationModelValueType> {
  protected override logName = PublishDataLocationSelectorComponentName;

  @Input() public override model?: PublishDataLocationSelectorModel;

  public editNotesButtonText = "Edit";
  public editNotesTitle = "Edit Notes";
  public cancelEditNotesButtonText = "Cancel";
  public applyEditNotesButtonText = "Apply";
  public editNotesCssClasses = "form-control";
  public typeHeader = "Type";
  public locationHeader = "Location";
  public notesHeader = "Notes";
  public iscHeader = "Information Security Classification";
  public iscEnabled = false;
  public notesEnabled = true;
  public noLocationSelectedText = "Publish Metadata Only";
  public noLocationSelectedHelp = "Publicise only metadata (or description)";
  public publicCheck = "public";
  public selectionCriteria: PublishDataLocationSelectionCriterion[] = [{ isc: "public", type: "attachment" }];
  public dataTypeLookup: Record<string, string> = {
    url: "URL",
    physical: "Physical location",
    file: "File path",
    attachment: "Attachment",
  };
  public editingNotesIndex = -1;
  public editingNotesValue = "";

  private readonly injector = inject(Injector);

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const cfg =
      (this.componentDefinition?.config as PublishDataLocationSelectorFieldComponentConfigOutline) ??
      new PublishDataLocationSelectorFieldComponentConfig();
    const cfgRecord = cfg as PublishDataLocationSelectorFieldComponentConfigOutline & Record<string, unknown>;
    this.editNotesButtonText = String(cfg.editNotesButtonText ?? "Edit");
    this.editNotesTitle = String(cfg.editNotesTitle ?? "Edit Notes");
    this.cancelEditNotesButtonText = String(cfg.cancelEditNotesButtonText ?? "Cancel");
    this.applyEditNotesButtonText = String(cfg.applyEditNotesButtonText ?? "Apply");
    this.editNotesCssClasses = String(cfg.editNotesCssClasses ?? "form-control");
    this.typeHeader = String(cfg.typeHeader ?? "Type");
    this.locationHeader = String(cfg.locationHeader ?? "Location");
    this.notesHeader = String(cfg.notesHeader ?? "Notes");
    this.iscHeader = String(cfg.iscHeader ?? "Information Security Classification");
    this.iscEnabled = cfg.iscEnabled === true;
    this.notesEnabled = cfg.notesEnabled !== false;
    this.noLocationSelectedText = String(cfg.noLocationSelectedText ?? "Publish Metadata Only");
    this.noLocationSelectedHelp = String(cfg.noLocationSelectedHelp ?? "Publicise only metadata (or description)");
    this.publicCheck = String(cfg.publicCheck ?? "public");
    this.selectionCriteria = Array.isArray(cfg.selectionCriteria) && cfg.selectionCriteria.length > 0
      ? cfg.selectionCriteria.map((criterion) => Object.fromEntries(
        Object.entries(criterion ?? {}).map(([key, value]) => [String(key), String(value)])
      ))
      : [{ isc: "public", type: "attachment" }];
    this.dataTypeLookup = cfgRecord["dataTypeLookup"] && typeof cfgRecord["dataTypeLookup"] === "object"
      ? { ...this.dataTypeLookup, ...(cfgRecord["dataTypeLookup"] as Record<string, string>) }
      : this.dataTypeLookup;
  }

  public get dataLocations(): PublishDataLocationValueType[] {
    return this.normalizeDataLocations(this.formControl.value ?? this.model?.getValue());
  }

  public isEditMode(): boolean {
    return this.getFormComponent.editMode() && !this.isReadonly;
  }

  public selectAllLocations(checked: boolean): void {
    if (!this.isEditMode() || this.isDisabled) {
      return;
    }
    const updated = this.dataLocations.map((dataLocation) => {
      if (this.iscEnabled) {
        return this.canBeSelected(dataLocation) ? { ...dataLocation, selected: checked } : dataLocation;
      }
      return { ...dataLocation, selected: checked };
    });
    this.updateValue(updated);
  }

  public toggleLocationSelection(index: number, checked: boolean): void {
    if (!this.isEditMode() || this.isDisabled || this.isReadonly) {
      return;
    }
    const current = this.dataLocations[index];
    if (!current || !this.canBeSelected(current)) {
      return;
    }
    const updated = [...this.dataLocations];
    updated[index] = { ...current, selected: checked };
    this.updateValue(updated);
  }

  public canBeSelected(dataLocation: PublishDataLocationValueType): boolean {
    if (!this.iscEnabled) {
      return true;
    }
    const locationRecord = dataLocation as unknown as Record<string, unknown>;
    return this.selectionCriteria.some((criterion) =>
      Object.entries(criterion).every(([key, value]) => String(locationRecord[key] ?? "") === value)
    );
  }

  public shouldShowNoLocationSelected(): boolean {
    return !this.dataLocations.some((dataLocation) => dataLocation.selected);
  }

  public startEditNotes(index: number): void {
    if (!this.isEditMode()) {
      return;
    }
    const item = this.dataLocations[index];
    if (!item) {
      return;
    }
    this.editingNotesIndex = index;
    this.editingNotesValue = String(item.notes ?? "");
  }

  public cancelEditNotes(): void {
    this.editingNotesIndex = -1;
    this.editingNotesValue = "";
  }

  public applyEditNotes(): void {
    if (this.editingNotesIndex < 0) {
      return;
    }
    const current = this.dataLocations[this.editingNotesIndex];
    if (!current) {
      this.cancelEditNotes();
      return;
    }
    const updated = [...this.dataLocations];
    updated[this.editingNotesIndex] = {
      ...current,
      notes: this.optionalString(this.editingNotesValue),
    };
    this.updateValue(updated);
    this.cancelEditNotes();
  }

  public getLocationTypeLabel(item: PublishDataLocationValueType): string {
    return this.dataTypeLookup[String(item?.type ?? "")] ?? String(item?.type ?? "");
  }

  public getLocationDisplayText(item: PublishDataLocationValueType): string {
    if (item.type === "attachment") {
      return String(item.name ?? item.fileId ?? item.location ?? "");
    }
    return String(item.location ?? "");
  }

  public getLocationHref(item: PublishDataLocationValueType): string {
    if (item.type === "url") {
      return String(item.location ?? "");
    }
    if (item.type === "attachment") {
      const location = String(item.location ?? "").trim();
      if (!location) {
        return "";
      }
      if (/^https?:\/\//i.test(location)) {
        return location;
      }
      const base = String(this.getFormComponent.recordService.brandingAndPortalUrl ?? "").trim();
      if (base) {
        return `${base}${location.startsWith("/") ? "" : "/"}${location}`;
      }
      return `${window.location.origin}${location.startsWith("/") ? "" : "/"}${location}`;
    }
    return "";
  }

  public isLinkLocation(item: PublishDataLocationValueType): boolean {
    if (item.type === "attachment") {
      return !item.pending;
    }
    return item.type === "url";
  }

  private updateValue(nextValue: PublishDataLocationValueType[]): void {
    this.formControl.setValue(nextValue);
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  private optionalString(value: string): string | undefined {
    const trimmed = String(value ?? "").trim();
    return trimmed ? trimmed : undefined;
  }

  private normalizeDataLocations(value: unknown): PublishDataLocationValueType[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => {
        const typedItem = item as unknown as PublishDataLocationValueType;
        return {
          ...typedItem,
          selected: item["selected"] === true,
        };
      });
  }
}
