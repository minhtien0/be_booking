import { Type } from 'class-transformer';
import {
  IsInt, IsArray, IsDateString, IsString, IsOptional,
  IsEmail, IsMobilePhone, MaxLength, Matches, ArrayMinSize
} from 'class-validator';

export class HoldBookingDto {
  @IsInt()
  barber_id: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  service_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  combo_id?: number;

  @IsDateString()
  booking_date: string;                       

  @Matches(/^\d{2}:\d{2}$/, { message: 'slot_start_time phải có dạng HH:mm' })
  slot_start_time: string;                     

  @IsString()
  @MaxLength(100)
  customer_name: string;

  @IsMobilePhone('vi-VN', {}, { message: 'Số điện thoại không hợp lệ' })
  customer_phone: string;

  @IsOptional()
  @IsEmail()
  customer_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Captcha token từ frontend (Cloudflare Turnstile / reCAPTCHA v3)
  @IsString()
  captcha_token: string;
}