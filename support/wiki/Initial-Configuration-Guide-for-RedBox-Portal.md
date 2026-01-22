This guide provides detailed instructions on the initial configuration for the RedBox Portal, which is built on the Sails.js framework, and includes custom configuration options specific to the RedBox Portal.

## Configuring Sails.js

Before customizing RedBox Portal specific settings, ensure you are familiar with configuring Sails.js, as the application leverages this framework extensively.

### Key Sails.js Configuration Files:

- **`config/env/production.js`**: Settings for production mode.
- **`config/env/development.js`**: Settings for development mode.
- **`config/datastores.js`**: Database connection configurations.
- **`config/models.js`**: Default settings for application models.
- **`config/security.js`**: Security settings, including CORS and CSRF.
- **`config/session.js`**: Session handling configurations.
- **`config/log.js`**: Log level and custom logging settings.

For a comprehensive understanding of Sails.js configurations, refer to the [Sails.js Configuration Documentation](https://sailsjs.com/documentation/concepts/configuration).

## Custom Configuration Options for RedBox Portal

After setting up the basic Sails.js configuration, you can customize RedBox Portal to fit your specific needs with the following options:

### `appUrl`

Defines the base URL of the RedBox Portal application for correct link rendering.

```javascript
module.exports = {
    // Other configurations...
    appUrl: 'http://localhost:1500' // Replace with your application's actual URL
};
```

**Considerations**:
- Avoid adding a trailing slash (`/`).
- Ensure the URL is accessible, considering network restrictions or firewalls.
- Changing this URL post-distribution can impact existing links.

### `http.rootContext`

Specifies the root context of the application URL, useful for hosting the application in a specific path.

```javascript
module.exports = {
    // Other configurations...
    http: {
        rootContext: 'data' // Change 'data' to your application's subdirectory
    }
};
```

**Usage**:
- Access the application via the specified root context, e.g., `http://localhost:1500/data/`.

**Considerations**:
- Match `rootContext` with the actual deployment path.
- Adjust server settings and redirects accordingly.
