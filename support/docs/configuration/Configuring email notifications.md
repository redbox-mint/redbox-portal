# Configuring email notifications

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
| api/send    | The url and HTTP method of the API endpoint to send emails (via ReDBox)| Yes      | N/A           |
| settings    | Section used to capture email notification settins  | Yes      | N/A           |
| settings/enabled    | Whether email notifications are enabled | Yes      | true         |
| settings/from    | The from address to use when sending emails | Yes      | noreply@redboxresearchdata.com.au         |
| settings/templateDir    | The template directory that contains the email template files | Yes      | views/emailTemplates/        |
| defaults   | Section used to capture default properties for emails (when not otherwise set) | Yes      | N/A          |
| defaults/from    | The default from address | Yes      | redbox@redboxresearchdata.com.au             |
| defaults/subject    | The default from email subject | Yes      | A notification from ReDBox         |
| defaults/format    | The email format, can either be in HTML or plain text | Yes      | html         |

#### Example
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

The both the subjects and the contents of email notifications can be customised via configuration and templates.


### Configuring email subjects and templates
The templates section of the `config/emailnotification.js` file contains configuration to customise the subject and template for an email notification

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

#### Example
```
templates: {
  transferOwnerTo: {subject: 'Ownership of DMP record/s has been transferred to you', template: 'transferOwnerTo'}
}
```

### Email Templates

Email templates are located in the directory defined in the `settings/templateDir` property of the `config/emailnotification.js` files. They are written in the [EJS templating language](http://www.embeddedjs.com/) which allows for rich and complex formatting.


#### Example
```
<h1>Hello!</h1>
<p>This is a test email from ReDBox Portal</p>
<p>Data: <%= data %></p>
```
