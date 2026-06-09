export class Bookinglog {}
// src/admin/entities/booking-log.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';

@Entity('booking_logs')
export class BookingLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  actionText: string; // Nội dung: "Đặt lịch qua website", "Xác nhận lịch hẹn"...

  @Column({ type: 'varchar', length: 10, default: '#b89a6a' })
  color: string; // Lưu màu sắc của chấm tròn hiển thị log trên giao diện

  @ManyToOne(() => Booking, (booking) => booking.logs, { onDelete: 'CASCADE' })
  booking: Booking;

  @CreateDateColumn()
  createdAt: Date;
}