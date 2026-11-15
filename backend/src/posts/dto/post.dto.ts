import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PostVisibility, ReactionType } from '@prisma/client';

export class AttachmentDto {
  @IsString()
  @MaxLength(1000)
  url: string;

  @IsString()
  @MaxLength(300)
  name: string;

  @IsString()
  @MaxLength(200)
  mimeType: string;

  @IsInt()
  @Min(0)
  size: number;

  @IsOptional()
  @IsIn(['IMAGE', 'DOCUMENT'])
  type?: 'IMAGE' | 'DOCUMENT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentId?: string;
}

export class ReactDto {
  @IsEnum(ReactionType)
  type: ReactionType;
}

export class RepostDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  content?: string;
}

export class SharePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class ReportDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}
