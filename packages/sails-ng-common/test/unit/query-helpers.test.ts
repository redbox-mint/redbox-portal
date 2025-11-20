import { decycleObject, queryJSONata, JSONataQuerySource } from '../../src/';

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe('query-helpers', () => {
  describe('decycleObject', () => {
    it('should copy a simple object', () => {
      const obj = { a: 1, b: 'test' };
      const result = decycleObject(obj);
      expect(result).to.deep.equal(obj);
      expect(result).to.not.equal(obj); // Should be a copy
    });

    it('should remove circular references', () => {
      const obj: any = { name: 'root' };
      obj.child = { parent: obj };
      
      const result = decycleObject(obj);
      // The circular reference 'parent' should be removed
      expect(result).to.deep.equal({ name: 'root', child: {} });
    });

    it('should filter out specified keys', () => {
      const obj = { 
        name: 'keep', 
        lineagePaths: 'remove', 
        appRef: 'remove' 
      };
      const result = decycleObject(obj);
      expect(result).to.deep.equal({ name: 'keep' });
    });
  });

  describe('queryJSONata', () => {
    it('should execute a simple query', async () => {
      const source: JSONataQuerySource = {
        queryOrigSource: {},
        querySource: [
          { name: 'field1', component: { type: 'text' } }
        ]
      };
      
      // jsonata evaluate can return a Promise
      const result = await queryJSONata(source, "$[name='field1'].component.type");
      expect(result).to.equal('text');
    });

    it('should handle complex queries', async () => {
       const source: JSONataQuerySource = {
        queryOrigSource: {},
        querySource: [
          { name: 'field1', component: { value: 10 } },
          { name: 'field2', component: { value: 20 } }
        ]
      };
      
      const result = await queryJSONata(source, "$sum($[].component.value)");
      expect(result).to.equal(30);
    });
  });
});
