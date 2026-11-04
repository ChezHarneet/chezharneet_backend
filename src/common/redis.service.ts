import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  async onModuleDestroy() {
    await this.client.quit();
  }
  async getJson<T>(key: string): Promise<T | null> {
    const v = await this.client.get(key);
    return v ? JSON.parse(v) : null;
  }
  async setJson(key: string, value: unknown, ttl = 300) {
    await this.client.set(key, JSON.stringify(value), "EX", ttl);
  }
  async del(key: string) {
    await this.client.del(key);
  }
}
