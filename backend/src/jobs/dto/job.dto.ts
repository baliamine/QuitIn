import {
  ApplicationStatus,
  JobStatus,
  JobType,
} from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  location: string;

  @IsEnum(JobType)
  type: JobType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  salaryMax?: number;
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  salaryMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  salaryMax?: number | null;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

export class ApplyToJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverLetter?: string;
}

export class UpdateApplicationDto {
  @IsEnum([ApplicationStatus.REVIEWED, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED])
  status: ApplicationStatus;
}

export class InterviewInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class JobOfferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
