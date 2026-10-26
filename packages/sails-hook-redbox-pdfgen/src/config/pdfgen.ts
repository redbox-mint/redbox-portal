/**
 * PdfGen Config Interface
 * (configuration.pdfgen)
 *
 * Configuration for PDF generation via Puppeteer.
 */
export type PdfgenReadinessStrategy = 'networkIdle' | 'selector' | 'jsFlag' | 'networkIdle+selector';

export interface PdfgenPDFMargin {
  top?: string | number;
  bottom?: string | number;
  left?: string | number;
  right?: string | number;
}

export interface PdfgenPDFOptions {
  scale?: number;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  landscape?: boolean;
  pageRanges?: string;
  format?: import('puppeteer').PaperFormat;
  width?: string | number;
  height?: string | number;
  preferCSSPageSize?: boolean;
  margin?: PdfgenPDFMargin;
  omitBackground?: boolean;
  tagged?: boolean;
  outline?: boolean;
  timeout?: number;
  waitForFonts?: boolean;
}

export interface PdfgenConfig {
  token: string;
  appUrlOverride: string;
  sourceUrlBase?: string;
  pdfPrefix: string;
  readinessStrategy: PdfgenReadinessStrategy;
  readinessTimeout: number;
  networkIdleTime: number;
  waitForSelector: string;
  waitForFunction: string;
  enableChromeLogging: boolean;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  PDFOptions?: PdfgenPDFOptions;
}

export const pdfgen: PdfgenConfig = {
  token: '',
  appUrlOverride: '',
  pdfPrefix: 'pdf',
  readinessStrategy: 'networkIdle',
  readinessTimeout: 60000,
  networkIdleTime: 2000,
  waitForSelector: '',
  waitForFunction: '',
  enableChromeLogging: false,
  maxRetries: 2,
  retryDelayMs: 5000,
  retryBackoffMultiplier: 2,
  PDFOptions: {},
};
