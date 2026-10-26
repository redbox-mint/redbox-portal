const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { mongoDatabase } from '@researchdatabox/redbox-core';
import { fixtureRemove } from '../../helpers/persistenceFixtures';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getSiemRepository } from '@researchdatabox/redbox-core';

describe('Selected SIEM persistence in the stock application',()=>{
 it('uses the selected owner for raw-compatible capture, history and fenced delivery',async()=>{
  const repo=getSiemRepository(fixture.owner);const eventId=`stock-${randomUUID()}`;const brandId=String(fixture.services.BrandingService.getDefault().id);
  const manager = await mongoDatabase(fixture.owner, 'mongodb');
  try{
   await repo.capture({eventId,brandId,eventType:'test',category:'authentication',severity:'info',occurredAt:new Date().toISOString(),source:'stock',deliveryState:'pending',payload:{safe:true}});
   const event=await repo.findEvent(eventId,brandId);assert(event);assert.equal(Reflect.get(event,'_id'),undefined);
   const raw=await manager.collection('securityevent').findOne({eventId});assert(raw);assert.equal(raw._id.toHexString(),event.id);assert.equal(typeof raw.brandId,'string');assert.equal(raw.actor,null);
   const claims=await Promise.all([repo.claimDelivery(event,30000),repo.claimDelivery(event,30000)]);assert.equal(claims.filter(Boolean).length,1);
   const owned=claims.find(Boolean)!;assert.equal(await repo.saveDelivery(owned,{deliveryState:'delivered',leaseToken:null,leaseExpiresAt:null}),true);assert.equal(await repo.saveDelivery(owned,{deliveryState:'failed'}),false);
   await repo.appendAttempt({eventId,brandId,destinationId:'stock',adapterType:'otel-otlp-logs',attemptNumber:1,status:'success',startedAt:new Date().toISOString()});assert.equal(await repo.countAttempts({eventId,brandId}),1);
  }finally{await fixtureRemove("SiemDeliveryAttempt", {eventId});await fixtureRemove("SecurityEvent", {eventId});}
 });
});
