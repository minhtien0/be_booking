import { IsString, IsNumber, IsOptional, IsArray, IsNotEmpty, MaxLength, Min } from 'class-validator';

export class CreateServiceDto {
  @IsString({ message: 'Tên dịch vụ phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên dịch vụ không được để trống' })
  @MaxLength(100, { message: 'Tên dịch vụ không được quá 100 ký tự' })
  name: string;

  @IsNumber({}, { message: 'Thời lượng phải là số' })
  @IsOptional()
  @Min(0, { message: 'Thời lượng không được là số âm' })
  duration?: number;

  @IsNumber({}, { message: 'Giá gốc phải là số' })
  @IsNotEmpty({ message: 'Giá gốc không được để trống' })
  @Min(0, { message: 'Giá không được nhỏ hơn 0đ' })
  originalPrice: number;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Mô tả không được quá 255 ký tự' })
  description?: string;

  @IsArray({ message: 'Danh sách đi kèm phải là một mảng' })
  @IsString({ each: true, message: 'Các phần tử trong mảng đi kèm phải là chuỗi' })
  @IsOptional()
  included?: string[];

  @IsString()
  @IsNotEmpty({ message: 'Slug không được để trống' })
  @MaxLength(255, { message: 'Slug không được quá 255 ký tự' })
  slug: string;

  @IsNumber()
  @IsOptional()
  status?: number;

  @IsString()
  @IsOptional()
  type?: string;
}