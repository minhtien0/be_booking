import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

const OTP_TTL_SEC = 5 * 60;
const OTP_MAX_TRIES = 5;
const OTP_MAX_RESEND = 3;

type OtpScope =
  | { type: 'booking'; bookingId: number }
  | { type: 'lookup'; phone: string };

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  // ── Keys ──────────────────────────────────────────────────────────────────
  private scopeId(scope: OtpScope): string {
    return scope.type === 'booking'
      ? `booking:${scope.bookingId}`
      : `phone:${scope.phone}`;
  }

  private otpKey(scope: OtpScope) { return `otp:${this.scopeId(scope)}`; }
  private triesKey(scope: OtpScope) { return `otp:tries:${this.scopeId(scope)}`; }
  private resendKey(scope: OtpScope) { return `otp:resend:${this.scopeId(scope)}`; }

  // ── Generate ───────────────────────────────────────────────────────────────
  private generate(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }

  // ── Core (dùng chung cho cả 2 flow) ───────────────────────────────────────
  async send(scope: OtpScope, phone: string, code?: string): Promise<void> {
    const otp = this.generate();

    await Promise.all([
      this.redis.setex(this.otpKey(scope), OTP_TTL_SEC, otp),
      this.redis.del(this.triesKey(scope)),
    ]);

    this.logger.log(
      `[OTP] type=${scope.type} id=${this.scopeId(scope)} phone=${phone}${code ? ` code=${code}` : ''} otp=${otp}`,
    );

    // TODO: await this.smsService.send(phone, `Ma xac nhan: ${otp}`);
  }

  async verify(scope: OtpScope, inputOtp: string): Promise<void> {
    const triesKey = this.triesKey(scope);
    const otpKey = this.otpKey(scope);

    const [triesRaw, stored] = await Promise.all([
      this.redis.get(triesKey),
      this.redis.get(otpKey),
    ]);

    const tries = Number(triesRaw ?? 0);

    if (tries >= OTP_MAX_TRIES) {
      throw new BadRequestException(
        'OTP đã bị khoá do nhập sai quá nhiều lần. Vui lòng đặt lịch lại.',
      );
    }

    if (!stored) {
      throw new BadRequestException('OTP đã hết hạn. Vui lòng yêu cầu gửi lại.');
    }

    if (stored !== inputOtp) {
      await Promise.all([
        this.redis.incr(triesKey),
        this.redis.expire(triesKey, OTP_TTL_SEC),
      ]);
      const remaining = OTP_MAX_TRIES - tries - 1;
      throw new BadRequestException(`OTP không đúng. Còn ${remaining} lần thử.`);
    }

    // Đúng → dọn dẹp
    await Promise.all([
      this.redis.del(otpKey),
      this.redis.del(triesKey),
    ]);
  }

  async resend(scope: OtpScope, phone: string): Promise<void> {
    const resendKey = this.resendKey(scope);
    const resendCount = Number(await this.redis.get(resendKey) ?? 0);

    if (resendCount >= OTP_MAX_RESEND) {
      throw new BadRequestException('Đã gửi lại OTP quá nhiều lần. Vui lòng thử sau.');
    }

    await Promise.all([
      this.redis.incr(resendKey),
      this.redis.expire(resendKey, OTP_TTL_SEC),
    ]);

    await this.send(scope, phone);
  }
}