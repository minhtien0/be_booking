import {
  Injectable, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

// ─── Cấu hình ngưỡng bảo mật ─────────────────────────────────────────────────
const CFG = {
  // Theo email
  EMAIL_MAX_FAILS:   5,            // Sai 5 lần → khoá email 15 phút
  EMAIL_LOCK_SEC:    15 * 60,      // 15 phút
  EMAIL_WINDOW_SEC:  15 * 60,      // Cửa sổ đếm 15 phút

  // Theo IP
  IP_MAX_FAILS:      20,           // Sai 20 lần → khoá IP 30 phút
  IP_LOCK_SEC:       30 * 60,      // 30 phút
  IP_WINDOW_SEC:     15 * 60,      // Cửa sổ đếm 15 phút

  // Progressive delay (giây) theo số lần sai liên tiếp
  DELAY_STEPS: [0, 0, 1, 2, 4, 8], // fail 0-1: không delay, fail 2: 1s, fail 3: 2s...
} as const;

export interface AttemptResult {
  attemptsLeft: number;   // Số lần thử còn lại trước khi bị khoá
  locked:       boolean;
  lockTtl?:     number;   // Giây còn lại nếu đang bị khoá
}

@Injectable()
export class LoginAttemptService {
  private readonly logger = new Logger(LoginAttemptService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  // ── Redis key builders ───────────────────────────────────────────────────────
  private emailFailKey(email: string)  { return `login:fail:email:${email.toLowerCase()}` }
  private emailLockKey(email: string)  { return `login:lock:email:${email.toLowerCase()}` }
  private ipFailKey(ip: string)        { return `login:fail:ip:${ip}` }
  private ipLockKey(ip: string)        { return `login:lock:ip:${ip}` }

  /**
   * Kiểm tra trước khi xử lý login.
   * Ném HttpException 429 nếu IP hoặc email đang bị khoá.
   */
  async assertAllowed(ip: string, email: string): Promise<void> {
    // 1. Kiểm tra khoá IP
    const ipLockTtl = await this.redis.ttl(this.ipLockKey(ip));
    if (ipLockTtl > 0) {
      const mins = Math.ceil(ipLockTtl / 60);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error:      'IP_LOCKED',
          message:    `Quá nhiều yêu cầu từ địa chỉ này. Thử lại sau ${mins} phút.`,
          retryAfter: ipLockTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Kiểm tra khoá email
    const emailLockTtl = await this.redis.ttl(this.emailLockKey(email));
    if (emailLockTtl > 0) {
      const mins = Math.ceil(emailLockTtl / 60);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error:      'ACCOUNT_LOCKED',
          message:    `Tài khoản bị khoá tạm thời do đăng nhập sai nhiều lần. Thử lại sau ${mins} phút.`,
          retryAfter: emailLockTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Ghi nhận lần đăng nhập SAI.
   * Trả về số lần thử còn lại và trạng thái khoá.
   */
  async recordFailure(ip: string, email: string): Promise<AttemptResult> {
    const pipeline = this.redis.pipeline();

    // Tăng counter email
    pipeline.incr(this.emailFailKey(email));
    pipeline.expire(this.emailFailKey(email), CFG.EMAIL_WINDOW_SEC);

    // Tăng counter IP
    pipeline.incr(this.ipFailKey(ip));
    pipeline.expire(this.ipFailKey(ip), CFG.IP_WINDOW_SEC);

    const results = await pipeline.exec();

    const emailFails = Number(results?.[0]?.[1] ?? 1);
    const ipFails    = Number(results?.[2]?.[1] ?? 1);

    this.logger.warn(
      `[FAIL] email="${email}" ip="${ip}" emailFails=${emailFails} ipFails=${ipFails}`,
    );

    // Khoá IP nếu vượt ngưỡng
    if (ipFails >= CFG.IP_MAX_FAILS) {
      await this.redis.setex(this.ipLockKey(ip), CFG.IP_LOCK_SEC, '1');
      this.logger.warn(`[IP_LOCKED] ip="${ip}" for ${CFG.IP_LOCK_SEC}s`);
    }

    // Khoá email nếu vượt ngưỡng
    if (emailFails >= CFG.EMAIL_MAX_FAILS) {
      await this.redis.setex(this.emailLockKey(email), CFG.EMAIL_LOCK_SEC, '1');
      this.logger.warn(`[ACCOUNT_LOCKED] email="${email}" for ${CFG.EMAIL_LOCK_SEC}s`);
      return { attemptsLeft: 0, locked: true, lockTtl: CFG.EMAIL_LOCK_SEC };
    }

    // Progressive delay — làm chậm brute force
    const delayIdx = Math.min(emailFails, CFG.DELAY_STEPS.length - 1);
    const delaySec = CFG.DELAY_STEPS[delayIdx];
    if (delaySec > 0) {
      await new Promise(r => setTimeout(r, delaySec * 1000));
    }

    return {
      attemptsLeft: CFG.EMAIL_MAX_FAILS - emailFails,
      locked:       false,
    };
  }

  /**
   * Xoá toàn bộ counter sau khi đăng nhập THÀNH CÔNG.
   */
  async recordSuccess(ip: string, email: string): Promise<void> {
    await this.redis.del(
      this.emailFailKey(email),
      this.emailLockKey(email),
      this.ipFailKey(ip),
      // KHÔNG xoá ipLockKey — IP bị khoá vẫn phải chờ hết thời hạn
    );
    this.logger.log(`[LOGIN_OK] email="${email}" ip="${ip}" — counters cleared`);
  }

  /**
   * Đọc số lần sai hiện tại (dùng để trả về trong response).
   */
  async getEmailFailCount(email: string): Promise<number> {
    return Number(await this.redis.get(this.emailFailKey(email)) ?? 0);
  }
}