import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy }                  from '@nestjs/passport';
import { ExtractJwt, Strategy }              from 'passport-jwt';
import { InjectRedis }                       from '@nestjs-modules/ioredis';
import Redis                                 from 'ioredis';

export interface JwtPayload {
  sub:   number;
  email: string;
  name:  string;
  role:  string;
  scope: string;
  jti:   string;  
  iat:   number;
  exp:   number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@InjectRedis() private readonly redis: Redis) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ADMIN_SECRET ?? process.env.JWT_SECRET,
    });
  }

  /**
   * Chạy SAU khi passport verify chữ ký + expiry.
   * Kiểm tra thêm: token có bị blacklist không?
   */
  async validate(payload: JwtPayload) {
    // Kiểm tra blacklist — O(1) Redis lookup
    const isBlacklisted = await this.redis.exists(`blacklist:at:${payload.jti}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.');
    }
    return {
      id:    payload.sub,
      email: payload.email,
      name:  payload.name,
      role:  payload.role,
      jti:   payload.jti,
    };
  }
}