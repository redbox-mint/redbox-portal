Requirements:

- Docker and Docker Compose
- Node.js via nvm (multiple versions in `.nvmrc` files)

Devcontainer (recommended):

1. Open `redbox-portal` in VS Code and choose "Reopen in Container".
2. The devcontainer installs Chrome/Chromedriver and runs `npm run nvm:install-all`.
3. If you need `portal-ng-form-custom`, clone it alongside this repo and open the parent folder so both repos are available.

Legacy Vagrant:

We still support the VM provisioned via Vagrant for a seamless development environment. Access this through our [Vagrant repository](https://github.com/qcif/vagrant-redbox-dev).
