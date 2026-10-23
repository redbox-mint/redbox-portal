import { LegacyNamedQueryService } from '../compat/sails/namedQueries';
export * from '../queries/NamedQueries';
export namespace Services {
  export class NamedQueryService extends LegacyNamedQueryService {}
}
declare global {
  let NamedQueryService: Services.NamedQueryService;
}
