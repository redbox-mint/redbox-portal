import { expect } from 'chai';
import { redboxSession } from '../../src/middleware/redboxSession';
import * as sinon from 'sinon';

describe('Middleware: redboxSession', () => {

  it('should return a function', () => {
    const middleware = redboxSession({});
    expect(middleware).to.be.a('function');
  });

  //TODO: Difficult to properly unit test this function as we'd have to mock express-session. Revisit at a later time.
});
