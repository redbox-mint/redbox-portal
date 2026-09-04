import type { PdfgenPDFOptions } from '../../config/pdfgen';

/**
 * Configuration for PDF Generation (pdfgen)
 * Used to control PDF generation options in the system.
 */
export class PDFGenConfig {
    /**
     * Enable verbose Chrome logging during PDF generation.
     * Set to 'true' to enable logging.
     *
     * @title Enable Chrome Logging
     * 
     * 
     */
    enableChromeLogging: boolean = false;

    /**
     * Override the base application URL for PDF generation.
     * If set, this URL will be used instead of the default appUrl.
     *
     * @title App URL Override
     * @type string
     * @default ""
     */
    appUrlOverride: string = "";

    /**
     * API token for PDF generation. Required for authentication.
     *
     * @title API Token
     * @type string
     * @default ""
     */
    token: string = "";

    /**
     * Base path for the source URL used to generate the PDF.
     * When unset, the current brand name is used.
     *
     * @title Source URL Base
     */
    sourceUrlBase?: string;

    /**
     * CSS selector to wait for before generating the PDF (page readiness).
     *
     * @title Wait For Selector
     * @type string
     * @default ""
     */
    waitForSelector: string = "";

    /**
     * Prefix for the generated PDF file name.
     *
     * @title PDF Prefix
     * @type string
     * @default "pdf"
     */
    pdfPrefix: string = "pdf";


    /**
     * Strategy to use to determine if the page is ready for PDF generation.
     *
     * @title Readiness Strategy
     * @default "networkIdle"
     */
    readinessStrategy: 'networkIdle' | 'selector' | 'jsFlag' | 'networkIdle+selector' = 'networkIdle';

    /**
     * Timeout in milliseconds to wait for the page to be ready.
     *
     * @title Readiness Timeout
     * @default 60000
     */
    readinessTimeout: number = 60000;

    /**
     * Time in milliseconds to wait for network idle if strategy is networkIdle.
     *
     * @title Network Idle Time
     * @default 2000
     */
    networkIdleTime: number = 2000;

    /**
     * JS function to evaluate to check if the page is ready if strategy is jsFlag.
     *
     * @title Wait For Function
     * @default ""
     */
    waitForFunction: string = "";

    /**
     * Maximum number of retries for PDF generation.
     *
     * @title Max Retries
     * @default 2
     */
    maxRetries: number = 2;

    /**
     * Delay in milliseconds before retrying PDF generation.
     *
     * @title Retry Delay (ms)
     * @default 5000
     */
    retryDelayMs: number = 5000;

    /**
     * Multiplier for retry delay (exponential backoff).
     *
     * @title Retry Backoff Multiplier
     * @default 2
     */
    retryBackoffMultiplier: number = 2;

    /**
     * Puppeteer PDF options.
     *
     * @title PDF Options
     */
    PDFOptions?: PdfgenPDFOptions;

    public static getFieldOrder(): string[] {
        return [
            "token",
            "appUrlOverride",
            "sourceUrlBase",
            "readinessStrategy",
            "readinessTimeout",
            "networkIdleTime",
            "waitForSelector",
            "waitForFunction",
            "pdfPrefix",
            "enableChromeLogging",
            "maxRetries",
            "retryDelayMs",
            "retryBackoffMultiplier",
            "PDFOptions"
        ];
    }
}

