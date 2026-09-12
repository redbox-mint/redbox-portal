export function playwrightScenariosEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RBPORTAL_PLAYWRIGHT_SCENARIOS === 'true' &&
    (env.NODE_ENV === 'development' || env.NODE_ENV === 'integrationtest');
}

/** Retained demo forms use the same configured local tiles during regression runs. */
export function playwrightDemoTileLayers(): Array<{ name: string; url: string }> | undefined {
  return playwrightScenariosEnabled() ? [{
    name: 'Local regression tiles',
    url: `${process.env.PLAYWRIGHT_BROWSER_STUB_URL ?? 'http://playwright-stubs:8787'}/tiles/{z}/{x}/{y}.png`,
  }] : undefined;
}
