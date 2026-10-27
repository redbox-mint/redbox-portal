const sinon = require('sinon');

async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  try {
    assertion();
    return;
  } catch (error) {
    lastError = error;
  }
  throw lastError;
}

function navigationResponse(url: string, status = 200, redirects: string[] = []) {
  return {
    status: () => status,
    url: () => url,
    request: () => ({
      redirectChain: () => redirects.map(redirectUrl => ({ url: () => redirectUrl })),
    }),
  };
}

function navigationRequest(url: string, frame: unknown, response: ReturnType<typeof navigationResponse> | null = null) {
  return {
    url: () => url,
    isNavigationRequest: () => true,
    frame: () => frame,
    headers: () => ({}),
    continue: sinon.stub().resolves(),
    abort: sinon.stub().resolves(),
    response: sinon.stub().returns(response),
  };
}

function pdfDependencies(overrides: Record<string, unknown> = {}) {
  const disk = { put: sinon.stub().resolves(), delete: sinon.stub().resolves() };
  return {
    config: { appUrl: 'http://localhost:1500' },
    log: { verbose: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
    datastreams: { addDatastream: sinon.stub().resolves({}) },
    brandById: sinon.stub().returns({ name: 'default' }),
    optionsForBrand: () => ({ token: 'test-token' }),
    stagingDisk: sinon.stub().returns(disk),
    runAcceptedWork: (operation: () => Promise<unknown>) => operation(),
    ...overrides,
  };
}

module.exports = { pdfDependencies, waitForAssertion, navigationResponse, navigationRequest };
