module.exports.raid = {
  enabled: true,
  basePath: 'https://demo.raido-infra.com',
  token: '',
  servicePointId: 20000003,
  saveBodyInMeta: true,
  retryJobName: 'RaidMintRetryJob',
  retryJobSchedule: 'in 5 minutes', // https://github.com/matthewmueller/date#examples
  retryJobMaxAttempts: 5 // includes the initial attempt
};