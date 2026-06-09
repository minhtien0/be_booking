import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, ParseIntPipe,
  HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { AdminBookingsService } from './../service/admin-booking.service';
import { UpdateBookingStatusDto } from './../dto/booking-status.dto';
import { RescheduleBookingDto } from './../dto/reschedule-booking.dto';
import { UpdateBookingNoteDto } from './../dto/update-booking.dto';
import { BulkUpdateStatusDto } from './../dto/bulk-update-status-dto';
import { AdminListBookingsQueryDto } from './../dto/list-booking-query.dto';
/**
 * Prefix: /admin/bookings
 *
 * Endpoints tiêu thụ bởi AdminBookingsPage:
 *
 * GET    /admin/bookings              — danh sách có filter + phân trang
 * GET    /admin/bookings/stats        — counts theo status + doanh thu (sidebar stats)
 * GET    /admin/bookings/barbers-duty — danh sách barber + số lịch hôm nay (sidebar)
 * GET    /admin/bookings/calendar     — các ngày có lịch trong tháng (mini calendar)
 * GET    /admin/bookings/:id          — chi tiết 1 booking (detail panel)
 * PATCH  /admin/bookings/:id/status   — cập nhật trạng thái đơn
 * PATCH  /admin/bookings/:id/reschedule — đổi giờ nhanh (detail panel)
 * PATCH  /admin/bookings/bulk-status  — bulk confirm/cancel
 * DELETE /admin/bookings/:id          — xóa cứng (admin only)
 */
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly svc: AdminBookingsService) { }

  // ── 1. Danh sách có filter + phân trang 
  @Get()
  findAll(@Query() query: AdminListBookingsQueryDto) {
    return this.svc.findAll(query);
  }

  // ── 2. Stats cho sidebar (hôm nay / tháng + counts theo tab) 
  @Get('stats')
  getStats() {
    return this.svc.getStats();
  }

  // ── 3. Barber đang trực hôm nay (sidebar panel) 
  @Get('barbers-duty')
  getBarbersDuty() {
    return this.svc.getBarbersDuty();
  }

  // ── 4. Ngày có lịch trong tháng (mini calendar dot) 
  @Get('calendar')
  getCalendarDots(
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.svc.getCalendarDots(year, month);
  }

  // ── 5. Chi tiết 1 booking (detail panel) 
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  // ── 6. Cập nhật trạng thái đơn lẻ 
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.svc.updateStatus(id, dto);
  }

  // ── 7. Đổi giờ nhanh từ detail panel 
  @Patch(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.svc.reschedule(id, dto);
  }


  // ── 8. Bulk status (confirm / cancel nhiều) 
  @Patch('bulk-status')
  @HttpCode(HttpStatus.OK)
  bulkUpdateStatus(@Body() dto: BulkUpdateStatusDto) {
    return this.svc.bulkUpdateStatus(dto);
  }

  // ── 9. Xóa cứng (admin) 
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}