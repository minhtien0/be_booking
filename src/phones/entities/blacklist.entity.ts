import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

export enum BlacklistReason {
  NO_SHOW        = 'NO_SHOW',          // Không đến và không huỷ
  SPAM           = 'SPAM',             // Rate limit vượt ngưỡng
  MANUAL         = 'MANUAL',           // Admin tự thêm
}

@Entity('phone_blacklists')
export class PhoneBlacklist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'phone_hash', type: 'varchar', length: 64, unique: true })
  @Index()
  phoneHash: string;                   // SHA-256 hash — để lookup không cần decrypt

  @Column({ name: 'phone_masked', type: 'varchar', length: 20 })
  phoneMasked: string;                 // "090****123" — để admin xem

  @Column({ name: 'no_show_count', type: 'int', default: 0 })
  noShowCount: number;

  @Column({ type: 'enum', enum: BlacklistReason })
  reason: BlacklistReason;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true })
  blockedUntil: Date | null;           // null = vĩnh viễn

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;                 // admin ghi chú

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}