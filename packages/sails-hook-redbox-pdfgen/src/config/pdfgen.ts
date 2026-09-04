/**
 * PdfGen Config Interface
 * (sails.config.pdfgen)
 *
 * Configuration for PDF generation via Puppeteer.
 */
export type PdfgenReadinessStrategy = 'networkIdle' | 'selector' | 'jsFlag' | 'networkIdle+selector';

export interface PdfgenPDFMargin {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

export interface PdfgenPDFOptions {
  scale?: number;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  landscape?: boolean;
  pageRanges?: string;
  format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
  width?: string;
  height?: string;
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
