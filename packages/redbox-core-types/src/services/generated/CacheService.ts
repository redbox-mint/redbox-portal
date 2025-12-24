// This file is generated from internal/sails-ts/api/services/CacheService.ts. Do not edit directly.
import { Observable, of } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import {Services as services} from '../../index';
import {Sails, Model} from "sails";
import { default as NodeCache } from "node-cache";
import { DateTime } from 'luxon';
import { readdir, access } from 'node:fs/promises';

export interface CacheService {
  bootstrap(): any;
  get(name: any): Observable<any>;
  set(name: any, data: any, expiry?: any): any;
  getNgAppFileHash(appName: string, fileNamePrefix: string, namePrefix?: string, nameSuffix?: string, insertEvenOnEmpty?: boolean): string;
}
