import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class LookupBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được để trống.' })
  @Length(9, 15, { message: 'Số điện thoại không hợp lệ.' })
  phone: string;

  @IsString()
  @IsOptional()
  code?: string; // Mã lịch hẹn (Không bắt buộc)
}

export class VerifyLookupOtpDto extends LookupBookingDto {
  @IsNotEmpty()
  @IsString()
  otpCode: string;
}