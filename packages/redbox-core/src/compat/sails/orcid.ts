import { Services as Owned } from '../../integrations/Orcid';

export namespace Services {
  export class Orcids extends Owned.Orcids {
    constructor() {
      super({
        get url() {
          return sails.config.orcid.url;
        },
        get method() {
          return sails.config.record.api.search.method;
        },
      });
    }
    exports(): Record<string, unknown> {
      return { searchOrcid: this.searchOrcid.bind(this) };
    }
  }
}
