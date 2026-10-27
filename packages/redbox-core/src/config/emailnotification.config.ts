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
    serverOptions: EmailServerOptions;
}

export interface EmailDefaults {
    from: string;
    subject: string;
    format: 'html' | 'text';
}

export interface EmailTemplate {
    subject: string;
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
        integrationFailure: { subject: '{{title}}', template: 'integrationFailure' },
        integrationRecovery: { subject: '{{title}}', template: 'integrationRecovery' },
        transferOwnerTo: { subject: 'Ownership of DMP record/s has been transferred to you', template: 'transferOwnerTo' },
        test: { subject: 'Test Email Message', template: 'test' },
    },
};
