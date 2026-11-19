import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  UpdateProfileDto,
  ExperienceDto,
  EducationDto,
  DeleteAccountDto,
  ReportUserDto,
} from './dto/profile.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  search(@CurrentUser('id') userId: string, @Query() query: SearchQueryDto) {
    return this.users.search(userId, query.q, query.take, query.skip);
  }

  @Get('suggestions')
  suggestions(@CurrentUser('id') userId: string) {
    return this.users.suggestions(userId);
  }

  @Patch('me/profile')
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  @Post('me/experiences')
  addExperience(@CurrentUser('id') userId: string, @Body() dto: ExperienceDto) {
    return this.users.addExperience(userId, dto);
  }

  @Patch('me/experiences/:id')
  updateExperience(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ExperienceDto,
  ) {
    return this.users.updateExperience(userId, id, dto);
  }

  @Delete('me/experiences/:id')
  deleteExperience(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.users.deleteExperience(userId, id);
  }

  @Post('me/educations')
  addEducation(@CurrentUser('id') userId: string, @Body() dto: EducationDto) {
    return this.users.addEducation(userId, dto);
  }

  @Patch('me/educations/:id')
  updateEducation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: EducationDto,
  ) {
    return this.users.updateEducation(userId, id, dto);
  }

  @Delete('me/educations/:id')
  deleteEducation(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.users.deleteEducation(userId, id);
  }

  @Get('me/follow-requests')
  followRequests(@CurrentUser('id') userId: string) {
    return this.users.followRequests(userId);
  }

  @Post('me/follow-requests/:id/accept')
  acceptFollowRequest(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.users.acceptFollowRequest(userId, id);
  }

  @Post('me/follow-requests/:id/reject')
  rejectFollowRequest(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.users.rejectFollowRequest(userId, id);
  }

  @Get('me/blocked')
  listBlocked(@CurrentUser('id') userId: string) {
    return this.users.listBlocked(userId);
  }

  @Delete('me')
  deleteAccount(@CurrentUser('id') userId: string, @Body() dto: DeleteAccountDto) {
    return this.users.deleteAccount(userId, dto.password);
  }

  @Get(':username/followers')
  followers(@CurrentUser('id') userId: string, @Param('username') username: string) {
    return this.users.followers(username, userId);
  }

  @Get(':username/following')
  following(@CurrentUser('id') userId: string, @Param('username') username: string) {
    return this.users.following(username, userId);
  }

  @Post(':username/follow')
  toggleFollow(@CurrentUser('id') userId: string, @Param('username') username: string) {
    return this.users.toggleFollow(userId, username);
  }

  @Post(':username/block')
  block(@CurrentUser('id') userId: string, @Param('username') username: string) {
    return this.users.block(userId, username);
  }

  @Delete(':username/block')
  unblock(@CurrentUser('id') userId: string, @Param('username') username: string) {
    return this.users.unblock(userId, username);
  }

  @Post(':username/report')
  report(
    @CurrentUser('id') userId: string,
    @Param('username') username: string,
    @Body() dto: ReportUserDto,
  ) {
    return this.users.reportUser(userId, username, dto.reason, dto.details);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':username')
  getByUsername(@CurrentUser('id') userId: string, @Param('username') username: string) {
    return this.users.getByUsername(username, userId);
  }
}
