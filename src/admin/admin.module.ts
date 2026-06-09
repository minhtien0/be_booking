import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminBookingsController } from './controller/admin-booking.controller';
import { AdminBookingsService }    from './service/admin-booking.service';
import { Booking }  from '../bookings/entities/booking.entity';
import { Barber }   from '../barbers/entities/barber.entity';
import { Service }  from '../services/entities/service.entity';
import { BookingLog } from '../bookinglogs/entities/bookinglog.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingLog, Barber, Service])],
  controllers: [AdminBookingsController],
  providers:   [AdminBookingsService],
  exports:     [AdminBookingsService],
})
export class AdminBookingsModule {}