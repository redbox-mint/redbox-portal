import path from "path";
import {isLikelyNaturalLanguage} from "../../src/translation-helpers";
import fs from 'fs';

describe('Translation helpers', function () {
  let expect: any;

  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  describe('guess string type', function () {
    const guessStringTypeCases = [
      {title: "empty is nothing", key: "", expected: false},
      {title: "null is nothing", key: null, expected: false},
      {title: "start with @ and norm is i18n", key: " @dmpt-foaf:fundedBy_vivo:Grant-help ", expected: false},
      {title: "start with capital is nat lang", key: " Dmpt-foaf:fundedBy_vivo:Grant-help ", expected: true},
      {title: "space makes nat lang", key: " @dmpt-foaf:fundedBy_vivo: Grant-help ", expected: true},
      {title: "alpha and dash is not nat lang", key: "workspace-name", expected: false},
      {title: "alpha and underscore is not nat lang", key: "workspace_name", expected: false},
    ];
    guessStringTypeCases.forEach(({title, key, expected}) => {
      it(`should ${title}`, async function () {
        expect(isLikelyNaturalLanguage(key)).eql(expected);
      });
    });
  });

});
