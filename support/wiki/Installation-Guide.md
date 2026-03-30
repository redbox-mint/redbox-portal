This guide provides step-by-step instructions on how to set up and run RedBox Portal using Docker. The setup described below is intended for evaluation purposes. If you plan to use RedBox Portal in a production environment, please see the **Considerations for Production Use** section at the end of this guide.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- Docker: [Install Docker](https://docs.docker.com/get-docker/)
- Docker Compose: [Install Docker Compose](https://docs.docker.com/compose/install/)

## Installation Steps for Evaluation

1. **Prepare the Docker Compose File**: Create a `docker-compose.yml` file in your desired directory and copy the following content into the file:

   ```yaml
   version: '3.1'
   networks:
     main:
   services:
     redboxportal:
       image: qcifengineering/redbox-portal:develop
       ports:
         - "1500:1500"
       user: node
       expose:
         - "1500"
       environment:
         - NODE_ENV=docker
         - PORT=1500
         - sails_record__baseUrl__mint=https://demo.redboxresearchdata.com.au/mint
       networks:
         main:
           aliases:
             - rbportal
       entrypoint: /bin/bash -c "cd /opt/redbox-portal && node app.js"
     mongodb:
       image: mongo:latest
       volumes:
         - "./devdata:/devdata:delegated"
         - "./.dev/mongo/data/db:/data/db:delegated"
         - "./.dev/log/mongo:/var/log/mongo:delegated"
       networks:
         main:
           aliases:
             - mongodb
       ports:
         - "27017:27017"
     solr:
       image: solr:latest
       expose:
         - "8983"
       ports:
         - "8983:8983"
       networks:
         main:
          aliases:
            - solr
       entrypoint:
         - docker-entrypoint.sh
         - solr-precreate
         - redbox
   ```

2. **Launch the Services**: Navigate to the directory containing your `docker-compose.yml` file and run the following command to start all services for evaluation:

   ```bash
   docker-compose up -d
   ```

   This command will start the necessary containers for the RedBox Portal, MongoDB, and Solr services.

3. **Verify the Installation**: Access the RedBox Portal web interface through:

   ```
   http://localhost:1500
   ```

   Adjust the URL based on your server's configuration if necessary.

## Considerations for Production Use

When moving from an evaluation setup to a production environment, consider the following:

- **Data Persistence**: Ensure data volumes used by Docker are backed up regularly. Consider using Docker volume plugins that support external storage systems.

- **Security**: Implement network security measures such as firewalls and network segmentation. Secure your Docker daemon and use Docker security features like user namespaces and seccomp profiles.

- **HTTPS Support**: Set up an Nginx reverse proxy with SSL/TLS to secure communications with the RedBox Portal. Obtain a valid SSL certificate and configure Nginx to use it.

- **Resource Management**: Allocate sufficient resources (CPU, memory, storage) based on your expected load. Monitor resource usage and adjust as necessary.

- **Logging and Monitoring**: Set up logging and monitoring for your Docker containers and RedBox Portal application to identify and troubleshoot issues promptly.

- **Regular Updates**: Keep your Docker images, RedBox Portal application, and all dependencies up to date to ensure you have the latest features and security patches.

By following these considerations, you can ensure a stable and secure production environment for your RedBox Portal deployment.