import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { OAuthService, OAuthProvider } from './oauth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  ConfirmEmailChangeDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/password.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

const OAUTH_STATE_COOKIE = 'quitin_oauth_state';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, emailVerificationSent } = await this.auth.register(dto);
    const token = this.auth.signToken({
      id: user.id,
      email: user.email,
      username: user.username,
    });
    res.cookie(this.auth.cookieName, token, this.auth.getCookieOptions(false));
    return { user, emailVerificationSent };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateUser(dto);
    const token = this.auth.signToken(user);
    res.cookie(this.auth.cookieName, token, this.auth.getCookieOptions(dto.rememberMe));
    return { user: await this.auth.getMe(user.id) };
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(this.auth.cookieName, { path: '/' });
    return { success: true };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('me')
  async me(@CurrentUser('id') userId: string) {
    // A guest gets { user: null }; a valid session still resolves the user.
    if (!userId) return { user: null };
    return { user: await this.auth.getMe(userId) };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password, dto.confirmPassword);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('resend-verification')
  resendVerification(@CurrentUser('id') userId: string) {
    return this.auth.resendVerification(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    return this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-email')
  changeEmail(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangeEmailDto,
  ) {
    return this.auth.changeEmail(userId, dto.email, dto.currentPassword);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-email/confirm')
  async confirmEmailChange(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmEmailChangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.confirmEmailChange(dto.token);
    if (userId) {
      const user = await this.auth.getMe(userId);
      const token = this.auth.signToken({
        id: user.id,
        email: user.email,
        username: user.username,
      });
      res.cookie(this.auth.cookieName, token, this.auth.getCookieOptions(false));
    }
    return result;
  }

  private assertProvider(provider: string): OAuthProvider {
    if (provider !== 'google' && provider !== 'facebook') {
      throw new BadRequestException('Unsupported login provider');
    }
    return provider;
  }

  @Public()
  @Get('oauth/:provider')
  startOAuth(
    @Param('provider') providerParam: string,
    @Res() res: Response,
  ) {
    const provider = this.assertProvider(providerParam);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (!this.oauth.isConfigured(provider)) {
      res.redirect(`${frontendUrl}/login?oauth=unconfigured&provider=${provider}`);
      return;
    }

    const state = randomBytes(24).toString('hex');
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(this.oauth.authorizationUrl(provider, state));
  }

  @Public()
  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') providerParam: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = this.assertProvider(providerParam);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    if (!code) {
      res.redirect(`${frontendUrl}/login?oauth=error&message=cancelled`);
      return;
    }
    if (!expectedState || state !== expectedState) {
      res.redirect(`${frontendUrl}/login?oauth=error&message=state`);
      return;
    }

    try {
      const user = await this.oauth.loginWithCode(provider, code);
      const token = this.auth.signToken({
        id: user.id,
        email: user.email,
        username: user.username,
      });
      res.cookie(this.auth.cookieName, token, this.auth.getCookieOptions(true));
      res.redirect(`${frontendUrl}/feed?welcome=1`);
    } catch (err) {
      const message = encodeURIComponent((err as Error).message || 'oauth');
      res.redirect(`${frontendUrl}/login?oauth=error&message=${message}`);
    }
  }
}
