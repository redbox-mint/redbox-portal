import {decodeBase64, encodeBase64} from "../../src";

describe('HTML helpers', function () {
  let expect: Chai.ExpectStatic;

  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  const cases = [
    {value: 'Renée', encoded: 'UmVuw6ll'},
    {value: '日本語', encoded: '5pel5pys6Kqe'},
    {value: '👋 hello', encoded: '8J+RiyBoZWxsbw=='},
    {value: 'a Ā 𐀀 文 🦄', encoded: 'YSDEgCDwkICAIOaWhyDwn6aE'},
    {value: 'café 😊', encoded: 'Y2Fmw6kg8J+Yig=='},
  ];
  cases.forEach(({value, encoded}) => {
    it(`should encode value '${value}' to '${encoded}'"`, async function () {
      const actualEncoded = encodeBase64(value);
      expect(actualEncoded).to.eql(encoded);

      const actualDecoded = decodeBase64(actualEncoded);
      expect(actualDecoded).to.eql(value);
    });
  });
});
