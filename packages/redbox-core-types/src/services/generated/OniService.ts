// This file is generated from internal/sails-ts/api/services/OniService.ts. Do not edit directly.
import { Services as services, DatastreamService, RBValidationError } from '../../index';
import { Sails } from "sails";
import { firstValueFrom } from 'rxjs';
import { promises as fs } from 'fs';
import path from 'node:path';
import {Collector, generateArcpId} from "oni-ocfl";
import { createWriteStream } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
import {languageProfileURI} from "language-data-commons-vocabs";
import * as mime from 'mime-types';

declare const finished: any;
declare const wktParserHelper: any;
declare const URL_PLACEHOLDER: any;
declare const DEFAULT_IDENTIFIER_NAMESPACE: any;

export interface OniService {
  exportDataset(oid: any, record: any, options: any, user: any): any;
}
