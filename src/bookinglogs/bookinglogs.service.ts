import { Injectable } from '@nestjs/common';
import { CreateBookinglogDto } from './dto/create-bookinglog.dto';
import { UpdateBookinglogDto } from './dto/update-bookinglog.dto';

@Injectable()
export class BookinglogsService {
  create(createBookinglogDto: CreateBookinglogDto) {
    return 'This action adds a new bookinglog';
  }

  findAll() {
    return `This action returns all bookinglogs`;
  }

  findOne(id: number) {
    return `This action returns a #${id} bookinglog`;
  }

  update(id: number, updateBookinglogDto: UpdateBookinglogDto) {
    return `This action updates a #${id} bookinglog`;
  }

  remove(id: number) {
    return `This action removes a #${id} bookinglog`;
  }
}
