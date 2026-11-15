import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  username?: string;
}

export class MessageAttachmentDto {
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

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentDto)
  attachments?: MessageAttachmentDto[];
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}

export class ReactMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  emoji: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}
