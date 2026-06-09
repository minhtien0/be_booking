import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt'; // Inject thư viện xử lý mã toán học JWT
import { Booking } from '../entities/booking.entity';
import { LookupBookingDto, VerifyLookupOtpDto } from '../dto/lookup-booking.dto';
import { UpdateBookingDto } from '../dto/update-booking.dto';
import { jwtConstants } from '../../auth/constants'; // Đảm bảo đồng bộ secret key
import { OtpService } from '../../modules/otp/otp.service';

@Injectable()
export class BookingLookUpService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) { }

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

  // 1. Xử lý yêu cầu gửi OTP
  async requestLookupOtp(dto: LookupBookingDto) {
    const booking = await this.findBookingsByPhoneAndOptionalCode(dto.phone, dto.code);
    if (!booking) {
      throw new BadRequestException('Thông tin mã đặt lịch hoặc số điện thoại không chính xác.');
    }
    await this.otpService.send({ type: 'lookup', phone: dto.phone }, dto.phone, dto.code);
    return { success: true, message: 'Mã OTP đã được gửi đến số điện thoại của bạn.' };
  }

  // 2. Xác thực OTP & Cấp phát JWT thời hạn 15 phút
  async verifyLookupOtp(dto: VerifyLookupOtpDto) {

    const booking = await this.findBookingsByPhoneAndOptionalCode(dto.phone, dto.code);
    if (!booking) {
      throw new NotFoundException('Dữ liệu đặt lịch không còn tồn tại.');
    }
    await this.otpService.verify({ type: 'lookup', phone: dto.phone }, dto.otpCode);
    // Tạo payload chứa thông tin định danh duy nhất của đơn đặt lịch này
    const payload = {
      phone: dto.phone,
      bookingCode: dto.code ?? null,
    };

    // Ký số sinh ra mã token ngắn hạn (Không ghi nhận xuống bất kỳ Database nào)
    const managementToken = this.jwtService.sign(payload, {
      secret: jwtConstants.secret,
      expiresIn: '15m',
    });

    return {
      success: 'OTP xác thực thành công.',
      managementToken,
      booking,
    };
  }

  // 3. Giải mã Token bảo mật toán học và Tiến hành cập nhật lịch hẹn
  async guestUpdateBooking(
    id: number,
    token: string,
    updateBookingDto: UpdateBookingDto,
  ) {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: jwtConstants.secret,
      });

      const booking = await this.bookingRepo.findOne({
        where: { id },
      });

      if (!booking) {
        throw new NotFoundException('Không tìm thấy lịch đặt.');
      }

      if (decoded.bookingCode) {
        if (booking.bookingCode !== decoded.bookingCode) {
          throw new BadRequestException(
            'Mã truy cập không trùng khớp với lịch đặt này.',
          );
        }
      } else {
        if (booking.customerPhone !== decoded.phone) {
          throw new BadRequestException(
            'Mã truy cập không hợp lệ với số điện thoại này.',
          );
        }
      }

      await this.bookingRepo.update(id, updateBookingDto);
      const updatedBooking = await this.bookingRepo.findOne({ where: { id } });

      return { success: true, data: updatedBooking };
    } catch {
      throw new BadRequestException(
        'Mã phiên làm việc đã hết hạn (15 phút) hoặc không hợp lệ. Vui lòng xác thực lại OTP.',
      );
    }
  }
}