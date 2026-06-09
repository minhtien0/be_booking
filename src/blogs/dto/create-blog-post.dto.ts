import {
  IsString, IsOptional, IsUrl, IsArray, IsEnum,
  IsInt, ValidateNested, ArrayMinSize, MaxLength,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostStatus } from '../entities/blog.entity';
import { ContentBlockDto } from './content-block.dto';

export class CreateBlogPostDto {
  @IsString()
  @MaxLength(255)
  slug: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsUrl()
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  readTime?: string;

  @IsInt()
  categoryId: number;

  @IsOptional()
  @IsInt()
  authorId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ContentBlockDto)
  content: ContentBlockDto[];

  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}