import { LegacyFigshare } from '../compat/sails/figshare';
export namespace Services {
  export class FigshareService extends LegacyFigshare {}
}
declare global {
  let FigshareService: Services.FigshareService;
}
