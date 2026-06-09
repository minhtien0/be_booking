import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';   
import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';

const LOCK_TTL_MS = 5_000;   // 5 giây — đủ để xử lý 1 request hold

@Injectable()
export class RedisLockService {
    private readonly logger = new Logger(RedisLockService.name);

    constructor(@InjectRedis() private readonly redis: Redis) { }

    //  Tạo key lock cho 1 slot cụ thể 
    slotLockKey(barberId: number, date: string, startTime: string): string {
        return `lock:barber:${barberId}:date:${date}:slot:${startTime}`;
    }

    //  Hold key (dùng để đánh dấu slot đang bị giữ trong DB) 
    slotHoldKey(barberId: number, date: string, startTime: string): string {
        return `booking:hold:barber:${barberId}:date:${date}:slot:${startTime}`;
    }

    /**
     * Acquire distributed lock (SET NX PX)
     * @returns lockToken nếu thành công, null nếu thất bại (slot đang được xử lý)
     */
    async acquire(key: string, ttlMs: number = LOCK_TTL_MS): Promise<string | null> {
        const token = uuid();
        // SET key token NX PX ttl — atomic, chỉ set nếu key chưa tồn tại
        const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
        if (result === 'OK') {
            this.logger.debug(`[LOCK] acquired: ${key}`);
            return token;
        }
        this.logger.debug(`[LOCK] busy: ${key}`);
        return null;
    }

    /**
     * Release lock — chỉ xoá nếu token khớp (Lua script để atomic)
     */
    async release(key: string, token: string): Promise<void> {
        const lua = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
        await this.redis.eval(lua, 1, key, token);
        this.logger.debug(`[LOCK] released: ${key}`);
    }

    /**
     * withLock — helper bọc logic vào lock/release tự động
     */
    async withLock<T>(
        key: string,
        fn: () => Promise<T>,
        ttlMs: number = LOCK_TTL_MS,
    ): Promise<{ success: true; result: T } | { success: false; reason: 'SLOT_BUSY' }> {
        const token = await this.acquire(key, ttlMs);
        if (!token) return { success: false, reason: 'SLOT_BUSY' };

        try {
            const result = await fn();
            return { success: true, result };
        } finally {
            await this.release(key, token);
        }
    }

    // Hold slot với TTL (dùng sau khi tạo booking thành công) 
    async setSlotHold(
        barberId: number,
        date: string,
        startTime: string,
        bookingId: number,
        ttlSeconds: number,
    ): Promise<void> {
        const key = this.slotHoldKey(barberId, date, startTime);
        await this.redis.setex(key, ttlSeconds, String(bookingId));
    }

    async isSlotHeld(barberId: number, date: string, startTime: string): Promise<boolean> {
        const key = this.slotHoldKey(barberId, date, startTime);
        const val = await this.redis.get(key);
        return val !== null;
    }

    async releaseSlotHold(barberId: number, date: string, startTime: string): Promise<void> {
        const key = this.slotHoldKey(barberId, date, startTime);
        await this.redis.del(key);
    }
}