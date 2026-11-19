import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApplicationStatus, JobType } from '@prisma/client';
import { JobsService } from './jobs.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApplyToJobDto,
  CreateJobDto,
  InterviewInvitationDto,
  JobOfferDto,
  UpdateApplicationDto,
  UpdateJobDto,
} from './dto/job.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('q') q?: string,
    @Query('location') location?: string,
    @Query('type') type?: JobType,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.jobs.list(userId, { q, location, type, take, skip });
  }

  @Get('me')
  listMine(@CurrentUser('id') userId: string) {
    return this.jobs.listMine(userId);
  }

  @Get('me/applications')
  listMyApplications(@CurrentUser('id') userId: string) {
    return this.jobs.listMyApplications(userId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateJobDto) {
    return this.jobs.create(userId, dto);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.jobs.get(userId, id);
  }

  @Patch(':id')
  update(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.jobs.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.jobs.remove(userId, id);
  }

  @Post(':id/apply')
  apply(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ApplyToJobDto,
  ) {
    return this.jobs.apply(userId, id, dto);
  }

  @Delete(':id/apply')
  withdraw(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.jobs.withdraw(userId, id);
  }

  @Get(':id/applications')
  applicants(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('status') status?: ApplicationStatus,
  ) {
    return this.jobs.listApplicants(userId, id, status);
  }

  @Patch(':id/applications/:applicationId')
  setStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.jobs.setApplicationStatus(userId, id, applicationId, dto);
  }

  @Post(':id/applications/:applicationId/interview')
  inviteToInterview(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: InterviewInvitationDto,
  ) {
    return this.jobs.inviteToInterview(userId, id, applicationId, dto);
  }

  @Post(':id/applications/:applicationId/offer')
  sendOffer(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: JobOfferDto,
  ) {
    return this.jobs.sendOffer(userId, id, applicationId, dto);
  }
}
