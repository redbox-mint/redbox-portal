import { CONFIG_LABEL_TERMS, configLabel, protectConfigLabelTerms } from './config-label';

describe('configuration label casing', () => {
  for (const term of CONFIG_LABEL_TERMS) {
    it(`protects ${term} at the beginning and inside labels`, () => {
      expect(configLabel(`${term} configuration`)).toBe(`${term} configuration`);
      expect(configLabel(`Default ${term.toLowerCase()} value`)).toBe(`Default ${term} value`);
    });
  }
  it('splits camel case and preserves acronyms', () => {
    expect(configLabel('apiURL')).toBe('API URL');
    expect(configLabel('apiUrl')).toBe('API URL');
    expect(configLabel('rootCollectionId')).toBe('Root collection ID');
    expect(configLabel('RO-Crate metadata mapping')).toBe('RO-Crate metadata mapping');
  });
  it('repairs translated labels without changing words or partial matches', () => {
    expect(protectConfigLabelTerms('Ro-crate metadata mapping')).toBe('RO-Crate metadata mapping');
    expect(protectConfigLabelTerms('Api url and Oauth')).toBe('API URL and OAuth');
    expect(protectConfigLabelTerms('Valid identity and rapid URLs')).toBe('Valid identity and rapid URLs');
  });
});
