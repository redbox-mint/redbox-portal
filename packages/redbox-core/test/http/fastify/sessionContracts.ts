import { assertGolden } from './goldenContracts';
export function assertSessionContract(kind: string, input: unknown, observations: unknown): void {
  assertGolden('session-' + kind, JSON.stringify(input), observations);
}
