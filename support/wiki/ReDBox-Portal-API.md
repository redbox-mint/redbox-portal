### Introduction to ReDBox Portal API

The ReDBox Portal API facilitates comprehensive data and metadata management, supporting a wide array of functions from record lifecycle management to user administration and communication tools. It's designed for seamless integration with external systems, enabling efficient automation of research data workflows.

### Creating an API User

1. **Access and Permissions**: Log into the ReDBox dashboard with admin rights and navigate to the user management interface.
2. **User Creation**: Add a new local user, specifying the role required for API access.
3. **Token Generation**: After the user is created. Generate a token for the user by clicking edit and then the Generate API Key button on the dialog that opens. This token serves as the bearer token for authenticating API requests.

### User Management API Additions

The Manage Users feature now exposes a small set of brand-admin endpoints for account administration:

- `GET /:branding/:portal/api/users/link/candidates`
- `GET /:branding/:portal/api/users/:id/links`
- `POST /:branding/:portal/api/users/link`
- `GET /:branding/:portal/api/users/:id/audit`
- `POST /:branding/:portal/api/users/:id/disable`
- `POST /:branding/:portal/api/users/:id/enable`

These endpoints are intended for brand-admin user management rather than general end-user automation. For behavior details and UI context, see the **[User Management](https://github.com/redbox-mint/redbox-portal/wiki/User-Management)** page.

### REST API Reference

For the full REST API reference, see the [REST API Documentation](https://github.com/redbox-mint/redbox-portal/wiki/REST-API-Documentation) page.
