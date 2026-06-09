import { Entity, Column, PrimaryGeneratedColumn, Index, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { Service } from '../../services/entities/service.entity';
import { Booking } from '../../bookings/entities/booking.entity';

@Entity('combos')
export class Combo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    name: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    tagline: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    badge: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description: string | null;

    @Column('text', { array: true, default: () => "'{}'" })
    benefits: string[];

    @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
    slug: string;

    @Column({ type: 'int', nullable: false })
    comboPrice: number;

    @Column({ name: 'booking_note', type: 'text' })
    bookingNote: string;

    @Column({ name: 'cover_image' })
    coverImage: string;

    @ManyToMany(() => Service)
    @JoinTable({
        name: 'combo_detail',
        joinColumn: { name: 'combo_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'service_id', referencedColumnName: 'id' }
    })
    services: Service[];

    @OneToMany(() => Booking, (booking) => booking.combo)
    bookings: Booking[];

    @Column('text', { array: true, default: () => "'{}'" })
    gallery: string[];

}