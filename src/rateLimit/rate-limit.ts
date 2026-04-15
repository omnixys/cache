import { Injectable } from "@nestjs/common";

@Injectable()
export class ValkeyRateLimitAdapter {
  constructor(private readonly valkey: any) {}

  async increment(key: string, windowMs: number): Promise<number> {
    const tx = this.valkey.multi();

    tx.incr(key);
    tx.pexpire(key, windowMs);

    const [count] = await tx.exec();
    return count;
  }
}
