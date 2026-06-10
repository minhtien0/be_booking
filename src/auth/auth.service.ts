import {
  ConflictException, Injectable,
  UnauthorizedException, ForbiddenException,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { JwtService }          from '@nestjs/jwt';
import { InjectRedis }         from '@nestjs-modules/ioredis';
import * as bcrypt             from 'bcrypt';
import { v4 as uuid }          from 'uuid';
import Redis                   from 'ioredis';
import { UsersService }        from '../users/users.service';
import { LoginAttemptService } from './login/login-attempt.service';
import { LoginDto }            from './dto/login.dto';
import { RegisterDto }         from './dto/register.dto';
import { User }                from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService:    UsersService,
    private readonly jwtService:      JwtService,
    private readonly loginAttemptSvc: LoginAttemptService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const existed = await this.usersService.findOneByEmail(dto.email);
    if (existed) throw new ConflictException('Email đã được sử dụng.');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user   = await this.usersService.create({ ...dto, password: hashed });

    return {
      name:        user.name,
      email:       user.email,
      phoneNumber: user.phoneNumber,
      status:      'Active',
      gender:      user.gender,
      role:        user.role,
    };
  }

  // ─── Login ────────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ip: string) {
    const email = dto.email.toLowerCase().trim();

    // 1. Rate-limit / lockout check
    await this.loginAttemptSvc.assertAllowed(ip, email);

    // 2. Tìm user
    const user = await this.usersService.findOneByEmail(email);
    const passwordMatch = user
      ? await bcrypt.compare(dto.password, user.password)
      : false;

    // 3. Sai credentials → ghi nhận fail (phản hồi GIỐNG NHAU tránh enumeration)
    if (!user || !passwordMatch) {
      const { attemptsLeft, locked, lockTtl } =
        await this.loginAttemptSvc.recordFailure(ip, email);

      this.logger.warn(`[LOGIN_FAIL] email="${email}" ip="${ip}" attemptsLeft=${attemptsLeft}`);

      if (locked) {
        throw new HttpException(
          { statusCode: 429, error: 'ACCOUNT_LOCKED',
            message: 'Tài khoản bị khoá 15 phút do đăng nhập sai nhiều lần.',
            retryAfter: lockTtl },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException({
        message:      'Email hoặc mật khẩu không chính xác.',
        attemptsLeft: Math.max(0, attemptsLeft),
      });
    }

    // 4. Kiểm tra trạng thái tài khoản
    if (user.status !== 'Active') {
      this.logger.warn(`[LOGIN_BLOCKED] email="${email}" status="${user.status}"`);
      throw new UnauthorizedException(
        user.status === 'Lock'
          ? 'Tài khoản đã bị khoá. Liên hệ quản trị viên.'
          : 'Tài khoản không hoạt động.',
      );
    }

    // 5. Kiểm tra role Admin
    if (user.role !== 'Admin') {
      this.logger.warn(`[LOGIN_FORBIDDEN] email="${email}" role="${user.role}"`);
      throw new ForbiddenException('Tài khoản không có quyền truy cập trang quản trị.');
    }

    // 6. Xoá fail counter
    await this.loginAttemptSvc.recordSuccess(ip, email);

    // 7. Phát hành token + LƯU refresh token vào DB
    const tokens = await this.issueTokens(user);
    await this.saveRefreshToken(user.id, tokens.refresh_token);

    this.logger.log(`[LOGIN_OK] email="${email}" ip="${ip}"`);
    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout(userPayload: { id: number; email: string; jti: string }, refreshToken?: string) {
    const user = await this.usersService.findOneByEmail(userPayload.email);
    if (!user || user.status !== 'Active') {
      throw new UnauthorizedException('Tài khoản không hợp lệ.');
    }

    // 1. Blacklist access token hiện tại trong Redis (hết hạn tự xoá)
    //    TTL = thời gian còn lại của access token (tối đa 15 phút)
    if (userPayload.jti) {
      await this.redis.setex(
        `blacklist:at:${userPayload.jti}`,
        15 * 60,   // 15 phút — bằng expiresIn của access token
        '1',
      );
      this.logger.log(`[BLACKLIST] jti=${userPayload.jti} added`);
    }

    // 2. Xoá hashed refresh token khỏi DB → refresh token cũ vô hiệu hoàn toàn
    await this.usersService.updateRefreshToken(user.id, null);

    // 3. Nếu client gửi kèm refresh token → verify và xác nhận xoá
    if (refreshToken) {
      try {
        await this.jwtService.verifyAsync(refreshToken, {
          secret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
        });
      } catch {
        // Refresh token hết hạn / giả mạo — vẫn cho logout, chỉ log cảnh báo
        this.logger.warn(`[LOGOUT_RT_INVALID] email="${user.email}"`);
      }
    }

    this.logger.log(`[LOGOUT_OK] email="${user.email}" id=${user.id}`);

    return {
      success:    true,
      statusCode: HttpStatus.OK,
      message:    'Đăng xuất thành công. Phiên làm việc đã bị hủy.',
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    // 1. Verify chữ ký + expiry
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn.');
    }

    // 2. Lấy user kèm hashedRefreshToken
    const user = await this.usersService.findOneWithRefreshToken(payload.sub);
    if (!user || user.status !== 'Active' || user.role !== 'Admin') {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    }

    // 3. So sánh refresh token gửi lên với hash trong DB
    //    (Token rotation: mỗi refresh đổi cặp token mới hoàn toàn)
    if (!user.refresh_token) {
      throw new UnauthorizedException('Chưa đăng nhập hoặc đã đăng xuất rồi.');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refresh_token);
    if (!isValid) {
      // Có thể là reuse attack → xoá token cũ, buộc đăng nhập lại
      await this.usersService.updateRefreshToken(user.id, null);
      this.logger.warn(`[RT_REUSE_DETECTED] userId=${user.id}`);
      throw new UnauthorizedException('Refresh token không hợp lệ. Vui lòng đăng nhập lại.');
    }

    // 4. Phát hành cặp token MỚI + cập nhật DB (token rotation)
    const tokens = await this.issueTokens(user);
    await this.saveRefreshToken(user.id, tokens.refresh_token);

    this.logger.log(`[REFRESH_OK] userId=${user.id}`);
    return tokens;
  }

  // ─── Me ───────────────────────────────────────────────────────────────────
  async validateUser(email: string, password: string) {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;
    const { password: _, ...result } = user;
    return result;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Tạo cặp access + refresh token.
   * Mỗi token có jti riêng để blacklist chính xác.
   */
  private async issueTokens(user: Pick<User, 'id' | 'name' | 'email' | 'role'>) {
    const basePayload = {
      sub:   user.id,
      email: user.email,
      name:  user.name,
      role:  user.role,
      scope: 'admin',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, jti: uuid() },          // jti unique per token
        { secret: process.env.JWT_ADMIN_SECRET ?? process.env.JWT_SECRET, expiresIn: '15m' },
      ),
      this.jwtService.signAsync(
        { ...basePayload, jti: uuid() },
        { secret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET, expiresIn: '7d' },
      ),
    ]);

    return {
      access_token:  accessToken,
      refresh_token: refreshToken,
      token_type:    'Bearer',
      expires_in:    15 * 60,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  /** Hash refresh token rồi lưu vào DB */
  private async saveRefreshToken(userId: number, rawRefreshToken: string): Promise<void> {
    const hashed = await bcrypt.hash(rawRefreshToken, 10);
    await this.usersService.updateRefreshToken(userId, hashed);
  }
}