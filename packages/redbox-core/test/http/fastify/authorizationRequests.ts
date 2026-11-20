type Declaration = { method: string; path: string; mutating?: boolean; sideEffecting?: boolean };

const recorder = require('../../../../../support/tooling/fastify-retirement/authorization-requests.cjs') as {
  registerPortal(port: number, root: string, declarations?: readonly Declaration[]): () => void;
  witness<T>(title: string, run: () => Promise<T>): Promise<T>;
  capture(port: number): () => string[];
};

export const {
  registerPortal: registerAuthorizationPortal,
  witness: authorizationWitness,
  capture: captureAuthorizationRequests,
} = recorder;
