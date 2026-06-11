import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarbersService } from './barbers.service';
import { BarbersController } from './barbers.controller';
import { Booking } from '../bookings/entities/booking.entity';
import { Barber } from './entities/barber.entity';
import { BookingsModule } from './../bookings/bookings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, Barber]), BookingsModule],
  controllers: [BarbersController],
  providers: [BarbersService],
})
export class BarbersModule { }
