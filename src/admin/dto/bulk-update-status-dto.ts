import { IsArray, IsEnum, IsInt, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '../../bookings/entities/booking.entity';

/**
 * PATCH /admin/bookings/bulk-status
 * Confirm hoặc Cancel nhiều booking cùng lúc
 * (bulk action từ checkbox selection trên table).
 */
export class BulkUpdateStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];

  @IsEnum([BookingStatus.CONFIRMED, BookingStatus.CANCELLED], {
    message: 'Bulk chỉ hỗ trợ confirmed hoặc cancelled',
  })
  status: BookingStatus.CONFIRMED | BookingStatus.CANCELLED;
}