import {guessNameParts, isLikelyNaturalLanguage} from "../../src";

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

  describe('guess name parts', function () {
    const guessStringTypeCases = [
      {title: "empty", value: "", expected: {full: "", first: "", last: ""}},
      {title: "empty", value: "  ", expected: {full: "", first: "", last: ""}},
      {title: "null is empty", value: null as unknown as string, expected: {full: "", first: "", last: ""}},
      {title: "undefined is empty", value: undefined as unknown as string, expected: {full: "", first: "", last: ""}},

      {title: "no spaces is last", value: "TheName", expected: {full: "TheName", first: "", last: "TheName"}},
      {title: "one space is first and last", value: "The    Name", expected: {full: "The Name", first: "The", last: "Name"}},
      {title: "two sets of whitespace is one word first and two word last", value: " The Name \nagain ", expected: {full: "The Name again", first: "The", last: "Name again"}},
      {title: "three sets of whitespace is one word first and three word last", value: "\t The Name again  another", expected: {full: "The Name again another", first: "The", last: "Name again another"}},
    ];
    guessStringTypeCases.forEach(({title, value, expected}) => {
      it(`should ${title}`, async function () {
        expect(guessNameParts(value)).eql(expected);
      });
    });
  });

});
