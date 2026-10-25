/**
 * Email Notification Config Interface
 * (configuration.emailnotification)
 *
 * Email notification service configuration.
 */

export interface EmailApiEndpoint {
  method: 'post' | 'get';
  url: string;
}

export interface EmailServerOptions {
  /** Native Nodemailer transport data, including service/JSON/stream transports. */
  [option: string]: unknown;
  host?: string;
  port?: number;
  secure?: boolean;
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
  serverOptions: EmailServerOptions | string;
}

export interface EmailDefaults {
  from: string;
  subject: string;
  format: 'html' | 'text';
  cc?: string;
  bcc?: string;
  otherSendOptions?: Record<string, unknown>;
}

export interface EmailTemplate {
  subject?: string;
  template?: string;
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
    transferOwnerTo: { subject: 'Ownership of DMP record/s has been transferred to you', template: 'transferOwnerTo' },
    test: { subject: 'Test Email Message', template: 'test' },
  },
};
