import { Injectable } from '@angular/core';
import { FormComponentResolver, FormFieldResolver, FormFieldComponent, FormFieldModel } from '@researchdatabox/portal-ng-common';

@Injectable({
  providedIn: 'root'
})
export class PortalNgFormCustomService implements FormComponentResolver , FormFieldResolver 
{
  public async getFieldClass(fieldClass: string): Promise<typeof FormFieldModel> {
    throw new Error(`Failed to resolve field: ${fieldClass}`);
  }

  public async getComponentClass(componentName: string): Promise<typeof FormFieldComponent> {
    throw new Error(`Failed to resolve component: ${componentName}`);
  }
}
