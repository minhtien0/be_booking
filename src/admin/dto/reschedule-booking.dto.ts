import { IsDateString, IsString, Matches, IsOptional, MaxLength } from 'class-validator';

/**
 * PATCH /admin/bookings/:id/reschedule
 * Đổi giờ nhanh từ TIME_SLOTS grid trong detail panel.
 */
export class RescheduleBookingDto {
  @IsDateString()
  bookingDate: string; 

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'newStartTime phải là HH:mm' })
  newStartTime: string; // "09:30"

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string; 
}