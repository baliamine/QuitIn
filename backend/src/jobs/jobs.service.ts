import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, JobStatus, JobType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApplyToJobDto,
  CreateJobDto,
  InterviewInvitationDto,
  JobOfferDto,
  UpdateApplicationDto,
  UpdateJobDto,
} from './dto/job.dto';

const COMPANY_SELECT = {
  id: true,
  username: true,
  profile: {
    select: {
      avatarUrl: true,
      headline: true,
      company: true,
      location: true,
    },
  },
} satisfies Prisma.UserSelect;

const APPLICANT_SELECT = {
  id: true,
  username: true,
  profile: {
    select: {
      avatarUrl: true,
      headline: true,
      location: true,
    },
  },
} satisfies Prisma.UserSelect;

const jobSelect = (currentUserId: string) =>
  ({
    id: true,
    title: true,
    description: true,
    location: true,
    type: true,
    salaryMin: true,
    salaryMax: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    company: { select: COMPANY_SELECT },
    _count: { select: { applications: true } },
    applications: {
      where: { applicantId: currentUserId },
      select: { id: true, status: true },
      take: 1,
    },
  }) satisfies Prisma.JobSelect;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== role) {
      throw new ForbiddenException(
        role === UserRole.COMPANY
          ? 'Only company accounts can manage job offers'
          : 'Only job seeker accounts can apply to jobs',
      );
    }
  }

  private async assertOwner(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { companyId: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.companyId !== userId) {
      throw new ForbiddenException('You do not own this job offer');
    }
  }

  private async isBlocked(userId: string, otherId: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherId },
          { blockerId: otherId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    return Boolean(block);
  }

  private async blockedIds(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
  }

  private validateSalary(salaryMin?: number | null, salaryMax?: number | null) {
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
      throw new BadRequestException('Maximum salary cannot be lower than minimum salary');
    }
  }

  async list(
    userId: string,
    params: { q?: string; location?: string; type?: JobType; take?: number | string; skip?: number | string },
  ) {
    const q = params.q?.trim();
    const location = params.location?.trim();
    const parsedTake = Number(params.take);
    const parsedSkip = Number(params.skip);
    const take = Number.isFinite(parsedTake) && parsedTake > 0 ? Math.floor(parsedTake) : 20;
    const skip = Number.isFinite(parsedSkip) && parsedSkip > 0 ? Math.floor(parsedSkip) : 0;
    const blocked = await this.blockedIds(userId);

    const where: Prisma.JobWhereInput = {
      status: JobStatus.OPEN,
      ...(blocked.length ? { companyId: { notIn: blocked } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { location: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(location ? { location: { contains: location, mode: 'insensitive' } } : {}),
      ...(params.type ? { type: params.type } : {}),
    };

    const jobs = await this.prisma.job.findMany({
      where,
      select: jobSelect(userId),
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 50),
      skip,
    });
    return { jobs };
  }

  async get(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: jobSelect(userId),
    });
    if (!job) throw new NotFoundException('Job not found');
    if (await this.isBlocked(userId, job.company.id)) {
      throw new ForbiddenException('You cannot view this job offer');
    }
    return job;
  }

  async listMine(userId: string) {
    await this.assertRole(userId, UserRole.COMPANY);
    const jobs = await this.prisma.job.findMany({
      where: { companyId: userId },
      select: jobSelect(userId),
      orderBy: { createdAt: 'desc' },
    });
    return { jobs };
  }

  async listMyApplications(userId: string) {
    await this.assertRole(userId, UserRole.JOBSEEKER);
    const applications = await this.prisma.jobApplication.findMany({
      where: { applicantId: userId },
      select: {
        id: true,
        status: true,
        coverLetter: true,
        createdAt: true,
        job: { select: jobSelect(userId) },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { applications };
  }

  async create(userId: string, dto: CreateJobDto) {
    await this.assertRole(userId, UserRole.COMPANY);
    this.validateSalary(dto.salaryMin, dto.salaryMax);
    const job = await this.prisma.job.create({
      data: {
        companyId: userId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        location: dto.location.trim(),
        type: dto.type,
        salaryMin: dto.salaryMin,
        salaryMax: dto.salaryMax,
      },
    });
    return this.get(userId, job.id);
  }

  async update(userId: string, jobId: string, dto: UpdateJobDto) {
    await this.assertOwner(userId, jobId);
    const salaryMin = dto.salaryMin === undefined ? undefined : dto.salaryMin;
    const salaryMax = dto.salaryMax === undefined ? undefined : dto.salaryMax;
    this.validateSalary(salaryMin, salaryMax);

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        location: dto.location?.trim(),
        type: dto.type,
        salaryMin,
        salaryMax,
        status: dto.status,
      },
    });
    return this.get(userId, jobId);
  }

  async remove(userId: string, jobId: string) {
    await this.assertOwner(userId, jobId);
    await this.prisma.job.delete({ where: { id: jobId } });
    return { success: true };
  }

  private async applicationForOwner(userId: string, jobId: string, applicationId: string) {
    await this.assertOwner(userId, jobId);
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    const application = await this.prisma.jobApplication.findFirst({
      where: { id: applicationId, jobId },
      select: {
        id: true,
        applicantId: true,
        status: true,
        applicant: { select: { username: true } },
      },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (await this.isBlocked(userId, application.applicantId)) {
      throw new ForbiddenException('You can no longer manage this application');
    }
    return { job, application };
  }

  private assertStatusTransition(from: ApplicationStatus, to: ApplicationStatus) {
    const allowed: Record<ApplicationStatus, ApplicationStatus[]> = {
      PENDING: [ApplicationStatus.REVIEWED, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED],
      REVIEWED: [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED],
      ACCEPTED: [],
      REJECTED: [],
      WITHDRAWN: [],
    };
    if (!allowed[from].includes(to)) {
      throw new BadRequestException(`Cannot change an application from ${from} to ${to}`);
    }
  }

  async listApplicants(userId: string, jobId: string, status?: ApplicationStatus) {
    await this.assertOwner(userId, jobId);
    const blocked = await this.blockedIds(userId);
    const applications = await this.prisma.jobApplication.findMany({
      where: {
        jobId,
        ...(status ? { status } : {}),
        ...(blocked.length ? { applicantId: { notIn: blocked } } : {}),
      },
      select: {
        id: true,
        coverLetter: true,
        status: true,
        createdAt: true,
        applicant: { select: APPLICANT_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { applications };
  }

  async apply(userId: string, jobId: string, dto: ApplyToJobDto) {
    await this.assertRole(userId, UserRole.JOBSEEKER);
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { companyId: true, status: true, title: true },
    });
    if (!job || job.status !== JobStatus.OPEN) {
      throw new NotFoundException('This job offer is not open');
    }
    if (job.companyId === userId) {
      throw new BadRequestException('You cannot apply to your own job offer');
    }
    if (await this.isBlocked(userId, job.companyId)) {
      throw new ForbiddenException('You cannot apply to this job offer');
    }

    const coverLetter = dto.coverLetter?.trim() || null;
    const existing = await this.prisma.jobApplication.findUnique({
      where: { jobId_applicantId: { jobId, applicantId: userId } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== ApplicationStatus.WITHDRAWN) {
      throw new BadRequestException('You already applied to this job offer');
    }

    const application = existing
      ? await this.prisma.jobApplication.update({
          where: { id: existing.id },
          data: { status: ApplicationStatus.PENDING, coverLetter, createdAt: new Date() },
        })
      : await this.prisma.jobApplication.create({
          data: { jobId, applicantId: userId, coverLetter },
        });

    await this.notifications.create(job.companyId, {
      type: 'JOB_APPLICATION',
      actorId: userId,
      entityId: jobId,
      message: `applied to ${job.title}`,
    });
    return application;
  }

  async withdraw(userId: string, jobId: string) {
    const application = await this.prisma.jobApplication.findFirst({
      where: { jobId, applicantId: userId },
      select: { id: true, status: true, job: { select: { title: true, companyId: true } } },
    });
    if (!application || application.status === ApplicationStatus.WITHDRAWN) {
      return { success: true };
    }
    await this.prisma.jobApplication.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.WITHDRAWN },
    });
    await this.notifications.create(application.job.companyId, {
      type: 'JOB_APPLICATION_UPDATE',
      actorId: userId,
      entityId: jobId,
      message: `withdrew their application for ${application.job.title}`,
    });
    return { success: true };
  }

  async setApplicationStatus(
    userId: string,
    jobId: string,
    applicationId: string,
    dto: UpdateApplicationDto,
  ) {
    const { job, application } = await this.applicationForOwner(userId, jobId, applicationId);
    this.assertStatusTransition(application.status, dto.status);

    const updated = await this.prisma.jobApplication.update({
      where: { id: applicationId },
      data: { status: dto.status },
    });
    const type =
      dto.status === ApplicationStatus.ACCEPTED
        ? 'JOB_APPLICATION_ACCEPTED'
        : dto.status === ApplicationStatus.REJECTED
          ? 'JOB_APPLICATION_REJECTED'
          : 'JOB_APPLICATION_UPDATE';
    const verb = dto.status.toLowerCase();
    await this.notifications.create(application.applicantId, {
      type,
      actorId: userId,
      entityId: jobId,
      message: `${verb} your application for ${job.title}`,
    });
    return updated;
  }

  async inviteToInterview(
    userId: string,
    jobId: string,
    applicationId: string,
    dto: InterviewInvitationDto,
  ) {
    const { job, application } = await this.applicationForOwner(userId, jobId, applicationId);
    if (
      application.status === ApplicationStatus.REJECTED ||
      application.status === ApplicationStatus.WITHDRAWN
    ) {
      throw new BadRequestException('Cannot invite a rejected or withdrawn applicant');
    }
    const when = dto.scheduledAt
      ? new Date(dto.scheduledAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : null;
    await this.notifications.create(application.applicantId, {
      type: 'INTERVIEW_INVITATION',
      actorId: userId,
      entityId: jobId,
      message: `invited you to an interview for ${job.title}${when ? ` on ${when}` : ''}: ${dto.message}`,
    });
    return { success: true };
  }

  async sendOffer(userId: string, jobId: string, applicationId: string, dto: JobOfferDto) {
    const { job, application } = await this.applicationForOwner(userId, jobId, applicationId);
    if (
      application.status === ApplicationStatus.REJECTED ||
      application.status === ApplicationStatus.WITHDRAWN
    ) {
      throw new BadRequestException('Cannot send an offer to a rejected or withdrawn applicant');
    }
    await this.notifications.create(application.applicantId, {
      type: 'JOB_OFFER',
      actorId: userId,
      entityId: jobId,
      message: `sent you a job offer for ${job.title}: ${dto.message}`,
    });
    return { success: true };
  }
}
