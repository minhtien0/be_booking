import { IsString, MaxLength } from 'class-validator';

/**
 * PATCH /admin/bookings/:id/note
 * Lưu nội dung textarea ghi chú từ detail panel.
 */
export class UpdateBookingNoteDto {
  @IsString()
  @MaxLength(2000)
  note: string;
}