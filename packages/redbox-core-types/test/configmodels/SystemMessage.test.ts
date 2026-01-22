import { expect } from 'chai';
import { SystemMessage } from '../../src/configmodels/SystemMessage';

describe('SystemMessage', function() {
  it('should have defaults', function() {
    const config = new SystemMessage();
    expect(config.enabled).to.be.false;
  });

  it('should have getFieldOrder', function() {
    const order = SystemMessage.getFieldOrder();
    expect(order).to.deep.equal(["enabled", "title", "message"]);
  });
});
