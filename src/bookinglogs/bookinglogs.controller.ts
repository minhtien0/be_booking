import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BookinglogsService } from './bookinglogs.service';
import { CreateBookinglogDto } from './dto/create-bookinglog.dto';
import { UpdateBookinglogDto } from './dto/update-bookinglog.dto';

@Controller('bookinglogs')
export class BookinglogsController {
  constructor(private readonly bookinglogsService: BookinglogsService) {}

  @Post()
  create(@Body() createBookinglogDto: CreateBookinglogDto) {
    return this.bookinglogsService.create(createBookinglogDto);
  }

  @Get()
  findAll() {
    return this.bookinglogsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookinglogsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBookinglogDto: UpdateBookinglogDto) {
    return this.bookinglogsService.update(+id, updateBookinglogDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bookinglogsService.remove(+id);
  }
}
