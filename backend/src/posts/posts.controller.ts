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
import { PostsService } from './posts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateCommentDto,
  CreatePostDto,
  ReactDto,
  ReportDto,
  RepostDto,
  SharePostDto,
  UpdatePostDto,
} from './dto/post.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  feed(
    @CurrentUser('id') userId: string,
    @Query('username') username?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.posts.feed(
      userId,
      username,
      take ? Number(take) : undefined,
      skip ? Number(skip) : undefined,
    );
  }

  @Get('search')
  search(
    @CurrentUser('id') userId: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.posts.searchPosts(
      userId,
      q,
      take ? Number(take) : undefined,
      skip ? Number(skip) : undefined,
    );
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.posts.createFeedPost(userId, dto);
  }

  @Get(':id')
  getOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.posts.getById(id, userId);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.posts.remove(userId, id);
  }

  @Post(':id/react')
  react(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ReactDto) {
    return this.posts.react(userId, id, dto);
  }

  // Kept for backwards compatibility: a plain like is a LIKE reaction.
  @Post(':id/like')
  like(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.posts.react(userId, id, { type: 'LIKE' });
  }

  @Get(':id/reactions')
  reactors(@Param('id') id: string) {
    return this.posts.reactors(id);
  }

  @Post(':id/repost')
  repost(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RepostDto,
  ) {
    return this.posts.repost(userId, id, dto);
  }

  @Post(':id/hide')
  hide(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.posts.hide(userId, id);
  }

  @Delete(':id/hide')
  unhide(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.posts.unhide(userId, id);
  }

  @Post(':id/report')
  report(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReportDto,
  ) {
    return this.posts.report(userId, id, dto);
  }

  @Post(':id/share')
  share(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SharePostDto,
  ) {
    return this.posts.share(userId, id, dto);
  }

  @Get(':id/comments')
  comments(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.posts.listComments(
      id,
      userId,
      take ? Number(take) : undefined,
      skip ? Number(skip) : undefined,
    );
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.posts.addComment(userId, id, dto);
  }

  @Post(':id/comments/:commentId/like')
  likeComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.posts.toggleCommentLike(userId, id, commentId);
  }

  @Delete(':id/comments/:commentId')
  deleteComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.posts.deleteComment(userId, id, commentId);
  }
}
