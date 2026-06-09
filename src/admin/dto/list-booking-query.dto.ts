import { IsOptional, IsString, IsInt, IsEnum, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '../../bookings/entities/booking.entity';

/**
 * Query params cho GET /admin/bookings
 * Tương ứng với các filter trên AdminBookingsPage:
 *   - search     : tên khách / SĐT / mã booking
 *   - status     : filter theo trạng thái (select box)
 *   - barberId   : filter theo barber (select box)
 *   - serviceId  : filter theo service (select box)
 *   - date       : lọc theo ngày chọn từ mini-calendar
 *   - tab        : tab "today" | "all" | BookingStatus
 *   - page       : trang hiện tại
 *   - limit      : kích thước trang (mặc định 8 — khớp PAGE_SIZE frontend)
 */
export class AdminListBookingsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  barberId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceId?: number;

  /** Lọc theo ngày cụ thể từ mini calendar: "YYYY-MM-DD" */
  @IsOptional()
  @IsDateString()
  date?: string;

  /**
   * Tab filter:
   *  - "all"    → tất cả
   *  - "today"  → bookingDate = hôm nay
   *  - BookingStatus value → lọc theo status
   */
  @IsOptional()
  @IsString()
  tab?: 'all' | 'today' | BookingStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 8;
}