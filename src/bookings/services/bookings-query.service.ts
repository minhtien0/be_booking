import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Booking, BookingStatus } from './../entities/booking.entity';
import * as crypto from 'crypto';

@Injectable()
export class BookingsQueryService {
    constructor(
        @InjectRepository(Booking)
        private readonly bookingRepo: Repository<Booking>,
    ) { }

    async getAvailableSlots(barberId: number, dateStr: string): Promise<string[]> {
        const START_HOUR = 8;  // 08:00
        const END_HOUR = 20;   // 20:00
        const SLOT_INTERVAL = 30;
        const now = new Date();

        const startOfDay = new Date(`${dateStr}T00:00:00`);
        const endOfDay = new Date(`${dateStr}T23:59:59`);

        const confirmedBookings = await this.bookingRepo.find({
            where: {
                barber: { id: barberId },
                status: BookingStatus.CONFIRMED,
                appointmentTime: Between(startOfDay, endOfDay),
            },
            order: { appointmentTime: 'ASC' },
        });

        const allSlots: Date[] = [];
        const currentSlot = new Date(`${dateStr}T${String(START_HOUR).padStart(2, '0')}:00:00`);
        const endWorkingTime = new Date(`${dateStr}T${String(END_HOUR).padStart(2, '0')}:00:00`);

        while (currentSlot < endWorkingTime) {
            allSlots.push(new Date(currentSlot.getTime()));
            currentSlot.setMinutes(currentSlot.getMinutes() + SLOT_INTERVAL);
        }

        const availableSlots = allSlots.filter((slot) => {
            if (slot <= now) return false;

            const isBusy = confirmedBookings.some((booking) => {
                const bookingStart = new Date(booking.appointmentTime);
                const bookingEnd = new Date(bookingStart.getTime() + booking.snapshotDuration * 60 * 1000);
                return slot >= bookingStart && slot < bookingEnd;
            });
            return !isBusy;
        });

        return availableSlots.map((slot) => {
            const hours = slot.getHours().toString().padStart(2, '0');
            const minutes = slot.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        });
    }

    // Tra cứu thông tin
    async lookupBookings(phone: string, code?: string) {
        // Bước 1: Chuẩn hóa dữ liệu đầu vào đầu cuối
        const cleanPhone = phone.trim().replace(/\s+/g, '');

        // Bước 2: Tạo chuỗi SHA-256 Hash để bắt chính xác Index của Database
        const phoneHash = crypto.createHash('sha256').update(cleanPhone).digest('hex');

        // Bước 3: Build điều kiện truy vấn động tối ưu
        const whereCondition: any = { customerPhoneHash: phoneHash };

        if (code && code.trim() !== '') {
            whereCondition.bookingCode = code.trim();
        }

        // Bước 4: Query Builder giới hạn quét diện hẹp kết hợp nạp mượt quan hệ
        const results = await this.bookingRepo.find({
            where: whereCondition,
            relations: ['barber', 'service', 'combo'],
            order: { bookingDate: 'DESC', slotStartTime: 'DESC' },
            // Chỉ lấy các trường view thực sự cần
            select: {
                id: true,
                bookingCode: true,
                appointmentTime: true,
                bookingDate: true,
                slotStartTime: true,
                slotEndTime: true,
                totalDuration: true,
                snapshotPrice: true,
                status: true,
                customerName: true,
                note: true,
            }
        });

        // Bước 5: Map Entity sang cấu trúc gọn gàng mà Frontend View yêu cầu
        return results.map((b) => ({
            id: b.id,
            bookingCode: b.bookingCode,
            appointmentTime: b.appointmentTime ? b.appointmentTime.toISOString() : null,
            bookingDate: b.bookingDate,
            slotStartTime: b.slotStartTime,
            slotEndTime: b.slotEndTime,
            totalDuration: b.totalDuration,
            snapshotPrice: b.snapshotPrice,
            status: b.status,
            customerName: b.customerName,
            customerPhone: cleanPhone, // Trả lại sđt sạch để view hiển thị trực tiếp
            note: b.note,
            barberName: b.barber ? b.barber.name : 'Chưa chỉ định',
            serviceName: b.combo ? `🎁 ${b.combo.name || b.combo['title']}` : (b.service ? b.service.name : 'Dịch vụ lẻ'),
            type: b.combo ? 'combo' : 'service',
        }));
    }
    
    findAll() {
        return this.bookingRepo.find({ take: 100, order: { id: 'DESC' } });
    }

    async findOne(id: number) {
        const booking = await this.bookingRepo.findOne({ where: { id } });
        if (!booking) throw new NotFoundException(`Lịch hẹn #${id} không tồn tại.`);
        return booking;
    }
}