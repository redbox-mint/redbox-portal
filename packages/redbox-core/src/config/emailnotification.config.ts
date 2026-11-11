/**
 * Email Notification Config Interface
 * (sails.config.emailnotification)
 * 
 * Email notification service configuration.
 */

export interface EmailApiEndpoint {
    method: 'post' | 'get';
    url: string;
}

export interface EmailServerOptions {
    host: string;
    port: number;
    secure: boolean;
    tls?: {
        rejectUnauthorized: boolean;
    };
    auth?: {
        user: string;
        pass: string;
    };
}

export interface EmailSettings {
    enabled: boolean;
    from: string;
    templateDir: string;
    /** Dotted config paths exposed to email templates. Non-secret values only. */
    exposedConfigPaths: string[];
    /** Extra hook-supplied display roots accepted in persisted templates. */
    additionalContextRoots?: string[];
    /** Maximum UTF-8 bytes for source and rendered subjects/bodies. */
    maxSubjectBytes?: number;
    maxBodyBytes?: number;
    /** Pre-parse bounds for combined block/subexpression depth and expression count. */
    maxTemplateNesting?: number;
    maxTemplateExpressions?: number;
    historyMaxVersions?: number;
    maxPreviewContextBytes?: number;
    serverOptions: EmailServerOptions;
}

export interface EmailDefaults {
    from: string;
    subject: string;
    format: 'html' | 'text';
}

export interface EmailTemplate {
    /** Optional plain-text purpose for administrators; never rendered or sent. */
    description?: string;
    subject?: string;
    template: string;
    format?: 'html' | 'text';
}

export interface EmailNotificationConfig {
    api: {
        send: EmailApiEndpoint;
    };
    settings: EmailSettings;
    defaults: EmailDefaults;
    templates: {
        [templateName: string]: EmailTemplate;
    };
}

export const emailnotification: EmailNotificationConfig = {
    api: {
        send: { method: 'post', url: '/api/v1/messaging/emailnotification' },
    },
    settings: {
        enabled: true,
        from: 'noreply@redbox',
        // Email body templates are Handlebars files (.hbs) resolved by name from this directory.
        templateDir: 'views/emailTemplates/',
        exposedConfigPaths: ['appUrl'],
        additionalContextRoots: [],
        maxSubjectBytes: 998,
        maxBodyBytes: 1048576,
        maxTemplateNesting: 64,
        maxTemplateExpressions: 1024,
        historyMaxVersions: 50,
        maxPreviewContextBytes: 262144,
        serverOptions: {
            host: 'integration-testing-email-1',
            port: 1025,
            secure: false,
            tls: {
                rejectUnauthorized: false,
            },
        },
    },
    defaults: {
        from: 'redbox@dev',
        subject: 'ReDBox Notification',
        format: 'html',
    },
    templates: {
        integrationFailure: { subject: '{{title}}', template: 'integrationFailure',
            description: 'Sent to configured recipients when an integration fails and failure notifications are enabled.' },
        integrationRecovery: { subject: '{{title}}', template: 'integrationRecovery',
            description: 'Sent to configured recipients when an integration succeeds after a notified failure, if recovery alerts are enabled.' },
        transferOwnerTo: { subject: 'Ownership of DMP record/s has been transferred to you', template: 'transferOwnerTo',
            description: 'Notifies the new custodian when an RDMP ownership transfer uses this template; no automatic trigger is configured in core.' },
        test: { subject: 'Test Email Message', template: 'test',
            description: 'Example email for explicitly requested test notifications; no automatic trigger is configured in core.' },
        publicationStaged: { template: 'publicationStaged',
            description: 'Sent to the chief investigator, data manager and supervisor when a draft publication is queued for publishing.' },
        publicationReview: { template: 'publicationReview',
            description: 'Sent to the configured reviewer after the publication-staged notification succeeds, asking them to review the queued publication.' },
        publicationPublished: { template: 'publicationPublished',
            description: 'Sent to contributors, creators and the configured reviewer when a reviewed publication reaches the published stage.' },
    },
};
