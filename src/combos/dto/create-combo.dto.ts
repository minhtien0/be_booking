import { IsString, IsNumber, IsOptional, IsArray, IsUrl, IsNotEmpty, MaxLength, Min } from 'class-validator';

export class CreateComboDto {
  @IsString({ message: 'Slug phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Slug không được để trống' })
  @MaxLength(255, { message: 'Slug không được quá 255 ký tự' })
  slug: string;

  @IsString({ message: 'Tên combo phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên combo không được để trống' })
  @MaxLength(100, { message: 'Tên combo không được quá 100 ký tự' })
  name: string;

  @IsString({ message: 'Tagline phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tagline không được để trống' })
  tagline: string;

  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mô tả không được để trống' })
  description: string;

  @IsString()
  @IsOptional()
  badge?: string;

  @IsUrl({}, { message: 'Ảnh bìa phải là một URL hợp lệ' })
  @IsNotEmpty({ message: 'Ảnh bìa không được để trống' })
  coverImage: string;

  @IsNumber({}, { message: 'Giá combo phải là số số nguyên' })
  @Min(0, { message: 'Giá combo không được nhỏ hơn 0đ' })
  comboPrice: number;

  @IsArray({ message: 'Danh sách lợi ích phải là một mảng' })
  @IsString({ each: true, message: 'Các phần tử trong mảng lợi ích phải là chuỗi' })
  benefits: string[];

  @IsString()
  @IsOptional()
  bookingNote?: string;

  @IsArray({ message: 'Thư viện ảnh phải là một mảng' })
  @IsUrl({}, { each: true, message: 'Các phần tử trong thư viện ảnh phải là URL hợp lệ' })
  gallery: string[];

  @IsArray({ message: 'Danh sách Service ID phải là một mảng' })
  @IsNumber({}, { each: true, message: 'Mỗi Service ID phải là một số nguyên' })
  serviceId: number[];
}