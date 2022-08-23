/**
 * AppConfig.js
 *
 * @description :: Branding aware application configuration. Allows the system to have different configuration for different brandings. Accessible via sails.config.brandedConfig(branding)
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

 module.exports = {
    attributes: {
      configKey: {
        type: 'string',
        required: true
      },
      // A role needs to belong to a Brand, 1 to 1
      branding: {
        model: 'brandingconfig',
        required: true
      },
      // Roles have many users
      configData: {
        type: 'json'
      }
    }
  }
  