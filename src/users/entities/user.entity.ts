import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  name: string | null;
  
  @Column({ type: 'varchar', length: 150, unique: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'varchar', length: 10, unique: true,nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  role: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  token: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  refresh_token: string | null;
}