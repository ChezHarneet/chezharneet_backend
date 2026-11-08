import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private redis?: Redis;

  get client(): Redis {
    this.redis ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
    return this.redis;
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = undefined;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async setJson(key: string, value: unknown, ttl = 300) {
    await this.client.set(key, JSON.stringify(value), "EX", ttl);
  }

  async del(key: string) {
    await this.client.del(key);
  }
}
