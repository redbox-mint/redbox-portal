import { Services as FigshareV2Services } from './FigshareV2Service';

export namespace Services {
  export class FigshareService extends FigshareV2Services.FigshareV2Service {}
}

module.exports.Services = Services;

declare global {
  let FigshareService: Services.FigshareService;
}
