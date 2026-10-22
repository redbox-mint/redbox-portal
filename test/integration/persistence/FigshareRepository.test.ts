import { mongoDatabase } from '@researchdatabox/redbox-core';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getFigshareSyncRepository} from '@researchdatabox/redbox-core';
describe('Selected Figshare durable repository in the stock application',()=>{
 it('uses the selected owner for replacement, partial binding and numeric lease fencing',async()=>{
  const repo=getFigshareSyncRepository(),oid='stock-'+randomUUID(),brandId=String(BrandingService.getDefault().id);
  const manager = await mongoDatabase(sails, 'mongodb');
  try{
   await repo.initialise(oid,brandId);await repo.change(oid,s=>{s.waitingReason='remove';});await repo.change(oid,s=>{delete s.waitingReason;});
   const raw=await manager.collection('figsharesync').findOne({oid});assert(raw);assert.equal(raw.createdAt,undefined);assert.equal(raw.waitingReason,undefined);assert.equal(typeof raw.leaseUntil,'number');
   await repo.request(oid,'sync',1);const claims=await Promise.all(['one','two'].map(owner=>repo.claim(oid,brandId,owner,30000)));assert.equal(claims.filter(Boolean).length,1);const owner=claims.find(Boolean)!.leaseOwner!;await repo.assertOwner(oid,owner);await repo.release(oid,owner);await assert.rejects(repo.assertOwner(oid,owner));
  }finally{await manager.collection('figsharesync').deleteOne({oid});}
 });
});
