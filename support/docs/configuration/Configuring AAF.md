# Configuring AAF

# Introduction

The ReDBox portal is compatible out of the box with AAF Credentials.

## Configuring

The `config/env/development.js` or `config/env/production.js` file provides the configuration objects for authorisation

```
auth: {
    // Default brand...
    default: {
      active: ["aaf", "local"],
      aaf: {
        loginUrl: "https://rapid.test.aaf.edu.au/jwt/authnrequest/research/XXXXXX",
        opts: {
          secretOrKey: 'XXXXXX',
          jsonWebTokenOptions: {
            issuer: 'https://rapid.test.aaf.edu.au',
            audience: 'https://dev-redbox.research.uts.edu.au/default/rdmp/',
            ignoreNotBefore: true
          }
        }
      }
    }
  }
```

- Proceed to https://rapid.test.aaf.edu.au for test environments and https://rapid.aaf.edu.au for production environments
- Register a new service
    - The Callback URL should be `<Main domain>/user/login_aaf`
- If it is a development environment a unique url will be automatically provided
