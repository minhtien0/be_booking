import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { InjectRedis }         from '@nestjs-modules/ioredis';
import { InjectRepository }    from '@nestjs/typeorm';
import { Repository }          from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import Redis from 'ioredis';

import { PhoneBlacklist } from '../../phones/entities/blacklist.entity';

const BLACKLIST_CACHE_TTL = 60;   // Cache kết quả 60 giây để giảm query DB

@Injectable()
export class BlacklistMiddleware implements NestMiddleware {
  constructor(
    @InjectRedis()
    private readonly redis: Redis,

    @InjectRepository(PhoneBlacklist)
    private readonly blacklistRepo: Repository<PhoneBlacklist>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Chỉ chặn ở các endpoint đặt lịch
    const isBookingEndpoint =
      req.method === 'POST' && req.path.includes('/bookings');
    if (!isBookingEndpoint) return next();

    const phone = req.body?.customer_phone as string | undefined;
    if (!phone) return next();

    const phoneHash  = crypto.createHash('sha256').update(phone).digest('hex');
    const cacheKey   = `blacklist:cache:${phoneHash}`;

    // 1. Kiểm tra Redis cache trước
    const cached = await this.redis.get(cacheKey);
    if (cached === 'blocked') {
      return res.status(HttpStatus.FORBIDDEN).json({
        code:    '-403',
        message: 'Số điện thoại này tạm thời không thể đặt lịch. Vui lòng liên hệ tiệm.',
      });
    }
    if (cached === 'ok') return next();

    // 2. Query DB nếu cache miss
    const entry = await this.blacklistRepo.findOne({
      where: { phoneHash, isActive: true },
    });

    if (entry) {
      const now = new Date();
      const isBlocked = !entry.blockedUntil || entry.blockedUntil > now;

      if (isBlocked) {
        // Cache kết quả "blocked"
        await this.redis.setex(cacheKey, BLACKLIST_CACHE_TTL, 'blocked');
        return res.status(HttpStatus.FORBIDDEN).json({
          code:    '-403',
          message: 'Số điện thoại này tạm thời không thể đặt lịch. Vui lòng liên hệ tiệm.',
        });
      }

      // Hết hạn block → coi như ok
    }

    // Cache kết quả "ok"
    await this.redis.setex(cacheKey, BLACKLIST_CACHE_TTL, 'ok');
    next();
  }

  /** Invalidate cache khi blacklist thay đổi (gọi từ AdminService) */
  async invalidateCache(phone: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(phone).digest('hex');
    await this.redis.del(`blacklist:cache:${hash}`);
  }
}