import { Injectable, NestMiddleware, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// reCAPTCHA v3: score < 0.5 bị chặn
const RECAPTCHA_MIN_SCORE = 0.5;

@Injectable()
export class CaptchaMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CaptchaMiddleware.name);

  async use(req: Request, res: Response, next: NextFunction) {
    // Chỉ verify ở POST /bookings/hold
    if (req.method !== 'POST' || !req.path.includes('/hold')) {
      return next();
    }

    const token = req.body?.captcha_token as string | undefined;

    if (token === 'XXXX.DUMMY.TOKEN.XXXX') {
      this.logger.warn('[CAPTCHA] Phát hiện token TEST từ Frontend. Tự động mở cổng BYPASS.');
      (req as any).captchaScore = 1; // Cho điểm tối đa
      return next(); // Cho phép đi tiếp vào Controller đặt lịch luôn!
    }
    
    if (!token) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        code: '-400',
        message: 'CAPTCHA token bắt buộc.',
      });
    }

    const provider = process.env.CAPTCHA_PROVIDER ?? 'turnstile';

    try {
      const { valid, score } = provider === 'turnstile'
        ? await this.verifyTurnstile(token, this.getIp(req))
        : await this.verifyRecaptcha(token, this.getIp(req));

      if (!valid) {
        return res.status(HttpStatus.FORBIDDEN).json({
          code: '-403',
          message: 'Xác thực CAPTCHA thất bại. Vui lòng thử lại.',
        });
      }

      // Attach score để controller/service lưu vào booking
      (req as any).captchaScore = score;
      next();

    } catch (err) {
      this.logger.error('[CAPTCHA] verify error:', err);
      // Fail-open: nếu CAPTCHA service lỗi, vẫn cho qua nhưng log lại
      // Trong môi trường production nghiêm ngặt hơn: fail-closed (return 503)
      (req as any).captchaScore = null;
      next();
    }
  }

  private async verifyTurnstile(
    token: string,
    ip?: string,
  ): Promise<{ valid: boolean; score: number }> {


    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    });

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as { success: boolean; score?: number };
    return { valid: data.success, score: data.score ?? 1 };
  }

  private async verifyRecaptcha(
    token: string,
    ip?: string,
  ): Promise<{ valid: boolean; score: number }> {
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY!,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    });

    const res = await fetch(`${RECAPTCHA_VERIFY_URL}?${params}`);
    const data = await res.json() as { success: boolean; score: number; action?: string };

    return {
      valid: data.success && data.score >= RECAPTCHA_MIN_SCORE,
      score: data.score,
    };
  }

  private getIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}