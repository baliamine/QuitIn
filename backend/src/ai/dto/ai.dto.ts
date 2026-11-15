import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AiAttachmentDto {
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
}

export class SendAiMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AiAttachmentDto)
  attachments?: AiAttachmentDto[];
}

export class CreateAiConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class RenameAiConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;
}
