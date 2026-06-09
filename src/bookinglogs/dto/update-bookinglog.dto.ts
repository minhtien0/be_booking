import { PartialType } from '@nestjs/mapped-types';
import { CreateBookinglogDto } from './create-bookinglog.dto';

export class UpdateBookinglogDto extends PartialType(CreateBookinglogDto) {}
