import { PdfgenConfig } from './pdfgen';

declare module '@researchdatabox/redbox-core' {
  interface SailsConfig {
    pdfgen: PdfgenConfig;
  }
}

declare module '@researchdatabox/redbox-core-types' {
  interface SailsConfig {
    pdfgen: PdfgenConfig;
  }
}
