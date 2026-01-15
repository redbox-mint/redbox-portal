### Node Version Manager (NVM) Usage ###

Our project requires different Node.js versions for the backend Sails application and legacy Angular applications. We manage these requirements with Node Version Manager (NVM). `.nvmrc` files located in the root, `/angular`, and `/angular-legacy` directories specify the needed Node versions. Navigate to each directory and execute `nvm install` followed by `nvm use` to ensure the proper Node environment for each segment. This ensures consistency across different parts of the project.

### Backend Compilation (Sails):
1. **Install Packages**: Run `npm install` within the backend directory to ensure all dependencies are up to date.
2. **Compile TypeScript**: Execute `npm run compile:sails` to compile the TypeScript files into JavaScript. This is crucial for the Sails backend to function correctly.

### Frontend Compilation (Angular):

For compiling Angular TypeScript files, use the command `npm run compile:ng`. This process compiles all Angular applications, generating frontend bundles equipped with source maps to facilitate debugging.

### Running the Application:
1. **Start Services**: Utilize `npm run dev:run` to launch the Docker Compose stack. This command sets up all required services in containers.
2. **Docker Commands**: For more control, use standard Docker Compose commands with `docker-compose -f support/development/docker-compose.yml` to manage individual services.

### Running All Steps:

For initial environment setup, you can use `npm run dev:all`. This command streamlines the process by compiling both the backend and frontend, and setting up the application stack for the first time.