// test/e2e-tests/mocks/redis.mock.ts

import { Injectable } from '@nestjs/common';

@Injectable()
export class RedisMockService {
  private store: Map<string, string> = new Map();
  private expirations: Map<string, number> = new Map();

  /**
   * Get Redis client (for compatibility with code that calls getClient())
   */
  getClient() {
    return {
      get: this.get.bind(this),
      set: this.set.bind(this),
      del: this.del.bind(this),
      incr: this.incr.bind(this),
      decr: this.decr.bind(this),
      ttl: this.ttl.bind(this),
      expire: this.expire.bind(this),
      exists: this.exists.bind(this),
      keys: this.keys.bind(this),
      hget: this.hget.bind(this),
      hset: this.hset.bind(this),
      hdel: this.hdel.bind(this),
      hgetall: this.hgetall.bind(this),
      pipeline: this.pipeline.bind(this),
      multi: this.multi.bind(this),
      flushdb: this.flushdb.bind(this),
      flushall: this.flushall.bind(this),
    };
  }

  /**
   * GET - Retrieve value by key
   */
  async get(key: string): Promise<string | null> {
    // Check if key has expired
    if (this.isExpired(key)) {
      this.store.delete(key);
      this.expirations.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  /**
   * SET - Set key-value pair
   */
  async set(key: string, value: string, ...args: any[]): Promise<string> {
    this.store.set(key, value);

    // Handle EX (seconds) or PX (milliseconds) options
    if (args.length >= 2) {
      const option = args[0];
      const time = parseInt(args[1]);

      if (option === 'EX') {
        this.expirations.set(key, Date.now() + time * 1000);
      } else if (option === 'PX') {
        this.expirations.set(key, Date.now() + time);
      }
    }

    return 'OK';
  }

  /**
   * DEL - Delete key(s)
   */
  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        count++;
        this.expirations.delete(key);
      }
    }
    return count;
  }

  /**
   * INCR - Increment value (for rate limiting)
   */
  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0');
    const newValue = current + 1;
    this.store.set(key, newValue.toString());
    return newValue;
  }

  /**
   * DECR - Decrement value
   */
  async decr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0');
    const newValue = current - 1;
    this.store.set(key, newValue.toString());
    return newValue;
  }

  /**
   * TTL - Get time to live in seconds
   */
  async ttl(key: string): Promise<number> {
    if (!this.store.has(key)) {
      return -2; // Key doesn't exist
    }

    const expiration = this.expirations.get(key);
    if (!expiration) {
      return -1; // Key exists but has no expiration
    }

    const ttlMs = expiration - Date.now();
    if (ttlMs <= 0) {
      // Key has expired
      this.store.delete(key);
      this.expirations.delete(key);
      return -2;
    }

    return Math.ceil(ttlMs / 1000); // Return seconds
  }

  /**
   * EXPIRE - Set expiration on key
   */
  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) {
      return 0;
    }
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  /**
   * EXISTS - Check if key exists
   */
  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.has(key) && !this.isExpired(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * KEYS - Find all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  /**
   * HGET - Get hash field value
   */
  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.store.get(key);
    if (!hash) return null;

    try {
      const parsed = JSON.parse(hash);
      return parsed[field] || null;
    } catch {
      return null;
    }
  }

  /**
   * HSET - Set hash field value
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    let hash: any = {};

    const existing = this.store.get(key);
    if (existing) {
      try {
        hash = JSON.parse(existing);
      } catch {
        hash = {};
      }
    }

    const isNew = !hash[field];
    hash[field] = value;
    this.store.set(key, JSON.stringify(hash));

    return isNew ? 1 : 0;
  }

  /**
   * HDEL - Delete hash field
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    const existing = this.store.get(key);
    if (!existing) return 0;

    try {
      const hash = JSON.parse(existing);
      let count = 0;

      for (const field of fields) {
        if (field in hash) {
          delete hash[field];
          count++;
        }
      }

      this.store.set(key, JSON.stringify(hash));
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * HGETALL - Get all hash fields and values
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    const existing = this.store.get(key);
    if (!existing) return {};

    try {
      return JSON.parse(existing);
    } catch {
      return {};
    }
  }

  /**
   * PIPELINE - Return mock pipeline
   */
  pipeline() {
    type Command = { cmd: string; args: any[] };
    const commands: Command[] = [];

    return {
      del: (...keys: string[]) => {
        commands.push({ cmd: 'del', args: [...keys] });
        return this.pipeline();
      },
      set: (key: string, value: string, ...args: any[]) => {
        commands.push({ cmd: 'set', args: [key, value, ...args] });
        return this.pipeline();
      },
      get: (key: string) => {
        commands.push({ cmd: 'get', args: [key] });
        return this.pipeline();
      },
      exec: async () => {
        const results: any[] = [];
        for (const { cmd, args } of commands) {
          if (cmd === 'del') {
            results.push([null, await this.del(...args)]);
          } else if (cmd === 'set') {
            results.push([
              null,
              await this.set(args[0], args[1], ...args.slice(2)),
            ]);
          } else if (cmd === 'get') {
            results.push([null, await this.get(args[0])]);
          }
        }
        return results;
      },
    };
  }

  /**
   * MULTI - Return mock transaction
   */
  multi() {
    return this.pipeline();
  }

  /**
   * FLUSHDB - Clear current database
   */
  async flushdb(): Promise<string> {
    this.store.clear();
    this.expirations.clear();
    return 'OK';
  }

  /**
   * FLUSHALL - Clear all databases
   */
  async flushall(): Promise<string> {
    return this.flushdb();
  }

  /**
   * Helper: Check if key has expired
   */
  private isExpired(key: string): boolean {
    const expiration = this.expirations.get(key);
    if (!expiration) return false;

    if (Date.now() >= expiration) {
      return true;
    }

    return false;
  }

  /**
   * Test helper: Set data directly (for test setup)
   */
  async setTestData(key: string, value: string, ttl?: number): Promise<void> {
    this.store.set(key, value);
    if (ttl) {
      this.expirations.set(key, Date.now() + ttl * 1000);
    }
  }

  /**
   * Test helper: Clear all data
   */
  async clearAll(): Promise<void> {
    this.store.clear();
    this.expirations.clear();
  }

  /**
   * Test helper: Get all stored keys (for debugging)
   */
  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Test helper: Get store size
   */
  getSize(): number {
    return this.store.size;
  }
}
