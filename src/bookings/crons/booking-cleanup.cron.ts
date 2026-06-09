import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';   // npm i @nestjs/schedule
import { InjectRepository }     from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Booking, BookingStatus }   from '../entities/booking.entity';
import { RedisLockService }         from '../../common/redis/redis-lock.service';

@Injectable()
export class BookingCleanupCron {
  private readonly logger = new Logger(BookingCleanupCron.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly lockService: RedisLockService,
  ) {}

  /**
   * Chạy mỗi phút — quét PENDING/OTP_VERIFIED booking đã hết holdExpiresAt
   * và chuyển sang EXPIRED, giải phóng Redis hold key
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleBookings(): Promise<void> {
    const TAG = '[CRON][EXPIRE_BOOKINGS]';

    const staleBookings = await this.bookingRepo.find({
      where: {
        status:         In([BookingStatus.PENDING, BookingStatus.OTP_VERIFIED]),
        holdExpiresAt:  LessThan(new Date()),
      },
      select: ['id', 'barberId', 'bookingDate', 'slotStartTime', 'status'],
    });

    if (!staleBookings.length) return;

    this.logger.log(`${TAG} Found ${staleBookings.length} stale booking(s) to expire.`);

    // Batch update status → EXPIRED
    const ids = staleBookings.map(b => b.id);
    await this.bookingRepo
      .createQueryBuilder()
      .update(Booking)
      .set({ status: BookingStatus.EXPIRED })
      .whereInIds(ids)
      .execute();

    // Giải phóng Redis hold key cho từng booking
    await Promise.allSettled(
      staleBookings.map(b =>
        this.lockService.releaseSlotHold(b.barberId, b.bookingDate, b.slotStartTime),
      ),
    );

    this.logger.log(`${TAG} Expired IDs: [${ids.join(', ')}]`);
  }

  /**
   * Chạy mỗi ngày lúc 2:00 AM — dọn dẹp EXPIRED booking cũ hơn 30 ngày
   * để tránh bảng booking phình to
   */
  @Cron('0 2 * * *')
  async archiveOldExpiredBookings(): Promise<void> {
    const TAG      = '[CRON][ARCHIVE_EXPIRED]';
    const cutoff   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.bookingRepo
      .createQueryBuilder()
      .delete()
      .from(Booking)
      .where('status IN (:...statuses)', {
        statuses: [BookingStatus.EXPIRED, BookingStatus.CANCELLED],
      })
      .andWhere('"createdAt" < :cutoff', { cutoff })
      .execute();

    this.logger.log(`${TAG} Archived ${result.affected} old booking(s).`);
  }

  /**
   * Chạy mỗi ngày lúc 22:00 — đánh dấu CONFIRMED booking trong ngày
   * không có checkin là no-show
   */
  @Cron('0 22 * * *')
  async markNoShowsForToday(): Promise<void> {
    const TAG     = '[CRON][NO_SHOW]';
    const today   = new Date().toISOString().split('T')[0];

    // Những booking CONFIRMED hôm nay chưa được complete → no-show
    const result = await this.bookingRepo
      .createQueryBuilder()
      .update(Booking)
      .set({ isNoShow: true, status: BookingStatus.DONE })
      .where('status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('"bookingDate" = :today', { today })
      .andWhere('"isNoShow" = false')
      .execute();

    this.logger.log(`${TAG} Marked ${result.affected} no-show(s) for ${today}.`);

    // TODO: sau khi mark, bắn event để BookingService.handleNoShowBlacklist() xử lý
    // Cần join phone_hash từ booking rồi gọi hàm handleNoShowBlacklist
  }
}
