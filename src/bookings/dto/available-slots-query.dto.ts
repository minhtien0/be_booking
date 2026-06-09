// ─────────────────────────────────────────────────────────────────────────────
// available-slots-query.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { IsDateString, IsArray, IsInt, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class AvailableSlotsQueryDto {
  // GET /barbers/:barberId/available-slots?date=2026-05-26&service_ids[]=1&service_ids[]=2
  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  service_ids: number[];
}








