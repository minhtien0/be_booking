import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';   // npm i @nestjs/schedule
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Booking, BookingStatus } from '../entities/booking.entity';
import { RedisLockService } from '../../common/redis/redis-lock.service';

@Injectable()
export class BookingNotificationCron {
    private readonly logger = new Logger(BookingNotificationCron.name);

    constructor(
        @InjectRepository(Booking)
        private readonly bookingRepo: Repository<Booking>,
        private readonly lockService: RedisLockService,
    ) { }

    /**
     * Chạy mỗi phút — quét các lịch hẹn trạng thái CONFIRMED 
     * sẽ bắt đầu sau chính xác 2 tiếng nữa để phát tin nhắc nhở.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async remindUpcomingBookings(): Promise<void> {
        const TAG = '[CRON][REMINDER_2H]';

        // 1. Tính toán mốc thời gian đích (Hiện tại + 2 tiếng)
        const targetTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

        // 2. Ép định dạng YYYY-MM-DD và HH:mm theo đúng múi giờ Việt Nam
        const formatterDate = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
        const formatterTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });

        const targetDate = formatterDate.format(targetTime);       // "2026-06-03"
        const targetSlotTime = formatterTime.format(targetTime);   // "16:15"

        // 3. Tìm các lịch hẹn thỏa mãn điều kiện sắp diễn ra sau 2 tiếng
        const upcomingBookings = await this.bookingRepo.find({
            where: {
                status: BookingStatus.CONFIRMED,
                bookingDate: targetDate,
                slotStartTime: targetSlotTime,
            },
        });

        if (!upcomingBookings.length) return;

        this.logger.log(`${TAG} Tìm thấy ${upcomingBookings.length} lịch hẹn sắp diễn ra sau 2 tiếng nữa.`);

        // 4. Duyệt qua danh sách để thực hiện log nhắc nhở ra Terminal
        upcomingBookings.forEach(booking => {
            console.log(`\n--- 🔔 [TỰ ĐỘNG NHẮC NHỞ LỊCH HẸN] ---`);
            console.log(`Gửi tới Khách hàng: ${booking.customerName} (${booking.customerPhone})`);
            console.log(`Mã lịch hẹn: ${booking.bookingCode || 'N/A'}`);
            console.log(`Thời gian: Giờ hẹn của bạn sẽ bắt đầu vào lúc [${booking.slotStartTime}] ngày [${booking.bookingDate}].`);
            console.log(`Yêu cầu quý khách vui lòng đến trước 5-10 phút để được phục vụ tốt nhất.`);
            console.log(`-------------------------------------\n`);
        });
    }
}
