import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BookingStatus } from '../../bookings/entities/booking.entity';

/**
 * PATCH /admin/bookings/:id/status
 * Admin có quyền force-chuyển bất kỳ trạng thái nào.
 * Nếu status = CANCELLED thì reason nên được cung cấp.
 */
export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus)
  status: BookingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}