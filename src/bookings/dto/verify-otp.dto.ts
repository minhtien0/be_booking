import { IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Length(6, 6, { message: 'OTP phải đúng 6 chữ số' })
  otp: string;
}