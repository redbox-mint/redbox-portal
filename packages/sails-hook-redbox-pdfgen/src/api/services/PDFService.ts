import type { PDFDependencies } from '../../dependencies';
import { Services as Owned } from './PDF';
import { legacyPDFDependencies } from '../../compat/dependencies';
import { installLegacyPDFLifecycle } from '../../compat/lifecycle';

export namespace Services {
  export class PDF extends Owned.PDF {
    public constructor(dependencies: PDFDependencies = legacyPDFDependencies()) {
      super(dependencies);
      this.active = true;
    }
    public registerSailsHook(_method: string, events: string[], callback: () => void): void {
      sails.after(events, callback);
    }
    public init(): void {
      installLegacyPDFLifecycle(sails, this);
    }
    public exports() {
      return { createPDF: this.createPDF.bind(this), init: this.init.bind(this) };
    }
  }
}
