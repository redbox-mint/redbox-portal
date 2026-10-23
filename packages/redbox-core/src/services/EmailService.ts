export * from '../compat/sails/email';
declare global {
  let EmailService: import('../compat/sails/email').Services.Email;
}
