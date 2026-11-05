let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { SYSTEM_MESSAGE_SCHEMA, SystemMessage } from '../../src/configmodels/SystemMessage';

describe('SystemMessage', function() {
  it('should have defaults', function() {
    const config = new SystemMessage();
    expect(config.enabled).to.be.false;
    expect(config.style).to.equal('info');
    expect(config.dismissalDurationHours).to.equal(8);
  });

  it('keeps style optional in existing saved configurations and declares its enum/default', () => {
    expect(SYSTEM_MESSAGE_SCHEMA.required).not.to.include('style');
    expect(SYSTEM_MESSAGE_SCHEMA.properties.style).to.include({ default: 'info' });
    expect(SYSTEM_MESSAGE_SCHEMA.properties.style.enum).to.deep.equal(['info', 'warning', 'critical']);
    expect(Object.assign(new SystemMessage(), { enabled: true, title: 'Legacy' }).style).to.equal('info');
  });

  it('should have getFieldOrder', function() {
    const order = SystemMessage.getFieldOrder();
    expect(order).to.deep.equal(["enabled", "title", "message", "dismissalDurationHours", "style"]);
  });
});
