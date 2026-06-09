import {
    IsInt, IsArray, IsDateString, IsString, IsOptional,
    IsEmail, IsMobilePhone, MaxLength, Matches, ArrayMinSize
} from 'class-validator';
export class ConfirmBookingDto {
    @IsOptional()
    @IsString()
    payment_method?: 'AT_STORE' | 'VNPAY' | 'MOMO';
}