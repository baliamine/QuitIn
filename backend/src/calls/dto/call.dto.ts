import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StartCallDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  calleeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  calleeUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  conversationId?: string;

  @IsEnum(['AUDIO', 'VIDEO'])
  type: 'AUDIO' | 'VIDEO';
}

export class CreateMeetingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  participantUsernames?: string[];
}
