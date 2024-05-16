import { expect } from 'chai';
import { describe, beforeEach, it } from 'mocha';

describe('AppConfigs', () => {
  let appConfigs;

  beforeEach(() => {
    appConfigs = sails.services.appconfigservice;
  });

  it('should bootstrap successfully', async () => {
    await appConfigs.bootstrap();
    // Add your assertions here
  });

  it('should get the app configuration for a brand', () => {
    const brandName = 'default';
    const appConfig = appConfigs.getAppConfigurationForBrand(brandName);
    expect(appConfig.systemMessages).to.not.be.null;
    
  });

  it('should get all configurations for a brand', async () => {
    const brandId = 'exampleBrandId';
    const configurations = await appConfigs.getAllConfigurationForBrand(brandId);
    // Add your assertions here
  });

  it('should load the app configuration model for a brand', async () => {
    const brandId = 'exampleBrandId';
    const appConfig = await appConfigs.loadAppConfigurationModel(brandId);
    // Add your assertions here
  });

  it('should get the app configuration by brand and key', async () => {
    const brandId = 'exampleBrandId';
    const configKey = 'exampleConfigKey';
    const configData = await appConfigs.getAppConfigByBrandAndKey(brandId, configKey);
    // Add your assertions here
  });

  it('should create or update a configuration', async () => {
    const branding = { id: 'exampleBrandId' };
    const configKey = 'exampleConfigKey';
    const configData = { example: 'data' };
    const updatedConfigData = await appConfigs.createOrUpdateConfig(branding, configKey, configData);
    // Add your assertions here
  });

  it('should create a configuration', async () => {
    const brandName = 'exampleBrand';
    const configKey = 'exampleConfigKey';
    const configData = { example: 'data' };
    const createdConfigData = await appConfigs.createConfig(brandName, configKey, configData);
    // Add your assertions here
  });

  it('should get the app config form', async () => {
    const branding = { name: 'exampleBrand' };
    const configForm = 'exampleConfigForm';
    const appConfigForm = await appConfigs.getAppConfigForm(branding, configForm);
    // Add your assertions here
  });
});