import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/UsersService';
import { evaluateAuthorizedEmail } from '../../src/utilities/AuthorizedEmailAccess';
import { createMockSails } from './testHelper';

// Characterization of the sign-in gate. Case/whitespace normalization intentionally fixes the legacy rule bug.
export const authorizedEmailCases: [string, unknown, any, string, boolean][] = [
  ['missing email even when off', '', {}, 'aaf', false],
  ['missing @ even when off', 'invalid', {}, 'oidc', false],
  ['multiple @ even when off', 'a@b@c', {}, 'aaf', false],
  ['legacy format check only counts @', '@', {}, 'oidc', true],
  ['restriction absent', 'user@uni.edu.au', {}, 'aaf', true],
  ['restriction false', 'user@uni.edu.au', { enabled: false }, 'aaf', true],
  ['string true enables', 'user@other.org', { enabled: 'true', domainsAaf: ['uni.edu.au'] }, 'aaf', false],
  ['uppercase TRUE is off', 'user@other.org', { enabled: 'TRUE', domainsAaf: ['uni.edu.au'] }, 'aaf', true],
  ['unknown provider while off', 'user@uni.edu.au', {}, 'unknown', true],
  ['unknown provider while on', 'user@uni.edu.au', { enabled: true }, 'unknown', false],
  ['empty provider lists allow all', 'user@other.org', { enabled: true }, 'aaf', true],
  ['empty lists independent of other provider', 'user@other.org', { enabled: true, domainsOidc: ['uni.edu.au'] }, 'aaf', true],
  ['AAF exact domain', 'user@uni.edu.au', { enabled: true, domainsAaf: ['uni.edu.au'] }, 'aaf', true],
  ['OIDC exact domain', 'user@uni.edu.au', { enabled: true, domainsOidc: ['uni.edu.au'] }, 'oidc', true],
  ['subdomains do not match', 'user@staff.uni.edu.au', { enabled: true, domainsAaf: ['uni.edu.au'] }, 'aaf', false],
  ['domain suffixes do not match', 'user@notuni.edu.au', { enabled: true, domainsAaf: ['uni.edu.au'] }, 'aaf', false],
  ['input domain ignores case', 'user@UNI.edu.au', { enabled: true, domainsAaf: ['uni.edu.au'] }, 'aaf', true],
  ['rule domain ignores case', 'user@uni.edu.au', { enabled: true, domainsAaf: ['UNI.edu.au'] }, 'aaf', true],
  ['email exception', 'user@other.org', { enabled: true, domainsAaf: ['uni.edu.au'], emailsAaf: ['user@other.org'] }, 'aaf', true],
  ['email ignores case', 'User@other.org', { enabled: true, emailsAaf: ['USER@Other.org'] }, 'aaf', true],
  ['email trimmed on both sides', ' user@other.org ', { enabled: true, emailsAaf: [' USER@Other.org  '] }, 'aaf', true],
  ['rule trimmed', 'user@uni.edu.au', { enabled: true, domainsAaf: [' Uni.edu.au  '] }, 'aaf', true],
  ['domain trailing dot on stored rule', 'user@uni.edu.au', { enabled: true, domainsAaf: [' Uni.EDU.au. '] }, 'aaf', true],
  ['domain trailing dot on address', ' User@UNI.edu.au. ', { enabled: true, domainsOidc: ['uni.edu.au'] }, 'oidc', true],
  ['mixed-case OIDC email rule', 'j.smith@uni.edu.au', { enabled: true, emailsOidc: [' J.Smith@Uni.edu.au '] }, 'oidc', true],
  ['normalized domains still exclude subdomains', 'User@Staff.UNI.edu.au.', { enabled: true, domainsOidc: [' UNI.edu.au. '] }, 'oidc', false],
  ['providers isolated', 'user@uni.edu.au', { enabled: true, domainsAaf: ['other.org'], domainsOidc: ['uni.edu.au'] }, 'aaf', false],
  ['populated list without match', 'user@other.org', { enabled: true, emailsOidc: ['someone@other.org'] }, 'oidc', false],
];

describe('Authorized email sign-in semantics', () => {
  let previous: any;
  let users: Services.Users;
  beforeEach(() => {
    previous = (global as any).sails;
    (global as any).sails = createMockSails();
    users = new Services.Users();
    sinon.stub(users, 'updateChronicle');
  });
  afterEach(() => {
    sinon.restore();
    (global as any).sails = previous;
  });
  for (const [name, email, config, provider, allowed] of authorizedEmailCases) {
    it(name, () => {
      (global as any).sails.config.brandingAware = sinon.stub().withArgs('brand').returns({ authorizedDomainsEmails: config });
      expect(users.checkAuthorizedEmail(email as string, 'brand', provider)).to.equal(allowed);
      expect(evaluateAuthorizedEmail(email as string, config, provider).allowed).to.equal(allowed);
    });
  }
});

describe('Authorized email reasons', () => {
  it('distinguishes off, empty lists, exact domain, email exception and denial', () => {
    expect(evaluateAuthorizedEmail('user@uni.edu.au', {}, 'aaf')).to.deep.equal({ allowed: true, reason: 'disabled' });
    expect(evaluateAuthorizedEmail('user@uni.edu.au', { enabled: true }, 'aaf')).to.deep.equal({ allowed: true, reason: 'unrestricted' });
    const config = Object.freeze({ enabled: true, domainsAaf: Object.freeze([' Uni.EDU.au. ']), emailsAaf: Object.freeze(['User@UNI.edu.au', ' Guest@Other.org ']) });
    expect(evaluateAuthorizedEmail('user@uni.edu.au', config as any, 'aaf')).to.deep.equal({ allowed: true, reason: 'allowed-domain', matchedRule: 'uni.edu.au' });
    expect(evaluateAuthorizedEmail('guest@other.org', config as any, 'aaf')).to.deep.equal({ allowed: true, reason: 'allowed-exception', matchedRule: 'guest@other.org' });
    expect(evaluateAuthorizedEmail('user@staff.uni.edu.au', config as any, 'aaf')).to.deep.equal({ allowed: false, reason: 'denied' });
  });
});
