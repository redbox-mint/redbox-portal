export * from '../compat/sails/recordTriggers';
declare global {
  let RDMPService: import('../compat/sails/recordTriggers').Services.RDMPS;
}
