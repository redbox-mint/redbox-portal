let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { buildRedboxSessionOptions, redboxSession } from '../../src/middleware/redboxSession';

describe('Middleware: redboxSession', () => {

  it('should return a function', () => {
    const middleware = redboxSession({ secret: 'test-secret' });
    expect(middleware).to.be.a('function');
  });

  it('should default session cookies to secure, httpOnly, and SameSite=Lax', () => {
    const options = buildRedboxSessionOptions({ secret: 'test-secret' });

    expect(options.cookie).to.deep.include({
      secure: true,
      httpOnly: true,
      sameSite: 'lax'
    });
  });

  it('should preserve explicit cookie overrides', () => {
    const options = buildRedboxSessionOptions({
      secret: 'test-secret',
      cookie: {
        secure: false,
        maxAge: 1234
      }
    });

    expect(options.cookie).to.deep.include({
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1234
    });
  });

  //TODO: Difficult to properly unit test this function as we'd have to mock express-session. Revisit at a later time.
});
