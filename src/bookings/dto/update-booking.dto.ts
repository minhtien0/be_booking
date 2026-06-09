import { IsString, IsOptional, IsNotEmpty, Matches } from 'class-validator';

export class UpdateBookingDto {
  @IsString({ message: 'Tên khách hàng phải là chuỗi ký tự' })
  @IsOptional()
  customerName?: string;

  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @IsOptional()
  @Matches(/(?:\+84|0[3|5|7|8|9])+([0-9]{8})\b/, {
    message: 'Số điện thoại định dạng không hợp lệ',
  })
  customerPhone?: string;

  @IsString({ message: 'Ngày đặt lịch phải là chuỗi ký tự' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Ngày đặt lịch phải có định dạng YYYY-MM-DD',
  })
  bookingDate?: string;

  @IsString({ message: 'Giờ đặt lịch phải là chuỗi ký tự' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Giờ đặt lịch phải có định dạng HH:MM',
  })
  slotStartTime?: string;

  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  @IsOptional()
  note?: string;

  @IsString({ message: 'Lý do chỉnh sửa phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp lý do chỉnh sửa lịch hẹn này' })
  editReason: string;
}