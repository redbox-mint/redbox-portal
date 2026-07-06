import {
  processDataProperties,
  processDataPropertyRedactCircularElement, processDataPropertyRedactKnownSensitivePatternsElement,
  processDataPropertyRedactSensitiveElement
} from "../../src/data-helpers";
import {decycleObjectForJSONata} from "../../src";

describe('Data Helpers', function () {
  let expect: Chai.ExpectStatic;

  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  describe('processing data properties', function () {
    it('should redact a known sensitive pattern', async function () {
      const actual = processDataProperties({
        brandId: 'brand-1',
        triggeredBy: 'manual',
        requestSummary: {authorization: 'Bearer secret', triggerSource: 'manual'},
        headers: {
          cookie: 'headers-cookie',
          authorization: 'headers-authorization',
          'x-forwarded-for': 'headers-x-forwarded-for'
        },
        cookies: {
          lng: 'cookes-lng',
          'redbox.sid': 'cookies-redbox-sid'
        },
        password: 'password'
      }, {
        elements: [
          processDataPropertyRedactSensitiveElement,
          {
            action: "redact",
            type: "sensitive",
            redactValue: "[HIDDEN_PASSWORD]",
            path: ['password']
          }
        ],
        custom: [
          processDataPropertyRedactKnownSensitivePatternsElement,
        ],
      });
      expect(actual).to.eql({
        brandId: 'brand-1',
        triggeredBy: 'manual',
        requestSummary: {authorization: '[REDACTED]', triggerSource: 'manual'},
        headers: {
          cookie: '[REDACTED]',
          authorization: '[REDACTED]',
          'x-forwarded-for': '[REDACTED]'
        },
        cookies: {
          lng: '[REDACTED]',
          'redbox.sid': '[REDACTED]'
        },
        password: '[HIDDEN_PASSWORD]'
      })
    });

    it('should redact a circular reference', async function () {
      const data = {
        brandId: 'brand-1',
        triggeredBy: 'manual',
        requestSummary: {authorization: 'Bearer secret', triggerSource: 'manual'},
        data: {},
        data2: [] as unknown[],
      };
      data.data = data;
      data.data2.push(data);
      const actual = processDataProperties(data, {
        elements: [
          processDataPropertyRedactCircularElement,
          {
            action: "delete",
            type: "circular",
            path: ['data2', 0],
          }
        ],
        custom: [],
      });
      expect(actual).to.eql({
        brandId: 'brand-1',
        triggeredBy: 'manual',
        requestSummary: {authorization: 'Bearer secret', triggerSource: 'manual'},
        data: '[CIRCULAR]',
        data2: []
      })
    });

    it('should decycle an object for jsonata', async function () {
      const obj: any = { a: 1, b: 'test', fn: () => {} };
      obj.child = { parent: obj };

      const result = processDataProperties(obj,{
        elements: [
          {
            action: "delete",
            type: "circular",
          },
          {
            action: "delete",
            type: "function",
          }
        ],
        custom: [],
      });

      // The circular reference 'parent' should be removed
      // function should be gone
      expect(result).to.deep.equal({a: 1, b: 'test', child: {}});

      // Should be a copy
      expect(result).to.not.equal(obj);
    });
  });

});
