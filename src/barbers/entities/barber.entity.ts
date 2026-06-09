// src/admin/entities/barber.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';

// Định nghĩa Enum cho Status của Barber
export enum BarberStatus {
  ACTIVE = 'active',    
  INACTIVE = 'inactive',
  OFF = 'off',         
}

@Entity('barbers')
export class Barber {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  role: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar: string;

  @Column({
    type: 'enum',
    enum: BarberStatus,
    default: BarberStatus.ACTIVE,
  })
  status: BarberStatus;

  @OneToMany(() => Booking, (booking) => booking.barber)
  bookings: Booking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}