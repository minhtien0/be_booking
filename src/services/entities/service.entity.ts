import { Entity, Column, PrimaryGeneratedColumn, Index, OneToMany } from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';

@Entity('services') 
export class Service {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false }) 
  name: string;

  @Column({ type: 'int', nullable: true }) 
  duration: number | null;

  @Column({ name: 'original_price', type: 'int' })
  originalPrice: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column('text', { array: true, default: () => "'{}'" })
  included: string[];

  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  slug: string; 

  @Column({ type: 'int', default: 1 }) 
  status: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string | null;

  @OneToMany(() => Booking, (booking) => booking.service)
  bookings: Booking[];
}