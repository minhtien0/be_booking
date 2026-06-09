import { RedisModule } from '@nestjs-modules/ioredis';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { Service } from './services/entities/service.entity';
import { Combo } from './combos/entities/combo.entity';
import { User } from './users/entities/user.entity';

import { BookinglogsModule } from './bookinglogs/bookinglogs.module';
import { ServicesModule } from './services/services.module';
import { ContactsModule } from './contacts/contacts.module';
import { BookingsModule } from './bookings/bookings.module';
import { AdminBookingsModule } from './admin/admin.module';
import { BarbersModule } from './barbers/barbers.module';
import { CombosModule } from './combos/combos.module';
import { UsersModule } from './users/users.module';
import { BlogsModule } from './blogs/blogs.module';
import { AuthModule } from './auth/auth.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { EventEmitterModule } from '@nestjs/event-emitter';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: true,
      entities: [User, Service, Combo],
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 24 * 60 * 60 * 1000,
    }),
    RedisModule.forRoot({
      type: 'single',
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TelegramModule,
    UsersModule,
    AuthModule,
    ServicesModule,
    CombosModule,
    BlogsModule,
    AdminBookingsModule,
    BookingsModule,
    ContactsModule,
    BarbersModule,
    BookinglogsModule,
  ],
})
export class AppModule { }
