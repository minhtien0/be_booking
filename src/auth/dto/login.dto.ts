import { IsEmail, IsString, Length, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  /**
   * Bỏ @Matches regex cũ — chỉ cho phép gmail.com, không phù hợp môi trường business.
   * Dùng @IsEmail() chuẩn RFC 5322 cho phép mọi tên miền.
   */
  @IsEmail({}, { message: 'Email không đúng định dạng.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  email: string;

  /**
   * Login DTO không validate strength password (chỉ check độ dài).
   * Strength validation thuộc về RegisterDto.
   * bcrypt max input là 72 bytes — không nên cho nhập quá dài.
   */
  @IsString({ message: 'Mật khẩu không hợp lệ.' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  @Length(8, 72, { message: 'Mật khẩu từ 8 đến 72 ký tự.' })
  password: string;
}