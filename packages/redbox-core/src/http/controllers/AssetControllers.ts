import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { BrandingController, brandingController, type BrandingControllerInput } from './IntegrationControllers';
import { BrandingDelivery } from '../../pages/brandingDelivery';
import { deliverDynamicAsset, type DynamicPageAssetsInput } from '../../pages/dynamicAssets';
import { pagePreparationFailure } from '../fastify/pages';

export interface BrandingAssetControllerInput extends BrandingControllerInput {
  readonly delivery: BrandingDelivery;
}
/** Preserve the existing browser mutation identity and expose delivery explicitly. */
export class BrandingAssetController extends BrandingController {
  constructor(protected readonly assetInput: BrandingAssetControllerInput) {
    super(assetInput);
  }
  renderCss(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderCss(request, reply);
  }
  renderPreviewCss(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderPreviewCss(request, reply);
  }
  renderImage(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderImage(request, reply);
  }
  renderFavicon(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderFavicon(request, reply);
  }
  renderFont(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderFont(request, reply);
  }
  renderApiB(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderApiB(request, reply);
  }
  renderSwaggerJSON(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderSwaggerJSON(request, reply);
  }
  renderSwaggerYAML(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderSwaggerYAML(request, reply);
  }
}
export const brandingAssetController = defineController({
  name: brandingController.name,
  requires: ['portal-pages'],
  actions: [
    ...brandingController.actions,
    'renderCss',
    'renderPreviewCss',
    'renderImage',
    'renderFavicon',
    'renderFont',
    'renderApiB',
    'renderSwaggerJSON',
    'renderSwaggerYAML',
  ],
  create: (input: BrandingAssetControllerInput) => new BrandingAssetController(input),
});
export interface DynamicAssetControllerInput {
  readonly dynamic: DynamicPageAssetsInput;
}
async function deliver(
  request: FastifyRequest,
  reply: FastifyReply,
  input: DynamicAssetControllerInput,
  action: string
) {
  try {
    return await deliverDynamicAsset(request, reply, input.dynamic, action);
  } catch (error) {
    return pagePreparationFailure(request, reply, error);
  }
}
export class DynamicAssetController {
  constructor(private readonly input: DynamicAssetControllerInput) {}
  get(request: FastifyRequest, reply: FastifyReply) {
    return deliver(request, reply, this.input, 'get');
  }
  getFormCompiledItems(request: FastifyRequest, reply: FastifyReply) {
    return deliver(request, reply, this.input, 'getFormCompiledItems');
  }
  getAdminReportTemplates(request: FastifyRequest, reply: FastifyReply) {
    return deliver(request, reply, this.input, 'getAdminReportTemplates');
  }
  getRecordDashboardTemplates(request: FastifyRequest, reply: FastifyReply) {
    return deliver(request, reply, this.input, 'getRecordDashboardTemplates');
  }
  getDashboardViewTemplates(request: FastifyRequest, reply: FastifyReply) {
    return deliver(request, reply, this.input, 'getDashboardViewTemplates');
  }
}
export const dynamicAssetController = defineController({
  name: 'DynamicAssetController',
  requires: ['portal-pages'],
  actions: [
    'get',
    'getFormCompiledItems',
    'getAdminReportTemplates',
    'getRecordDashboardTemplates',
    'getDashboardViewTemplates',
  ],
  create: (input: DynamicAssetControllerInput) => new DynamicAssetController(input),
});
