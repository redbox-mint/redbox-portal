export class SqsUnsupportedFeatureError extends Error {
	constructor(feature: string) {
		super(`SQS backend does not support ${feature}`);
		this.name = 'SqsUnsupportedFeatureError';
	}
}
