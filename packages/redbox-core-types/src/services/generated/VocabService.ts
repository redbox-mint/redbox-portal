// This file is generated from internal/sails-ts/api/services/VocabService.ts. Do not edit directly.
import { Observable, of, from, zip, throwError } from 'rxjs';
import { mergeMap as flatMap, last, map, concatAll, concatMap, delay } from 'rxjs/operators';
import { SearchService, VocabQueryConfig, BrandingModel, Services as services } from '../../index';
import { Sails } from 'sails';
import axios from 'axios';

export interface VocabService {
  bootstrap(): any;
  getVocab(...args: any[]): any;
  loadCollection(collectionId: any, progressId?: any, force?: any): any;
  findCollection(collectionId: any, searchString: any): any;
  findInMint(sourceType: any, queryString: any): Promise<any>;
  findInExternalService(providerName: any, params: any): Promise<any>;
  rvaGetResourceDetails(uri: any, vocab: any): any;
  findInMintTriggerWrapper(user: object, options: object, failureMode: string): any;
  findRecords(sourceType: string, brand: BrandingModel, searchString: string, start: number, rows: number, user: any): Promise<any>;
}
