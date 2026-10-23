export interface DestinationProgress {
  status: 'success' | 'failed' | 'processing' | 'deadLetter';
  attempts: number;
  nextEligibleAt?: string;
}
export function readProgress(value: unknown): DestinationProgress | undefined {
  if (value === 'success' || value === 'deadLetter') return { status: value, attempts: 0 };
  if (typeof value !== 'object' || value === null || !('status' in value) || !('attempts' in value)) return undefined;
  const { status, attempts } = value;
  if (!['success', 'failed', 'processing', 'deadLetter'].includes(String(status)) || typeof attempts !== 'number')
    return undefined;
  if (status !== 'success' && status !== 'failed' && status !== 'processing' && status !== 'deadLetter')
    return undefined;
  return {
    status,
    attempts,
    ...('nextEligibleAt' in value && typeof value.nextEligibleAt === 'string' ? { nextEligibleAt: value.nextEligibleAt } : {}),
  };
}
