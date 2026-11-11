/** Per-instance response guard. Invalidate on item, brand, portal, caller or context changes and destroy. */
export class LatestRequest {
  private generation = 0;
  next(): number {
    return ++this.generation;
  }
  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
  invalidate(): void {
    ++this.generation;
  }
}
