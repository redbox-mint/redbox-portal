import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { BrandingController, brandingController, type BrandingControllerInput } from './IntegrationControllers';
import { BrandingDelivery, type DeliveryRequest } from '../../pages/brandingDelivery';
import { deliverDynamicAsset, type DynamicPageAssetsInput } from '../../pages/dynamicAssets';
import { pagePreparationFailure } from '../fastify/pages';
import { assetResponse } from '../fastify/assets';
import { requestContext } from '../context';

export interface BrandingAssetControllerInput extends BrandingControllerInput {
  readonly delivery: BrandingDelivery;
}
function brandingRequest(request: FastifyRequest): DeliveryRequest {
  return {
    method: request.method,
    headers: request.headers,
    params: request.params as Record<string, unknown>,
    query: request.query as Record<string, unknown>,
    body: request.body as Record<string, unknown> | undefined,
  };
}
/** Preserve the existing browser mutation identity and expose delivery explicitly. */
export class BrandingAssetController extends BrandingController {
  constructor(protected readonly assetInput: BrandingAssetControllerInput) {
    super(assetInput);
  }
  renderCss(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderCss(brandingRequest(request), assetResponse(request, reply));
  }
  renderPreviewCss(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderPreviewCss(brandingRequest(request), assetResponse(request, reply));
  }
  renderImage(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderImage(brandingRequest(request), assetResponse(request, reply));
  }
  renderFavicon(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderFavicon(brandingRequest(request), assetResponse(request, reply));
  }
  renderFont(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderFont(brandingRequest(request), assetResponse(request, reply));
  }
  renderApiB(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderApiB(brandingRequest(request), assetResponse(request, reply));
  }
  renderSwaggerJSON(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderSwaggerJSON(brandingRequest(request), assetResponse(request, reply));
  }
  renderSwaggerYAML(request: FastifyRequest, reply: FastifyReply) {
    return this.assetInput.delivery.renderSwaggerYAML(brandingRequest(request), assetResponse(request, reply));
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
    return await deliverDynamicAsset(
      {
        context: requestContext(request),
        params: request.params as Record<string, unknown>,
        query: request.query as Record<string, unknown>,
        session: request.session as unknown as Record<string, unknown>,
      },
      assetResponse(request, reply),
      input.dynamic,
      action
    );
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
