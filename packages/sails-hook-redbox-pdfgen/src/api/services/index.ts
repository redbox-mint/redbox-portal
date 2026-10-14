import { Services } from './PDFService';

export const ServiceExports = {
  pdfservice: new Services.PDF().exports(),
};
