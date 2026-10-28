# Configuring Email Notifications

## Introduction

The ReDBox portal has a flexible email notification system that can be customised to your needs.

## Configuring Email Settings

The `config/emailnotification.js` file provides configuration properties relating to the sending of emails.

```
api
|
|- send
|
settings
|
|- enabled
|
|- from
|
|- templateDir
|
defaults
|
|- from
|
|- subject
|
|- format
|
templates
|
|- <template name>
    |
    |- subject
    |
    |- template
|
```
Where <> are property labels that are variables.

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| api/send    | The URL and HTTP method of the API endpoint to send emails (via ReDBox) | Yes      | N/A           |
| settings    | Section used to capture email notification settings  | Yes      | N/A           |
| settings/enabled    | Whether email notifications are enabled | Yes      | true         |
| settings/from    | The from address to use when sending emails | Yes      | noreply@redboxresearchdata.com.au         |
| settings/templateDir    | The template directory that contains the email template files | Yes      | views/emailTemplates/        |
| defaults   | Section used to capture default properties for emails (when not otherwise set) | Yes      | N/A          |
| defaults/from    | The default from address | Yes      | redbox@redboxresearchdata.com.au             |
| defaults/subject    | The default from email subject | Yes      | A notification from ReDBox         |
| defaults/format    | The email format, can either be in HTML or plain text | Yes      | html         |

### Example
```
api: {
  send: {method: 'post', url: "/api/v1/messaging/emailnotification"}
},
settings: {
  enabled: true,
  from: "noreply@redbox",
  templateDir: "views/emailTemplates/"
},
defaults: {
  from: "redbox@dev",
  subject: "ReDBox Notification",
  format: "html"
},
```

## Customising Email Templates

Both the subjects and the contents of email notifications can be customised via configuration and templates.

### Configuring email subjects and templates
The templates section of the `config/emailnotification.js` file contains configuration to customise the subject and template for an email notification.

```
<email-code>
|
|- subject
|
|- template
|
```

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| < email-code >    | The email code used by the application to find the configuration to trigger an email | Yes      | transferOwnerTo           |
| < email-code >/subject    | The email's subject | Yes      | Ownership of DMP record/s has been transferred to you |
| < email-code >/template    | The template file (located in the directory specified in the settings/templateDir property) to use to render the contents | Yes      | transferOwnerTo |

### Example
```
templates: {
  transferOwnerTo: {subject: 'Ownership of DMP record/s has been transferred to you', template: 'transferOwnerTo'}
}
```

### Email Templates

Email templates are located in the directory defined in the `settings/templateDir` property of the `config/emailnotification.js` file. They are written in the [EJS templating language](http://www.embeddedjs.com/) which allows for rich and complex formatting.

#### Example
```
<h1>Hello!</h1>
<p>This is a test email from ReDBox Portal</p>
<p>Data: <%= data %></p>
```

## Sending a template from a hook or service

`EmailService.sendTemplate(to, subject, template, data)` returns a
`Promise<{ success: boolean, msg: string }>` that resolves after template building
and delivery complete, with the successful `sendMessage` result. It rejects for
build or delivery errors, a non-200 template build status, or a delivery result
with `success: false`. A template build's `ex` is propagated when present;
otherwise the rejection describes the failed build status or delivery message.
When email is disabled, the existing successful “Email services disabled.” result
is preserved.

```typescript
try {
  const result = await EmailService.sendTemplate(to, subject, 'my-template', data);
  sails.log.info(result.msg);
} catch (error) {
  // Handle failed template building or delivery in the calling workflow.
  sails.log.error(error);
}
```

The return value was previously `void`. Sending still starts immediately and
occurs once per call, including when older hooks ignore the return value.
Failures are also logged by the service so ignored returns do not cause unhandled
Promise rejections. Await or catch the returned Promise when the caller needs to
react to completion or failure. This helper does not change the separate
`sendRecordNotification` workflow.
