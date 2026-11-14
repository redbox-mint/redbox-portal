import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import {
  ApiBrandingController,
  apiBrandingController,
  type ApiBrandingControllerInput,
  BrandingAppController,
  brandingAppController,
  type BrandingAppControllerInput,
} from './IntegrationControllers';
import {
  RecordMutationController,
  ApiRecordMutationController,
  apiRecordMutationController,
  type ApiRecordMutationControllerInput,
  recordMutationController,
  type RecordMutationControllerInput,
} from './MutationControllers';
import {
  RecordBrowserController,
  recordMutationBrowserController,
  type RecordBrowserControllerInput,
} from './BrowserControllers';
import { DatastreamController, type DatastreamControllerInput } from './webservice/DatastreamController';
import type { BrandingUploadInput } from '../actions/brandingUploads';
import type { ResumableUploads } from '../actions/resumableUploads';
import { brandingUploadAction } from '../fastify/brandingUploads';
import { isResumableUpload, resumableUploadAction } from '../fastify/resumableUploads';
export interface ResumableControllerInput {
  readonly resumable: Pick<ResumableUploads, 'handle'>;
  readonly rootContext: string;
}
export type ApiBrandingUploadControllerInput = ApiBrandingControllerInput & { readonly uploads: BrandingUploadInput };
export class ApiBrandingUploadController extends ApiBrandingController {
  constructor(private readonly uploadInput: ApiBrandingUploadControllerInput) {
    super(uploadInput);
  }
  uploadFace(request: FastifyRequest, reply: FastifyReply) {
    return brandingUploadAction(this.uploadInput.uploads, 'uploadFace', request, reply);
  }
  logo(request: FastifyRequest, reply: FastifyReply) {
    return brandingUploadAction(this.uploadInput.uploads, 'logo', request, reply);
  }
  favicon(request: FastifyRequest, reply: FastifyReply) {
    return brandingUploadAction(this.uploadInput.uploads, 'favicon', request, reply);
  }
}
export const apiBrandingUploadController = defineController({
  name: apiBrandingController.name,
  requires: ['portal-raw-http'],
  actions: [...apiBrandingController.actions, 'uploadFace', 'logo', 'favicon'],
  create: (input: ApiBrandingUploadControllerInput) => new ApiBrandingUploadController(input),
});
export type BrandingAppUploadControllerInput = BrandingAppControllerInput & { readonly uploads: BrandingUploadInput };
export class BrandingAppUploadController extends BrandingAppController {
  constructor(private readonly uploadInput: BrandingAppUploadControllerInput) {
    super(uploadInput);
  }
  uploadFace(request: FastifyRequest, reply: FastifyReply) {
    return brandingUploadAction(this.uploadInput.uploads, 'uploadFace', request, reply);
  }
  logo(request: FastifyRequest, reply: FastifyReply) {
    return brandingUploadAction(this.uploadInput.uploads, 'logo', request, reply);
  }
  favicon(request: FastifyRequest, reply: FastifyReply) {
    return brandingUploadAction(this.uploadInput.uploads, 'favicon', request, reply);
  }
}
export const brandingAppUploadController = defineController({
  name: brandingAppController.name,
  requires: ['portal-raw-http'],
  actions: [...brandingAppController.actions, 'uploadFace', 'logo', 'favicon'],
  create: (input: BrandingAppUploadControllerInput) => new BrandingAppUploadController(input),
});
export type RecordUploadControllerInput = RecordMutationControllerInput & ResumableControllerInput;
export class RecordUploadController extends RecordMutationController {
  constructor(private readonly uploadInput: RecordUploadControllerInput) {
    super(uploadInput);
  }
  doAttachment(request: FastifyRequest, reply: FastifyReply) {
    return isResumableUpload(request)
      ? resumableUploadAction(request, reply, this.uploadInput)
      : super.doAttachment(request, reply);
  }
}
export const recordUploadController = defineController({
  name: recordMutationController.name,
  requires: ['portal-raw-http'],
  actions: recordMutationController.actions,
  create: (input: RecordUploadControllerInput) => new RecordUploadController(input),
});
export type RecordUploadBrowserControllerInput = RecordBrowserControllerInput & ResumableControllerInput;
export class RecordUploadBrowserController extends RecordBrowserController {
  constructor(private readonly uploadInput: RecordUploadBrowserControllerInput) {
    super(uploadInput);
  }
  doAttachment(request: FastifyRequest, reply: FastifyReply) {
    return isResumableUpload(request)
      ? resumableUploadAction(request, reply, this.uploadInput)
      : super.doAttachment(request, reply);
  }
}
export const recordUploadBrowserController = defineController({
  name: recordMutationBrowserController.name,
  requires: ['portal-raw-http', 'portal-pages'],
  actions: recordMutationBrowserController.actions,
  create: (input: RecordUploadBrowserControllerInput) => new RecordUploadBrowserController(input),
});

export type MutationUploadInput = ApiRecordMutationControllerInput & DatastreamControllerInput;
export class MutationUploadController extends ApiRecordMutationController {
  private readonly uploads: DatastreamController;
  constructor(input: MutationUploadInput) {
    super(input);
    this.uploads = new DatastreamController(input);
  }
  addDataStreams(request: FastifyRequest, reply: FastifyReply) {
    return this.uploads.addDataStreams(request, reply);
  }
}
export const mutationUploadController = defineController({
  name: apiRecordMutationController.name,
  requires: ['portal-raw-http'],
  actions: [...apiRecordMutationController.actions, 'addDataStreams'],
  create: (input: MutationUploadInput) => new MutationUploadController(input),
});
