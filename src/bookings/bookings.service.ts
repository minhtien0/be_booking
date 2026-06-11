import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject, HttpException, HttpStatus, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from '../auth/constants';

import { Booking, BookingStatus, VALID_TRANSITIONS } from './entities/booking.entity';
import { BookingLog } from '../bookinglogs/entities/bookinglog.entity';
import { Service } from '../services/entities/service.entity';
import { Combo } from '../combos/entities/combo.entity';
import { HoldBookingDto } from './dto/hold-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

import { RedisLockService } from '../common/redis/redis-lock.service';
import { SlotService } from '../modules/otp/slot.service';
import { OtpService } from '../modules/otp/otp.service';
import { BookingConfirmedPayload } from './booking.gateway';

// Import các sub-services
import { BookingCryptoService } from './services/booking-crypto.service';
import { BookingBlacklistService } from './services/booking-blacklist.service';

const HOLD_TTL_SEC = 10 * 60;
type LogColorKey = 'create' | 'otp' | 'confirm' | 'cancel' | 'expire' | 'reschedule' | 'no_show';
const LOG_COLORS: Record<LogColorKey, string> = {
  create: '#b89a6a', otp: '#f59e0b', confirm: '#22c55e',
  cancel: '#ef4444', expire: '#9ca3af', reschedule: '#8b5cf6', no_show: '#f97316',
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(BookingLog) private readonly logRepo: Repository<BookingLog>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    @InjectRepository(Combo) private readonly comboRepo: Repository<Combo>,
    @InjectRedis() private readonly redis: Redis,
    private readonly jwtService: JwtService,
    private readonly lockService: RedisLockService,
    private readonly otpService: OtpService,
    private readonly slotService: SlotService,
    private readonly eventEmitter: EventEmitter2,

    // Inject Sub-services chuyên trách
    @Inject(forwardRef(() => BookingCryptoService))
    private readonly cryptoService: BookingCryptoService,
    @Inject(forwardRef(() => BookingBlacklistService))
    private readonly blacklistService: BookingBlacklistService,
  ) { }

  // ── Luồng Giao Dịch Chính (Core Writes) ───────────────────────────────────

  // Khóa Slot Khi Đang Đặt Lịch
  async holdSlot(dto: HoldBookingDto, ipAddress: string, captchaScore: number) {
    const { barber_id, service_id, combo_id, booking_date, slot_start_time, customer_name, customer_phone, customer_email, note } = dto;

    // Kiểm tra service và combo
    if (!service_id && !combo_id) throw new BadRequestException('Phải chọn dịch vụ hoặc combo.');
    if (service_id && combo_id) throw new BadRequestException('Chỉ được chọn dịch vụ hoặc combo.');

    let snapshotPrice: number, snapshotDuration: number;
    let serviceEntity: Service | null = null, comboEntity: Combo | null = null;


    // Khởi tạo dữ liệu để thêm vào booking
    if (service_id) {
      const service = await this.serviceRepo.findOne({ where: { id: service_id } });
      if (!service) throw new NotFoundException(`Dịch vụ id=${service_id} không tồn tại.`);
      snapshotPrice = service.originalPrice;
      snapshotDuration = service.duration ?? 30;
      serviceEntity = service;
    } else {
      const combo = await this.comboRepo.findOne({ where: { id: combo_id }, relations: ['services'] });
      if (!combo) throw new NotFoundException(`Combo id=${combo_id} không tồn tại.`);
      snapshotPrice = combo.comboPrice;
      snapshotDuration = combo.services.reduce((acc, s) => acc + (s.duration ?? 30), 0) || 60;
      comboEntity = combo;
    }

    // Check có nằm trong blacklist hay không
    const phoneHash = this.cryptoService.hashPhone(customer_phone);
    await this.blacklistService.checkBlacklist(phoneHash);

    // Check ratelimit 
    await this.checkRateLimit(ipAddress, customer_phone);

    // Lock lại bằng redis
    const slotEndTime = this.calcEndTime(slot_start_time, snapshotDuration);
    const lockKey = this.lockService.slotLockKey(barber_id, booking_date, slot_start_time);

    const lockResult = await this.lockService.withLock(lockKey, async () => {
      // Kiểm tra khung giờ này có ai đặt chưa
      const available = await this.slotService.isSlotAvailable(barber_id, booking_date, slot_start_time, snapshotDuration);
      if (!available) throw new ConflictException('Khung giờ này vừa có khách giữ trước.');

      const holdExpiresAt = new Date(Date.now() + HOLD_TTL_SEC * 1000);
      const booking = this.bookingRepo.create({
        barber: { id: barber_id } as any,
        barberId: barber_id,
        service: serviceEntity,
        combo: comboEntity,
        appointmentTime: new Date(`${booking_date}T${slot_start_time}:00`),
        bookingDate: booking_date,
        slotStartTime: slot_start_time,
        slotEndTime,
        totalDuration: snapshotDuration,
        snapshotPrice,
        snapshotDuration,
        customerName: customer_name,
        customerPhone: customer_phone,
        customerPhoneEncrypted: this.cryptoService.encryptPhone(customer_phone),
        customerPhoneHash: phoneHash,
        customerEmail: customer_email ?? null,
        note: note ?? null,
        status: BookingStatus.PENDING,
        holdExpiresAt,
        ipAddress,
        captchaScore,
      });

      const saved = await this.bookingRepo.save(booking);
      const itemName = serviceEntity?.name ?? comboEntity?.name ?? 'Dịch vụ';

      // Thêm log vào để kiểm tra
      await this.addLog(saved.id, `Đặt lịch qua website — ${itemName} — Giá: ${snapshotPrice.toLocaleString('vi-VN')}đ`, 'create');

      // Tạo khóa trong vòng HOLD_TTL_SEC
      await this.lockService.setSlotHold(barber_id, booking_date, slot_start_time, saved.id, HOLD_TTL_SEC);

      return saved;
    });

    if (!lockResult.success) throw new ConflictException('Slot đang được xử lý. Thử lại sau.');

    const booking = lockResult.result;
    // Tăng ratelimit
    await this.incrementRateLimit(ipAddress, customer_phone);
    // Send 
    await this.otpService.send({ type: 'booking', bookingId: booking.id }, customer_phone);

    return {
      booking_id: booking.id,
      expires_at: booking.holdExpiresAt,
      message: `Slot đã giữ. OTP đã gửi về ${this.cryptoService.maskPhone(customer_phone)}.`,
    };
  }

  // Xác Thực OTP
  async verifyOtp(bookingId: number, otp: string) {
    // Tìm lịch hẹn có tồn tại
    const booking = await this.findActiveBooking(bookingId);
    // Đổi trạng thái
    this.assertTransition(booking.status, BookingStatus.OTP_VERIFIED);
    this.assertNotExpired(booking);

    await this.otpService.verify({ type: 'booking', bookingId }, otp);
    // Đổi trạng thái
    booking.status = BookingStatus.OTP_VERIFIED;
    booking.otpVerifiedAt = new Date();

    await this.bookingRepo.save(booking);
    return { message: 'OTP xác thực thành công.' };
  }

  // Xác Nhận
  async findBookingsByPhoneAndOptionalCode(
    customerPhone: string,
    bookingCode?: string,
  ): Promise<any[]> { // Đổi kiểu dữ liệu trả về thành any[] để linh hoạt map dữ liệu phẳng
    let bookings: Booking[] = [];

    // 1. Thực hiện truy vấn kèm theo nạp (JOIN) đầy đủ bảng liên kết dữ liệu
    if (bookingCode && bookingCode.trim()) {
      const booking = await this.bookingRepo.findOne({
        where: { bookingCode: bookingCode.trim(), customerPhone },
        relations: ['service', 'combo', 'barber'], // SỬA LỖI: Bắt buộc nạp các quan hệ này để lấy Name
      });

      bookings = booking ? [booking] : [];
    } else {
      bookings = await this.bookingRepo.find({
        where: { customerPhone },
        relations: ['service', 'combo', 'barber'], // SỬA LỖI: Bắt buộc nạp các quan hệ này để lấy Name
        order: { bookingDate: 'DESC', },
      });
    }

    // 2. MAPPER: Chuyển đổi Object lồng nhau thành các trường phẳng khớp hoàn toàn với Front-end mong đợi
    return bookings.map((b) => ({
      id: b.id,
      bookingCode: b.bookingCode,
      appointmentTime: b.appointmentTime,
      bookingDate: b.bookingDate,
      slotStartTime: b.slotStartTime,
      slotEndTime: b.slotEndTime,
      totalDuration: b.totalDuration,
      snapshotPrice: b.snapshotPrice,
      status: b.status,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      note: b.note,
      serviceName: b.combo ? b.combo.name : (b.service ? b.service.name : 'Dịch vụ tùy chỉnh'),
      barberName: b.barber ? b.barber.name : 'Chưa chọn thợ',
      type: b.combo ? 'combo' : 'service',
    }));
  }

  async confirm(bookingId: number) {
    const booking = await this.findActiveBooking(bookingId);
    this.assertTransition(booking.status, BookingStatus.CONFIRMED);
    this.assertNotExpired(booking);

    // Sinh bookingCode nếu chưa có
    if (!booking.bookingCode) {
      booking.bookingCode = await this.generateBookingCode();
    }

    booking.status = BookingStatus.CONFIRMED;
    booking.confirmedAt = new Date();
    booking.holdExpiresAt = null;

    await this.bookingRepo.save(booking);
    await this.addLog(booking.id, 'Xác nhận lịch hẹn thành công', 'confirm');

    // ── Decrypt & mask phone ──────────────────────────────────────────────
    let maskedPhone = '—';
    try {
      const plain = this.cryptoService.decryptPhone(booking.customerPhoneEncrypted);
      maskedPhone = plain.length >= 7
        ? plain.slice(0, 3) + '****' + plain.slice(-3)
        : plain;
    } catch { /* bỏ qua nếu decrypt lỗi */ }

    // ── Tính initials ─────────────────────────────────────────────────────
    const initials = booking.customerName
      .trim().split(/\s+/).slice(-2).map((w: string) => w[0]).join('').toUpperCase();

    // ── Build payload đầy đủ cho gateway ─────────────────────────────────
    const payload: BookingConfirmedPayload = {
      // Toast info
      bookingId: booking.id,
      bookingCode: booking.bookingCode ?? `#${booking.id}`,
      customerName: booking.customerName,
      customerPhone: maskedPhone,
      bookingDate: booking.bookingDate,
      slotStart: booking.slotStartTime,
      slotEnd: booking.slotEndTime ?? '',
      serviceName: booking.service?.name ?? booking.combo?.name ?? '—',
      barberName: booking.barber?.name ?? '—',
      price: booking.snapshotPrice,

      // Full row để frontend prepend vào bảng ngay, không cần reload
      row: {
        id: booking.id,
        code: booking.bookingCode,
        customer: booking.customerName,
        phone: maskedPhone,
        initials,
        service: booking.service?.name ?? booking.combo?.name ?? '—',
        barber: booking.barber?.name ?? '—',
        barberId: booking.barberId,
        date: booking.bookingDate,
        time: booking.slotStartTime,
        endTime: booking.slotEndTime ?? '',
        price: booking.snapshotPrice,
        status: BookingStatus.CONFIRMED,
        visits: 0,   // sẽ được cập nhật lần reload tiếp theo
        note: booking.note ?? '',
      },
    };
    const confirmedBooking = await this.bookingRepo.findOne({
      where: { id: booking.id },
      relations: ['service', 'combo', 'barber'],
    });

    const managementToken = this.jwtService.sign({
      phone: booking.customerPhone,
      bookingCode: booking.bookingCode,
    }, {
      secret: jwtConstants.secret,
      expiresIn: '15m',
    });
    const bookingData = await this.findBookingsByPhoneAndOptionalCode(
      confirmedBooking.customerPhone,
      confirmedBooking.bookingCode,
    )

    this.eventEmitter.emit('booking.confirmed', payload);

    return {
      booking_id: booking.id,
      status: BookingStatus.CONFIRMED,
      managementToken,
      booking: bookingData,
      message: 'Đặt lịch thành công!',
    };
  }

  // Hủy
  async cancel(bookingId: number, reason?: string) {
    const booking = await this.findActiveBooking(bookingId);
    this.assertTransition(booking.status, BookingStatus.CANCELLED);

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancellationReason = reason ?? 'Hủy bởi khách hàng';

    await this.bookingRepo.save(booking);
    await this.addLog(booking.id, `Huỷ lịch — Lý do: ${booking.cancellationReason}`, 'cancel');
    await this.lockService.releaseSlotHold(booking.barberId, booking.bookingDate, booking.slotStartTime);

    return { message: 'Hủy lịch thành công.' };
  }

  // Lên lịch lại
  async reschedule(bookingId: number, newDate: string, newStartTime: string) {
    const booking = await this.findActiveBooking(bookingId);
    if (![BookingStatus.CONFIRMED, BookingStatus.OTP_VERIFIED].includes(booking.status)) {
      throw new BadRequestException('Chỉ có thể thay đổi lịch khi lịch hẹn đã xác thực hoặc đã xác nhận.');
    }

    const oldDate = booking.bookingDate;
    const oldStart = booking.slotStartTime;
    const lockKey = this.lockService.slotLockKey(booking.barberId, newDate, newStartTime);

    const lockResult = await this.lockService.withLock(lockKey, async () => {
      const available = await this.slotService.isSlotAvailable(booking.barberId, newDate, newStartTime, booking.totalDuration);
      if (!available) throw new ConflictException('Khung giờ mới bạn chọn hiện tại đã kín.');

      await this.lockService.releaseSlotHold(booking.barberId, oldDate, oldStart);

      booking.bookingDate = newDate;
      booking.slotStartTime = newStartTime;
      booking.slotEndTime = this.calcEndTime(newStartTime, booking.totalDuration);

      await this.bookingRepo.save(booking);
      await this.addLog(booking.id, `Đổi lịch sang ${newDate} lúc ${newStartTime}`, 'reschedule');
      await this.lockService.setSlotHold(booking.barberId, newDate, newStartTime, booking.id, HOLD_TTL_SEC);

      return booking;
    });

    if (!lockResult.success) throw new ConflictException('Khung giờ mới đang trong phiên giao dịch khác.');
    return { message: 'Thay đổi ngày giờ đặt lịch thành công.', new_date: newDate, new_start: newStartTime };
  }


  // Đánh dấu văng mặt (đặt mà không tới)
  async markNoShow(bookingId: number) {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Lịch đặt không tồn tại.');
    if (booking.status !== BookingStatus.CONFIRMED) throw new BadRequestException('Chỉ lịch trạng thái CONFIRMED mới có thể đánh dấu No-Show.');

    booking.isNoShow = true;
    booking.status = BookingStatus.DONE;
    await this.bookingRepo.save(booking);
    await this.addLog(booking.id, 'Khách không đến — Đánh dấu no-show', 'no_show');

    await this.blacklistService.handleNoShowBlacklist(booking.customerPhoneHash, booking.customerPhoneEncrypted);
  }

  // Gửi lại mã OTP
  async resendOtp(bookingId: number) {
    const booking = await this.findActiveBooking(bookingId);
    if (booking.status !== BookingStatus.PENDING) throw new BadRequestException('Không thể gửi lại OTP tại trạng thái này.');
    this.assertNotExpired(booking);

    const phone = this.cryptoService.decryptPhone(booking.customerPhoneEncrypted);
    await this.otpService.resend({ type: 'booking', bookingId }, phone);
    return { message: `Mã OTP mới đã được gửi lại về ${this.cryptoService.maskPhone(phone)}.` };
  }


  // Chỉnh sửa lịch  
  async update(id: number, dto: UpdateBookingDto) {
    // 1. Kiểm tra lịch hẹn có tồn tại không
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn với ID ${id}`);
    }

    const changes: string[] = [];

    // 2. So sánh và kiểm tra thay đổi tên khách hàng
    if (dto.customerName && dto.customerName !== booking.customerName) {
      changes.push(`Họ tên: "${booking.customerName}" ➔ "${dto.customerName}"`);
      booking.customerName = dto.customerName;
    }

    // 3. So sánh và kiểm tra thay đổi Số điện thoại (Cập nhật cả mã hóa & hash nếu có)
    if (dto.customerPhone && dto.customerPhone !== booking.customerPhone) {
      changes.push(`SĐT: "${booking.customerPhone}" ➔ "${dto.customerPhone}"`);
      booking.customerPhone = dto.customerPhone;
      if (this.cryptoService) {
        booking.customerPhoneEncrypted = this.cryptoService.encryptPhone(dto.customerPhone);
        booking.customerPhoneHash = this.cryptoService.hashPhone(dto.customerPhone);
      }
    }

    // 4. So sánh thay đổi ngày hẹn
    if (dto.bookingDate && dto.bookingDate !== booking.bookingDate) {
      changes.push(`Ngày hẹn: "${booking.bookingDate}" ➔ "${dto.bookingDate}"`);
      booking.bookingDate = dto.bookingDate;
    }

    // 5. So sánh thay đổi giờ hẹn (Tính toán lại giờ kết thúc tương ứng)
    if (dto.slotStartTime && dto.slotStartTime !== booking.slotStartTime) {
      changes.push(`Giờ bắt đầu: "${booking.slotStartTime}" ➔ "${dto.slotStartTime}"`);
      booking.slotStartTime = dto.slotStartTime;
      // Tự động tính toán lại thời gian kết thúc dựa trên tổng thời lượng hiện tại
      booking.slotEndTime = this.calcEndTime(dto.slotStartTime, booking.totalDuration);
      booking.appointmentTime = new Date(`${booking.bookingDate}T${dto.slotStartTime}:00`);
    }

    // 6. So sánh thay đổi ghi chú lời nhắn
    if (dto.note !== undefined && dto.note !== booking.note) {
      changes.push(`Ghi chú: "${booking.note || 'Trống'}" ➔ "${dto.note || 'Trống'}"`);
      booking.note = dto.note;
    }

    // 7. Nếu phát hiện có sự thay đổi dữ liệu, thực hiện lưu và ghi nhận log
    if (changes.length > 0) {
      booking.editedAt = new Date();
      booking.editReason = dto.editReason || 'Chỉnh sửa thông tin lịch hẹn';

      // Lưu bản ghi vào Database
      const updatedBooking = await this.bookingRepo.save(booking);

      // Xây dựng nội dung nhật ký chi tiết thay đổi rõ ràng
      const logDetails = `Chỉnh sửa lịch hẹn — Lý do: ${booking.editReason} — Chi tiết: [${changes.join(', ')}]`;

      // Ghi log vào bảng BookingLog hệ thống
      await this.addLog(id, logDetails, 'reschedule');

      return {
        success: true,
        message: 'Cập nhật thông tin lịch hẹn thành công.',
        data: updatedBooking,
      };
    }

    return {
      success: true,
      message: 'Không có thông tin nào thay đổi.',
      data: booking,
    };
  }

  // ── Cron Job Tasks ────────────────────────────────────────────────────────

  // Clean những booking đã hết hạn
  async handleExpireBookings(): Promise<void> {
    const staleBookings = await this.bookingRepo.find({
      where: {
        status: In([BookingStatus.PENDING, BookingStatus.OTP_VERIFIED]),
        holdExpiresAt: LessThan(new Date()),
      },
      select: ['id', 'barberId', 'bookingDate', 'slotStartTime'],
    });

    if (!staleBookings.length) return;

    const ids = staleBookings.map((b) => b.id);
    await this.bookingRepo.createQueryBuilder().update(Booking).set({ status: BookingStatus.EXPIRED }).whereInIds(ids).execute();

    for (const b of staleBookings) {
      await this.addLog(b.id, 'Lịch hẹn hết hạn do không xác nhận trong 10 phút', 'expire');
    }

    await Promise.allSettled(staleBookings.map((b) => this.lockService.releaseSlotHold(b.barberId, b.bookingDate, b.slotStartTime)));
  }

  // ── Admin Update/Delete ───────────────────────────────────────────────────

  remove(id: number) {
    return this.bookingRepo.delete(id);
  }

  // ── Private Validation/Business Helpers ────────────────────────────────────

  private async findActiveBooking(id: number): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['barber', 'service', 'combo']
    });
    if (!booking) throw new NotFoundException(`Lịch hẹn #${id} không tồn tại.`);
    return booking;
  }

  private async addLog(bookingId: number, actionText: string, colorKey: LogColorKey): Promise<void> {
    const log = this.logRepo.create({ actionText, color: LOG_COLORS[colorKey], booking: { id: bookingId } as Booking });
    await this.logRepo.save(log);
  }

  private assertTransition(from: BookingStatus, to: BookingStatus): void {
    if (!VALID_TRANSITIONS[from].includes(to)) throw new BadRequestException(`Không thể chuyển trạng thái từ ${from} sang ${to}`);
  }

  private assertNotExpired(booking: Booking): void {
    if (booking.holdExpiresAt && new Date() > booking.holdExpiresAt) {
      throw new BadRequestException('Thời gian hoàn tất giao dịch đã hết hạn. Vui lòng giữ chỗ lại.');
    }
  }

  private calcEndTime(startTime: string, durationMin: number): string {
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + durationMin;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  }

  private async generateBookingCode(): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const latestBooking = await this.bookingRepo.createQueryBuilder('booking')
      .where('booking.bookingCode LIKE :pattern', { pattern: `BK-${yearMonth}-%` })
      .orderBy('booking.bookingCode', 'DESC').getOne();

    let nextSequence = '001';
    if (latestBooking && latestBooking.bookingCode) {
      const parts = latestBooking.bookingCode.split('-');
      nextSequence = String(parseInt(parts[2], 10) + 1).padStart(3, '0');
    }
    return `BK-${yearMonth}-${nextSequence}`;
  }

  // Dùng đúng key format của middleware để dùng chung 1 counter
  private async checkRateLimit(ip: string, phone: string): Promise<void> {
    const phoneHash = this.cryptoService.hashPhone(phone);

    const checks = [
      {
        key: `rate:daily:${phoneHash}`,
        max: 20,
        message: 'Bạn đã đặt tối đa 2 lịch hôm nay. Vui lòng thử lại vào ngày mai.',
      },
      {
        key: `rate:weekly:${phoneHash}`,
        max: 5,
        message: 'Bạn đã đặt tối đa 5 lịch tuần này. Vui lòng liên hệ tiệm trực tiếp.',
      },
      {
        key: `rate:daily:${ip}`,
        max: 20,
        message: 'Quá nhiều yêu cầu từ địa chỉ này. Thử lại sau.',
      },
    ];

    for (const { key, max, message } of checks) {
      const count = Number(await this.redis.get(key) ?? 0);
      if (count >= max) {
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, message },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async incrementRateLimit(ip: string, phone: string): Promise<void> {
    const phoneHash = this.cryptoService.hashPhone(phone);
    const DAY = 60 * 60 * 24;
    const WEEK = DAY * 7;

    const pipeline = this.redis.pipeline();
    pipeline.incr(`rate:daily:${phoneHash}`);
    pipeline.expire(`rate:daily:${phoneHash}`, DAY);
    pipeline.incr(`rate:weekly:${phoneHash}`);
    pipeline.expire(`rate:weekly:${phoneHash}`, WEEK);
    pipeline.incr(`rate:daily:${ip}`);
    pipeline.expire(`rate:daily:${ip}`, DAY);
    await pipeline.exec();
  }
}