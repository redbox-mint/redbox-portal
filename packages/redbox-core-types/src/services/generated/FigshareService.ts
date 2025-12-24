// This file is generated from internal/sails-ts/api/services/FigshareService.ts. Do not edit directly.
import {
  Services as services,
  DatastreamService,
  RBValidationError,
  QueueService,
  BrandingModel,
  FigshareArticleCreate,
  FigshareArticleUpdate,
  FigshareArticleEmbargo,
  ListAPIResponse
} from '../../index';
import { Sails } from "sails";

declare const axios: any;
declare const _: any;
declare const fs: any;
declare const checkDiskSpace: any;

export interface FigshareService {
  createUpdateFigshareArticle(oid: any, record: any, options: any, user: any): any;
  uploadFilesToFigshareArticle(oid: any, record: any, options: any, user: any): any;
  deleteFilesFromRedbox(job: any): any;
  deleteFilesFromRedboxTrigger(oid: any, record: any, options: any, user: any): any;
  publishAfterUploadFilesJob(job: any): any;
  queueDeleteFiles(oid: string, user: any, brandId: string, articleId: string): any;
  queuePublishAfterUploadFiles(oid: string, articleId: string, user: any, brandId: string): any;
  transitionRecordWorkflowFromFigshareArticlePropertiesJob(job: any): Promise<void>;
}
