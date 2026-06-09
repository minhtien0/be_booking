import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Barber } from '../../barbers/entities/barber.entity';
import { Service } from '../../services/entities/service.entity';
import { Combo } from '../../combos/entities/combo.entity';
import { BookingLog } from '../../bookinglogs/entities/bookinglog.entity';

export enum BookingStatus {
  PENDING = 'pending',
  OTP_VERIFIED = 'otp_verified',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'inprogress',
  DONE = 'done',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  VNPAY = 'vnpay',
  MOMO = 'momo',
}

export const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.OTP_VERIFIED, BookingStatus.CANCELLED, BookingStatus.EXPIRED],
  [BookingStatus.OTP_VERIFIED]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.EXPIRED],
  [BookingStatus.CONFIRMED]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.DONE, BookingStatus.CANCELLED],
  [BookingStatus.DONE]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.EXPIRED]: [],
};

@Entity('bookings')
@Index(['barber', 'bookingDate', 'status'])
@Index(['customerPhoneHash'])
@Index(['status', 'bookingDate'])
export class Booking {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  bookingCode: string | null;        // BK001, BK002... (sinh sau khi CONFIRMED)

  // ── Thời gian ───────────────────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true })
  appointmentTime: Date | null;

  @Column({ type: 'date', nullable: true })
  bookingDate: string;               // "2026-05-26" — ngày đặt lịch

  @Column({ type: 'varchar', length: 5, nullable: true })
  slotStartTime: string;             // "09:00"

  @Column({ type: 'varchar', length: 5, nullable: true })
  slotEndTime: string;               // "09:45" — tính từ slotStartTime + totalDuration

  @Column({ type: 'int', default: 30 })
  totalDuration: number;             // phút — tổng từ các service được chọn

  // ── Snapshot giá tại thời điểm đặt ─────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  snapshotPrice: number;

  @Column({ type: 'int', default: 30 })
  snapshotDuration: number;

  // ── Trạng thái ──────────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  // ── Thanh toán ──────────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  // ── Khách hàng ──────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 100 })
  customerName: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  customerPhone: string | null;

  /**
   * Số điện thoại được mã hoá AES-256-CBC.
   * Format: "<iv_hex>:<encrypted_hex>"
   * Chỉ giải mã khi cần hiển thị hoặc gửi thông báo.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  customerPhoneEncrypted: string;

  /** SHA-256 của số điện thoại gốc — dùng để query blacklist / rate-limit / no-show */
  @Column({ type: 'varchar', length: 64, nullable: true })
  customerPhoneHash: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customerEmail: string | null;

  // ── CAPTCHA & IP ─────────────────────────────────────────────────────────
  @Column({ type: 'float', nullable: true })
  captchaScore: number | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  // ── Hold & OTP ──────────────────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true })
  holdExpiresAt: Date | null;        // null sau khi CONFIRMED

  @Column({ type: 'timestamp', nullable: true })
  otpVerifiedAt: Date | null;

  // ── Mốc thời gian trạng thái ────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  editedAt: Date | null; // Mốc thời gian chỉnh sửa lịch

  @Column({ type: 'text', nullable: true })
  editReason: string | null;

  // ── No-show tracking ────────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  isNoShow: boolean;

  // ── Relations ───────────────────────────────────────────────────────────
  @ManyToOne(() => Barber, (b) => b.bookings, { nullable: true })
  @JoinColumn({ name: 'barberId' })
  barber: Barber;

  /**
   * Lưu FK riêng để SlotService có thể query bằng barberId số nguyên
   * mà không cần join, tránh N+1 trong getOccupiedRanges.
   */
  @Column({ type: 'int', nullable: true })
  barberId: number;

  @ManyToOne(() => Service, (s) => s.bookings, { eager: true, nullable: true })
  service: Service | null;

  @ManyToOne(() => Combo, (c) => c.bookings, { eager: true, nullable: true })
  combo: Combo | null;

  @OneToMany(() => BookingLog, (log) => log.booking, { cascade: true })
  logs: BookingLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
