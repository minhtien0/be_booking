import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BookingGateway } from './booking.gateway';

// ── ENTIRE ENTITIES MERGED ──────────────────────────────────────────────────
import { Booking } from './entities/booking.entity';
import { PhoneBlacklist } from '../phones/entities/blacklist.entity';
import { Barber } from '../barbers/entities/barber.entity';
import { Service } from '../services/entities/service.entity';
import { Combo } from '../combos/entities/combo.entity';
import { BookingLog } from '../bookinglogs/entities/bookinglog.entity';

// ── SERVICES & CRONS ────────────────────────────────────────────────────────
import { BookingsService } from './bookings.service';
import { SlotService } from '../modules/otp/slot.service';
import { OtpService } from '../modules/otp/otp.service';
import { BookingCryptoService } from './services/booking-crypto.service';
import { BookingsQueryService } from './services/bookings-query.service';
import { BookingLookUpService } from './services/booking-lookup.service';
import { BookingBlacklistService } from './services/booking-blacklist.service';
import { RedisLockService } from '../common/redis/redis-lock.service';
import { BookingCleanupCron } from './crons/booking-cleanup.cron';
import { BookingNotificationCron } from './crons/notification-booking.cron';

// ── CONTROLLER ──────────────────────────────────────────────────────────────
import { BookingsController } from './bookings.controller';

// ── MIDDLEWARES ─────────────────────────────────────────────────────────────
import { RateLimitMiddleware } from '../common/middlewares/rate-limit.middleware';
import { BlacklistMiddleware } from '../common/middlewares/blacklist.middleware';
import { CaptchaMiddleware } from '../common/middlewares/captcha.middleware';

// ── JWT AUTH ─────────────────────────────────────────────────────────────
import { jwtConstants } from '../auth/constants';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      PhoneBlacklist,
      Service,
      Combo,
      BookingLog,
      Barber,
    ]),
    ScheduleModule.forRoot(),        // Bật tính năng chạy tác vụ ngầm Cron job
    EventEmitterModule.forRoot(),    // Bật tính năng bắn sự kiện Event-emitter
    JwtModule.register({
      secret: jwtConstants.secret,
    }),
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    SlotService,
    OtpService,
    BookingGateway,
    RedisLockService,
    BookingCleanupCron,
    BookingNotificationCron,
    BookingCryptoService,
    BookingBlacklistService,
    BookingsQueryService,
    BookingLookUpService,
    // Đăng ký Middleware 
    CaptchaMiddleware,
    BlacklistMiddleware,
    RateLimitMiddleware,
  ],
  exports: [BookingsService, OtpService, BookingGateway], // Export nếu các module khác (như Dashboard/Thống kê) cần dùng chung
})
export class BookingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      // 1. Kiểm tra Bot (Captcha) -> 2. Kiểm tra Blacklist -> 3. Kiểm tra Tần suất (Rate limit)
      .apply(CaptchaMiddleware, BlacklistMiddleware, RateLimitMiddleware)
      .forRoutes({ path: 'bookings/hold', method: RequestMethod.POST });
  }
}
