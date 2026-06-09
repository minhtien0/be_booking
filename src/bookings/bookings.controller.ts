import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
// ── Services & Middlewares ──────────────────────────────────────────────────
import { BookingsService } from './bookings.service';
import { BookingsQueryService } from './services/bookings-query.service';
import { BookingLookUpService } from './services/booking-lookup.service';
import { RateLimitMiddleware } from '../common/middlewares/rate-limit.middleware';
// ── DTOs ────────────────────────────────────────────────────────────────────
import { HoldBookingDto } from './dto/hold-booking.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AvailableSlotsQueryDto } from './dto/available-slots-query.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { LookupBookingDto, VerifyLookupOtpDto } from './dto/lookup-booking.dto';

@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingsServiceQuery: BookingsQueryService,
    private readonly bookingLookUpService: BookingLookUpService,
    private readonly rateLimitMiddleware: RateLimitMiddleware,
  ) { }

  @Get('barbers/:barberId/available-slots')
  async getAvailableSlots(
    @Param('barberId', ParseIntPipe) barberId: number,
    @Query() query: AvailableSlotsQueryDto,
  ) {
    return this.bookingsServiceQuery.getAvailableSlots(
      barberId,
      query.date
    );
  }

  @Get('availability')
  async getAvailability(
    @Query('barberId', ParseIntPipe) barberId: number,
    @Query('date') date: string,
  ) {
    if (!barberId || !date) {
      throw new BadRequestException('Vui lòng truyền đầy đủ barberId và date (YYYY-MM-DD)');
    }
    // Fallback truyền mảng rỗng nếu không chọn gói dịch vụ cụ thể
    const availableSlots = await this.bookingsServiceQuery.getAvailableSlots(barberId, date);
    return {
      success: true,
      date,
      barberId,
      availableSlots,
    };
  }

  @Post('hold')
  @HttpCode(HttpStatus.CREATED)
  async holdSlot(@Body() dto: HoldBookingDto, @Req() req: Request) {
    const ip = this.getIp(req);
    const captchaScore = (req as any).captchaScore ?? null;

    const result = await this.bookingsService.holdSlot(dto, ip, captchaScore);

    // Kích hoạt tăng bộ đếm chặn spam IP sau khi khóa giữ slot thành công
    const rateLimitIds = (req as any).rateLimitIds as string[] ?? [];
    if (rateLimitIds.length) {
      await this.rateLimitMiddleware.increment(rateLimitIds);
    }

    this.logger.log(`[HOLD_SUCCESS] IP Address=${ip} -> bookingId=${result.booking_id}`);
    return result;
  }

  @Get('')
  findAll() {
    return this.bookingsServiceQuery.findAll();
  }

  @Post('lookup')
  @HttpCode(HttpStatus.OK) // Sử dụng OK thay vì Created vì mục đích là tìm kiếm/truy xuất bảo mật
  async lookup(@Body() payload: LookupBookingDto) {
    return this.bookingsServiceQuery.lookupBookings(payload.phone, payload.code);
  }

  /** Xác thực mã OTP gửi về máy khách */
  @Post(':id/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyOtpDto,
  ) {
    return this.bookingsService.verifyOtp(id, dto.otp);
  }

  /** Yêu cầu gửi lại mã OTP mới */
  @Post(':id/resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Param('id', ParseIntPipe) id: number) {
    return this.bookingsService.resendOtp(id);
  }

  /** Khách xác nhận chốt lịch sau khi qua các bước kiểm tra */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id', ParseIntPipe) id: number) {
    return this.bookingsService.confirm(id);
  }

  /** Khách hàng chủ động hủy lịch */
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    return this.bookingsService.cancel(id, reason);
  }

  /** Thay đổi ngày giờ hẹn sang một ô trống khác */
  @Put(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  async reschedule(
    @Param('id', ParseIntPipe) id: number,
    @Body('new_date') newDate: string,
    @Body('new_start_time') newStartTime: string,
  ) {
    return this.bookingsService.reschedule(id, newDate, newStartTime);
  }

  // NHÓM 2: CÁC ROUTE LOOKUP

  @Post('lookup/send-otp')
  async requestLookupOtp(@Body() dto: LookupBookingDto) {
    return await this.bookingLookUpService.requestLookupOtp(dto);
  }

  // 2. Xác thực OTP -> Cấp token quản lý ngắn hạn (15 phút)
  @Post('lookup/verifylookup-otp')
  async verifyLookupOtp(@Body() dto: VerifyLookupOtpDto, @Req() req: Request,) {
    return await this.bookingLookUpService.verifyLookupOtp(dto);
  }

  // 3. API Chỉnh sửa lịch hẹn sử dụng Token Bảo Mật gửi từ Header
  @Patch('gateway/update/:id')
  async guestUpdateBooking(
    @Param('id') id: number,
    @Body() updateBookingDto: UpdateBookingDto,
    @Headers('authorization') authHeader: string, // Lấy trực tiếp chuỗi Authorization từ Header
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Bạn không có quyền thực hiện thao tác này (Thiếu Token).');
    }
    // Tách lấy chuỗi mã hóa JWT bí mật
    const token = authHeader.split(' ')[1];
    return await this.bookingLookUpService.guestUpdateBooking(id, token, updateBookingDto);
  }

  // NHÓM 3: CÁC ROUTE CRUD DANH ĐỊNH (TÌM CHÍNH XÁC/CẬP NHẬT THEO ID) - ĐỂ DƯỚI CÙNG

  /** Lấy chi tiết một lịch đặt cụ thể */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bookingsServiceQuery.findOne(id);
  }

  /** Admin chỉnh sửa thô thông tin của bản ghi */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBookingDto: UpdateBookingDto
  ) {
    this.logger.log(`[UPDATE_REQUEST] Tiến hành chỉnh sửa lịch hẹn ID=${id}`);
    const result = await this.bookingsService.update(id, updateBookingDto);
    this.logger.log(`[UPDATE_SUCCESS] Đã cập nhật thành công lịch hẹn ID=${id}`);
    return result;
  }

  /** Xóa hoàn toàn bản ghi khỏi hệ thống */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.bookingsService.remove(id);
  }

  // ─── Utilities Private Helpers ───────────────────────────────────────────
  private getIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}