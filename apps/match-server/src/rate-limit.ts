export class TokenBucket {
  private tokens: number;
  private updatedAt: number;
  constructor(private readonly capacity = 20, private readonly refillPerSecond = 10, now = Date.now()) { this.tokens = capacity; this.updatedAt = now; }
  take(now = Date.now()): boolean {
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
