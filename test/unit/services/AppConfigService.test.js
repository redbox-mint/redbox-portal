const { expect } = require("chai");

describe('appConfigService', function () {
  let appConfigService;

  beforeEach(() => {
    appConfigService = sails.services.appconfigservice;
  });

  // it('should bootstrap successfully', async () => {
  //   await appConfigService.bootstrap();
  //   // Add your assertions here
  //   expect(true).to.be.true;
  // });

  it('should get the app configuration for a brand', () => {
    const brandName = 'default';
    const appConfig = appConfigService.getAppConfigurationForBrand(brandName);
    expect(appConfig.systemMessage).to.not.be.null;
  });

  it('should create or update a configuration', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'systemMessage';
    const message = 'test message';
        const enabled =  true;

    let configData = {};
    configData.message = message;
    configData.enabled = enabled;
    sails.log.error("branding:")
    sails.log.error(branding)
    const updatedConfigData = await appConfigService.createOrUpdateConfig(branding, configKey, configData);
    const updatedConfig = appConfigService.getAppConfigurationForBrand(brandName);

    expect(updatedConfig[configKey].message).to.eq(message);
    expect(updatedConfig[configKey].enabled).to.eq(enabled);
  });


  it('should get all configurations for a brand from the database', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configurations = await appConfigService.getAllConfigurationForBrand(branding.id);
    expect(configurations).to.not.be.null;
    expect(configurations.length).to.be.greaterThan(0);
  });

  it('should get the app configuration by brand and key', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'systemMessage';
    const configData = await appConfigService.getAppConfigByBrandAndKey(branding.id, configKey);
    expect(configData.message).to.eq('test message')
  });

  it('should throw an error when key does not exist', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'fakeConfigKey';
    try {
      const configData = await appConfigService.getAppConfigByBrandAndKey(branding.id, configKey);
      expect.fail("Should have thrown error");
    } catch(err) {
      expect(err).to.be.an('error');
    }
  });

  

  it('should create a configuration', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'exampleConfigKey';
    const configData = { example: 'data' };
    const createdConfigData = await appConfigService.createConfig(brandName, configKey, configData);
    
    expect(createdConfigData.example).to.eq(configData.example);  
    const updatedConfig = appConfigService.getAppConfigurationForBrand(brandName);
    expect(updatedConfig[configKey].example).to.eq(configData.example);  

  });

  it('should get the app config form', async () => {
    const branding = BrandingService.getBrand('default');
    const configForm = 'systemMessage';
    const appConfigForm = await appConfigService.getAppConfigForm(branding, configForm);
    expect(appConfigForm).to.not.be.null;
  });
});