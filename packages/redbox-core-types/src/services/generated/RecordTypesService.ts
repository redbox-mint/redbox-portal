// This file is generated from internal/sails-ts/api/services/RecordTypesService.ts. Do not edit directly.
import { Observable, firstValueFrom } from 'rxjs';
import {BrandingModel, RecordTypeModel, Services as services} from '../../index';
import {Sails, Model} from "sails";

export interface RecordTypesService {
  bootstrap(defBrand: BrandingModel): Promise<RecordTypeModel[]>;
  create(brand: BrandingModel, name: string, config: RecordTypeModel): Observable<RecordTypeModel>;
  get(brand: BrandingModel, name: string, fields?: string[]): Observable<RecordTypeModel>;
  getAll(brand: BrandingModel, fields?: string[]): Observable<RecordTypeModel[]>;
  getAllCache(): RecordTypeModel[];
}
