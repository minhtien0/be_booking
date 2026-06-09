import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class CreateBlogAuthorDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @IsOptional()
  @IsUrl()
  avatar?: string;
}