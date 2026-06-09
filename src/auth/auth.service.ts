import {
  ConflictException, Injectable,
  UnauthorizedException, ForbiddenException,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { JwtService }  from '@nestjs/jwt';
import * as bcrypt     from 'bcrypt';
import { UsersService }        from '../users/users.service';
import { LoginAttemptService } from './login/login-attempt.service';
import { LoginDto }    from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User }        from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService:      UsersService,
    private readonly jwtService:        JwtService,
    private readonly loginAttemptSvc:   LoginAttemptService,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const existed = await this.usersService.findOneByEmail(dto.email);
    if (existed) throw new ConflictException('Email đã được sử dụng.');

    const hashed = await bcrypt.hash(dto.password, 12);   // cost 12 cho production

    const user = await this.usersService.create({ ...dto, password: hashed });

    return {
      name:        user.name,
      email:       user.email,
      phoneNumber: user.phoneNumber,
      status:      'Active',
      gender:      user.gender,
      role:        user.role,
    };
  }

  // Login (có rate-limit + brute-force protection) 
  async login(dto: LoginDto, ip: string) {
    const email = dto.email.toLowerCase().trim();

    // ── 1. Kiểm tra rate-limit / account lock TRƯỚC khi chạm DB 
    await this.loginAttemptSvc.assertAllowed(ip, email);

    // ── 2. Tìm user trong DB 
    const user = await this.usersService.findOneByEmail(email);

    // ── 3. Nếu không tìm thấy email hoặc sai mật khẩu → phản hồi GIỐNG NHAU
    //       (tránh email enumeration attack)
    const passwordMatch =
      user ? await bcrypt.compare(dto.password, user.password) : false;

    if (!user || !passwordMatch) {
      const { attemptsLeft, locked, lockTtl } =
        await this.loginAttemptSvc.recordFailure(ip, email);

      this.logger.warn(
        `[LOGIN_FAIL] email="${email}" ip="${ip}" attemptsLeft=${attemptsLeft}`,
      );

      if (locked) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error:      'ACCOUNT_LOCKED',
            message:    `Tài khoản bị khoá 15 phút do đăng nhập sai nhiều lần.`,
            retryAfter: lockTtl,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Thông báo chung — không tiết lộ email có tồn tại không
      throw new UnauthorizedException({
        message:      'Email hoặc mật khẩu không chính xác.',
        attemptsLeft: Math.max(0, attemptsLeft),
      });
    }

    // ── 4. Bắt 'Lock', kiểm tra bất kỳ trạng thái không phải 'Active'
    if (user.status !== 'Active') {
      this.logger.warn(`[LOGIN_BLOCKED] email="${email}" status="${user.status}"`);
      throw new UnauthorizedException(
        user.status === 'Lock'
          ? 'Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên.'
          : 'Tài khoản không hoạt động.',
      );
    }

    // ── 5. Kiểm tra role Admin 
    if (user.role !== 'Admin') {
      this.logger.warn(`[LOGIN_FORBIDDEN] email="${email}" role="${user.role}"`);
      throw new ForbiddenException('Tài khoản không có quyền truy cập trang quản trị.');
    }

    // ── 6. Đăng nhập thành công -> xoá fail counter 
    await this.loginAttemptSvc.recordSuccess(ip, email);
    this.logger.log(`[LOGIN_OK] email="${email}" ip="${ip}" role="${user.role}"`);

    // ── 7. Phát hành token 
    return this.issueTokens(user);
  }

  // Refresh Token 
  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
      });

      const user = await this.usersService.findOneByEmail(payload.email);
      if (!user || user.status !== 'Active' || user.role !== 'Admin') {
        throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
      }

      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn.');
    }
  }

  // Validate user
  async validateUser(email: string, password: string) {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _, ...result } = user;
    return result;
  }

  // ─── Internal: tạo cặp access + refresh token
  private async issueTokens(user: Pick<User, 'id' | 'name' | 'email' | 'role'>) {
    const payload = {
      sub:   user.id,
      email: user.email,
      name:  user.name,
      role:  user.role,
      scope: 'admin',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret:    process.env.JWT_ADMIN_SECRET  ?? process.env.JWT_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret:    process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
        expiresIn: '7d',
      }),
    ]);

    return {
      access_token:  accessToken,
      refresh_token: refreshToken,
      token_type:    'Bearer',
      expires_in:    15 * 60,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    };
  }
}