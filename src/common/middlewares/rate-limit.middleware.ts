import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { InjectRedis }  from '@nestjs-modules/ioredis';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import Redis from 'ioredis';

// Giới hạn theo spec:
// - Tối đa 2 lịch / phone hoặc IP / ngày
// - Tối đa 5 lịch / phone hoặc IP / tuần
const LIMITS = {
  daily:  { max: 2, ttl: 60 * 60 * 24 },           
  weekly: { max: 5, ttl: 60 * 60 * 24 * 7 },       
};

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Chỉ áp dụng cho POST /bookings/hold
    if (req.method !== 'POST' || !req.path.includes('/hold')) {
      return next();
    }

    const ip    = this.getIp(req);
    const phone = req.body?.customer_phone as string | undefined;

    const identifiers: string[] = [ip];
    if (phone) {
      identifiers.push(crypto.createHash('sha256').update(phone).digest('hex'));
    }

    for (const id of identifiers) {
      // Kiểm tra daily
      const dailyKey  = `rate:daily:${id}`;
      const weeklyKey = `rate:weekly:${id}`;

      const [dailyCount, weeklyCount] = await Promise.all([
        this.redis.get(dailyKey),
        this.redis.get(weeklyKey),
      ]);

      if (Number(dailyCount ?? 0) >= LIMITS.daily.max) {
        return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          code:    '-429',
          message: 'Bạn đã đặt quá 2 lịch trong hôm nay. Vui lòng thử lại vào ngày mai.',
        });
      }

      if (Number(weeklyCount ?? 0) >= LIMITS.weekly.max) {
        return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          code:    '-429',
          message: 'Bạn đã đặt quá 5 lịch trong tuần này. Vui lòng liên hệ tiệm trực tiếp.',
        });
      }
    }

    // Tăng counter sau khi request được phép qua
    // (counter thật sự tăng sau khi hold thành công — xem BookingService)
    // Ở đây chỉ attach metadata để service gọi incrementRateLimit()
    (req as any).rateLimitIds = identifiers;

    next();
  }

  /** Gọi từ BookingService sau khi hold thành công */
  async increment(identifiers: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const id of identifiers) {
      pipeline.incr(`rate:daily:${id}`);
      pipeline.expire(`rate:daily:${id}`, LIMITS.daily.ttl);
      pipeline.incr(`rate:weekly:${id}`);
      pipeline.expire(`rate:weekly:${id}`, LIMITS.weekly.ttl);
    }
    await pipeline.exec();
  }

  private getIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}