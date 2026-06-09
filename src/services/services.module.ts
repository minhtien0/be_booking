import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { Service } from './entities/service.entity';
import { Booking } from '../bookings/entities/booking.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Booking])], 
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [TypeOrmModule], 
})
export class ServicesModule {}