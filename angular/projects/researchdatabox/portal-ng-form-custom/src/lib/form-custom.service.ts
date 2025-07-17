import { Injectable } from '@angular/core';
import { FormComponentResolver, FormFieldResolver, FormFieldBaseComponent, FormFieldModel } from '@researchdatabox/portal-ng-common';

@Injectable({
  providedIn: 'root'
})
export class PortalNgFormCustomService implements FormComponentResolver , FormFieldResolver
{
  public async getFieldClass(fieldClass: string): Promise<typeof FormFieldModel> {
    throw new Error(`Failed to resolve field: ${fieldClass}`);
  }

  public async getComponentClass(componentName: string): Promise<typeof FormFieldBaseComponent> {
    throw new Error(`Failed to resolve component: ${componentName}`);
  }
}
