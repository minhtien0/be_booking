import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Booking, BookingStatus } from '../../bookings/entities/booking.entity';

export interface ServiceInfo {
  id: number;
  duration: number;
}

export interface BarberWorkingHours {
  startTime: string; 
  endTime:   string; 
}

export interface AvailableSlot {
  startTime: string; 
  endTime:   string;
  available: boolean;
}

/**
 * Các trạng thái "đang chiếm slot" — EXPIRED / CANCELLED / DONE không giữ slot nữa.
 * OTP_VERIFIED thêm vào để tránh race condition giữa bước verify và confirm.
 */
const OCCUPYING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.OTP_VERIFIED,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
];

@Injectable()
export class SlotService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  // Chuyển "HH:mm" thành phút tính từ 00:00 
  private toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private fromMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Lấy danh sách khoảng thời gian đang bị chiếm của barber trong ngày.
   * Chỉ select 2 field cần thiết, tránh load toàn bộ entity.
   */
  private async getOccupiedRanges(
    barberId: number,
    date: string,
  ): Promise<Array<{ startMin: number; endMin: number }>> {
    const bookings = await this.bookingRepo.find({
      where: {
        barberId, 
        bookingDate: date,
        status: In(OCCUPYING_STATUSES),
      },
      select: ['slotStartTime', 'slotEndTime'],
    });

    return bookings.map((b) => ({
      startMin: this.toMinutes(b.slotStartTime),
      endMin:   this.toMinutes(b.slotEndTime),
    }));
  }

  /**
   * Kiểm tra overlap: [startMin, endMin) giao với bất kỳ khoảng nào đang chiếm
   */
  private isOccupied(
    startMin: number,
    endMin: number,
    occupied: Array<{ startMin: number; endMin: number }>,
  ): boolean {
    return occupied.some((o) => startMin < o.endMin && endMin > o.startMin);
  }

  /**
   * Trả về toàn bộ slot trong ngày với trạng thái available/unavailable.
   *
   * @param barberId     ID thợ
   * @param date         "2026-05-26"
   * @param services     Danh sách service với duration (phút)
   * @param workingHours Khung giờ làm việc (mặc định 09:00–21:00)
   * @param stepMinutes  Bước nhảy giữa các slot (mặc định 15 phút)
   */
  async getAvailableSlots(
    barberId: number,
    date: string,
    services: ServiceInfo[],
    workingHours: BarberWorkingHours = { startTime: '09:00', endTime: '21:00' },
    stepMinutes = 15,
  ): Promise<AvailableSlot[]> {
    const totalDuration = services.reduce((acc, s) => acc + s.duration, 0);
    const workStart     = this.toMinutes(workingHours.startTime);
    const workEnd       = this.toMinutes(workingHours.endTime);
    const occupied      = await this.getOccupiedRanges(barberId, date);

    // Với ngày hôm nay: bỏ qua các slot đã qua + buffer 30 phút
    const todayStr   = new Date().toISOString().split('T')[0];
    const now        = new Date();
    const nowMinutes = date === todayStr
      ? now.getHours() * 60 + now.getMinutes() + 30
      : 0;

    const slots: AvailableSlot[] = [];

    for (
      let start = Math.max(workStart, nowMinutes);
      start + totalDuration <= workEnd;
      start += stepMinutes
    ) {
      const end       = start + totalDuration;
      const available = !this.isOccupied(start, end, occupied);

      slots.push({
        startTime: this.fromMinutes(start),
        endTime:   this.fromMinutes(end),
        available,
      });
    }

    return slots;
  }

  /**
   * Double-check 1 slot cụ thể trước khi tạo booking (gọi sau khi acquire lock).
   */
  async isSlotAvailable(
    barberId: number,
    date: string,
    startTime: string,
    totalDuration: number,
  ): Promise<boolean> {
    const startMin = this.toMinutes(startTime);
    const endMin   = startMin + totalDuration;
    const occupied = await this.getOccupiedRanges(barberId, date);
    return !this.isOccupied(startMin, endMin, occupied);
  }
}