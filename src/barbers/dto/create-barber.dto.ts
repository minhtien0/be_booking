import { IsString, IsEnum, IsOptional, IsArray, IsNotEmpty, MaxLength, Min } from 'class-validator';
import { BarberStatus } from '../entities/barber.entity';

export class CreateBarberDto {
    @IsString({ message: 'Tên thợ phải là chuỗi ký tự' })
    @IsNotEmpty({ message: 'Tên thợ không được để trống' })
    @MaxLength(100, { message: 'Tên thợ không được quá 100 ký tự' })
    name: string;

    @IsString({ message: 'Trình độ thợ phải là chuỗi ký tự' })
    @IsNotEmpty({ message: 'Trình độ thợ không được để trống' })
    @MaxLength(100, { message: 'Trình độ thợ không được quá 100 ký tự' })
    role: string;

    @IsString({ message: 'Hình thợ phải là chuỗi ký tự' })
    @IsNotEmpty({ message: 'Hình thợ không được để trống' })
    @MaxLength(255, { message: 'Hình thợ không được quá 255 ký tự' })
    avatar: string;

    @IsEnum(BarberStatus, { message: 'Trạng thái không hợp lệ (chỉ chấp nhận active, inactive, off)' })
    @IsNotEmpty({ message: 'Trạng thái không được để trống' })
    status: BarberStatus; 
}