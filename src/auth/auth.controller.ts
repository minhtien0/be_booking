import { Body, Controller, Get, Post, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Request } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'] as string | undefined;
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIp = req.headers['x-real-ip'] as string | undefined;
  if (realIp) return realIp.trim();

  return req.socket?.remoteAddress ?? '0.0.0.0';
}
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })   // 10 lần / 60 giây / IP
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = extractIp(req);
    return this.authService.login(dto, ip);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Body('refresh_token') refreshToken: string) {
    // req.user được sinh ra từ JwtAuthGuard chứa payload của Access Token
    const userPayload = (req as any).user;

    // Truyền cả thông tin user và refresh token sang Service xử lý
    return this.authService.logout(userPayload, refreshToken);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refresh_token') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  @Get('Admin')
  adminOnly(@Req() req: any) {
    return {
      message: 'Admin only',
      user: req.user,
    };
  }
}