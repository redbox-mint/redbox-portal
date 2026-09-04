import { PdfgenConfig } from './pdfgen';

declare module '@researchdatabox/redbox-core' {
  interface SailsConfig {
    pdfgen: PdfgenConfig;
  }
}
