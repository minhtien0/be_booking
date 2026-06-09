import { Module } from '@nestjs/common';
import { BookinglogsService } from './bookinglogs.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookinglogsController } from './bookinglogs.controller';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingLog } from './entities/bookinglog.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingLog])],
  controllers: [BookinglogsController],
  providers: [BookinglogsService],
})
export class BookinglogsModule { }
