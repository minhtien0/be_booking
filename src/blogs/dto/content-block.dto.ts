import {
  IsString, IsIn, IsOptional, IsInt, IsArray,
  IsUrl, ValidateIf, Min, Max,
} from 'class-validator';

export type ContentBlockType =
  | 'paragraph' | 'heading' | 'image'
  | 'list' | 'quote' | 'tip' | 'divider';

export class ContentBlockDto {
  @IsIn(['paragraph', 'heading', 'image', 'list', 'quote', 'tip', 'divider'])
  type: ContentBlockType;

  // paragraph | heading | quote | tip
  @ValidateIf((o) => ['paragraph', 'heading', 'quote', 'tip'].includes(o.type))
  @IsString()
  text?: string;

  // heading
  @ValidateIf((o) => o.type === 'heading')
  @IsInt()
  @Min(2)
  @Max(4)
  level?: 2 | 3 | 4;

  // image
  @ValidateIf((o) => o.type === 'image')
  @IsUrl()
  src?: string;

  @ValidateIf((o) => o.type === 'image')
  @IsString()
  alt?: string;

  @ValidateIf((o) => o.type === 'image')
  @IsOptional()
  @IsString()
  caption?: string;

  // list
  @ValidateIf((o) => o.type === 'list')
  @IsIn(['bullet', 'ordered'])
  style?: 'bullet' | 'ordered';

  @ValidateIf((o) => o.type === 'list')
  @IsArray()
  @IsString({ each: true })
  items?: string[];

  // quote
  @ValidateIf((o) => o.type === 'quote')
  @IsOptional()
  @IsString()
  author?: string;
}