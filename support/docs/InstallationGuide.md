# Installation Guide

## Service Dependencies
The following dependencies will need to be installed on the OS:
* [NodeJS environment version 6.x](https://nodejs.org/en/)
* [MongoDB](https://www.mongodb.com/)
* A reverse proxy server such as [Nginx](https://nginx.org/en/) or [Apache HTTP Server](https://httpd.apache.org/)
* [Git](https://git-scm.com/)

## Node dependencies
Once you have a NodeJS environment installed install the following dependencies globally using the ```npm install -g <dependency>``` command:
* [yarn](https://yarnpkg.com/en/)
* [pm2](http://pm2.keymetrics.io/)

## Install the ReDBox Portal

1. Checkou the ReDBox Portal to your location of choice (e.g. /opt/redbox-portal)

```
git clone -b dev_build "https://github.com/redbox-mint/redbox-portal"
```

2. Create a [ecosytem.json](http://pm2.keymetrics.io/docs/usage/deployment/) file for PM2 as below. See the [configuration guide](https://github.com/redbox-mint/redbox-portal/wiki/Configuration-Guide) for information on how to configure the env section.
```
{
  "apps" : [{
    // Application #1
    "name"        : "rbportal",
    "script"      : "app.js",
    "args"        : [],
    "watch"       : true,
    "node_args"   : "",
    "merge_logs"  : true,
    "cwd"         : "/opt/redbox-portal/",
    "env": {
      "NODE_ENV": "development",
      "redboxApiKey": ""
    }
  }
  ]
}
```

3. Copy your configuration changes over the installation. See the [configuration guide](https://github.com/redbox-mint/redbox-portal/wiki/Configuration-Guide)
4. Setup PM2 run on init (depending on your distro) e.g `pm2 startup systemd`
5. Start the application
```
pm2 start ecosystem.json
```
6. Save the PM2 configuration
```
pm2 save
```
