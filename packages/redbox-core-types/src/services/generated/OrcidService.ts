// This file is generated from internal/sails-ts/api/services/OrcidService.ts. Do not edit directly.
import { of, from } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import {Services as services} from '../../index';
import { Sails, Model } from "sails";
import axios from 'axios';

export declare class Orcids {
  protected _exportedMethods: any;
  public bootstrap: any;
  public searchOrcid(givenNames: string, familyName: string, page: number): any;
  protected mapToPeopleSearchResult(orcidSearchResult: any): any;
  private getExtendedAttributeObject(label: string, value: any): any;
  protected getOptions(url: any, method: any, contentType?: any): any;
}

export interface OrcidService {
}