export const PDFGEN_CONFIG_SCHEMA = {
    type: 'object',
    title: 'PDF Generation Config',
    description: 'Configuration for PDF generation using Puppeteer.',
    properties: {
        token: {
            type: 'string',
            title: 'API Token',
            description: 'API token for PDF generation. Required for authentication.',
            default: ''
        },
        appUrlOverride: {
            type: 'string',
            title: 'App URL Override',
            description: 'Override the base application URL for PDF generation.',
            default: ''
        },
        sourceUrlBase: {
            type: 'string',
            title: 'Source URL Base',
            description: 'Base path for the source URL used to generate the PDF. Defaults to the current brand record view when unset.'
        },
        readinessStrategy: {
            type: 'string',
            title: 'Readiness Strategy',
            description: 'Strategy to use to determine if the page is ready for PDF generation.',
            default: 'networkIdle',
            enum: ['networkIdle', 'selector', 'jsFlag', 'networkIdle+selector']
        },
        readinessTimeout: {
            type: 'number',
            title: 'Readiness Timeout',
            description: 'Timeout in milliseconds to wait for the page to be ready.',
            default: 60000
        },
        networkIdleTime: {
            type: 'number',
            title: 'Network Idle Time',
            description: 'Time in milliseconds to wait for network idle if strategy is networkIdle.',
            default: 2000
        },
        waitForSelector: {
            type: 'string',
            title: 'Wait For Selector',
            description: 'CSS selector to wait for before generating the PDF.',
            default: ''
        },
        waitForFunction: {
            type: 'string',
            title: 'Wait For Function',
            description: 'JS function to evaluate if strategy is jsFlag.',
            default: ''
        },
        pdfPrefix: {
            type: 'string',
            title: 'PDF Prefix',
            description: 'Prefix for the generated PDF file name.',
            default: 'pdf'
        },
        enableChromeLogging: {
            type: 'boolean',
            title: 'Enable Chrome Logging',
            description: 'Enable verbose Chrome logging during PDF generation.',
            default: false
        },
        maxRetries: {
            type: 'number',
            title: 'Max Retries',
            description: 'Maximum number of retries for PDF generation.',
            default: 2
        },
        retryDelayMs: {
            type: 'number',
            title: 'Retry Delay (ms)',
            description: 'Delay in milliseconds before retrying PDF generation.',
            default: 5000
        },
        retryBackoffMultiplier: {
            type: 'number',
            title: 'Retry Backoff Multiplier',
            description: 'Multiplier for retry delay (exponential backoff).',
            default: 2
        },
        PDFOptions: {
            type: 'object',
            title: 'PDF Options',
            description: 'Additional Puppeteer PDF options.',
            default: {},
            additionalProperties: false,
            properties: {
                format: {
                    type: 'string',
                    title: 'Paper Format',
                    description: 'Paper format to use when generating the PDF.',
                    enum: ['Letter', 'Legal', 'Tabloid', 'Ledger', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
                    default: 'A4'
                },
                printBackground: {
                    type: 'boolean',
                    title: 'Print Background',
                    description: 'Print background graphics.',
                    default: true
                },
                landscape: {
                    type: 'boolean',
                    title: 'Landscape',
                    description: 'Print in landscape orientation.',
                    default: false
                },
                scale: {
                    type: 'number',
                    title: 'Scale',
                    description: 'Scale of the webpage rendering. Puppeteer accepts values from 0.1 to 2.',
                    minimum: 0.1,
                    maximum: 2,
                    default: 1
                },
                displayHeaderFooter: {
                    type: 'boolean',
                    title: 'Display Header and Footer',
                    description: 'Display the configured header and footer templates.',
                    default: false
                },
                headerTemplate: {
                    type: 'string',
                    title: 'Header Template',
                    description: 'HTML template for the print header.',
                    default: '',
                    widget: {
                        formlyConfig: {
                            type: 'textarea'
                        }
                    }
                },
                footerTemplate: {
                    type: 'string',
                    title: 'Footer Template',
                    description: 'HTML template for the print footer.',
                    default: '',
                    widget: {
                        formlyConfig: {
                            type: 'textarea'
                        }
                    }
                },
                pageRanges: {
                    type: 'string',
                    title: 'Page Ranges',
                    description: 'Paper ranges to print, for example 1-5, 8, 11-13.',
                    default: ''
                },
                preferCSSPageSize: {
                    type: 'boolean',
                    title: 'Prefer CSS Page Size',
                    description: 'Give CSS @page size priority over width, height, or format.',
                    default: false
                },
                width: {
                    type: 'string',
                    title: 'Paper Width',
                    description: 'Paper width, including a unit such as 8.5in or 210mm.',
                    default: ''
                },
                height: {
                    type: 'string',
                    title: 'Paper Height',
                    description: 'Paper height, including a unit such as 11in or 297mm.',
                    default: ''
                },
                margin: {
                    type: 'object',
                    title: 'Margins',
                    description: 'PDF margins. Include units such as px, in, cm, or mm.',
                    additionalProperties: false,
                    properties: {
                        top: {
                            type: 'string',
                            title: 'Top',
                            default: ''
                        },
                        bottom: {
                            type: 'string',
                            title: 'Bottom',
                            default: ''
                        },
                        left: {
                            type: 'string',
                            title: 'Left',
                            default: ''
                        },
                        right: {
                            type: 'string',
                            title: 'Right',
                            default: ''
                        }
                    }
                },
                omitBackground: {
                    type: 'boolean',
                    title: 'Omit Background',
                    description: 'Hide the default white background and allow transparent PDFs.',
                    default: false
                },
                tagged: {
                    type: 'boolean',
                    title: 'Tagged PDF',
                    description: 'Generate a tagged, accessible PDF.',
                    default: true
                },
                outline: {
                    type: 'boolean',
                    title: 'Document Outline',
                    description: 'Generate a document outline.',
                    default: false
                },
                timeout: {
                    type: 'integer',
                    title: 'Timeout (ms)',
                    description: 'Timeout in milliseconds. Use 0 to disable timeout.',
                    minimum: 0,
                    default: 30000
                },
                waitForFonts: {
                    type: 'boolean',
                    title: 'Wait For Fonts',
                    description: 'Wait for document fonts to be ready before generating the PDF.',
                    default: true
                }
            }
        }
    }
};

export const PDFGEN_CONFIG_MODEL = {
    key: 'pdfgen',
    modelName: 'PDFGenConfig',
    title: 'PDF Generation Config',
    class: PDFGenConfig,
    schema: PDFGEN_CONFIG_SCHEMA,
    secretFields: ['token']
};
