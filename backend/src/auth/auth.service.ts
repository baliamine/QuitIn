import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailTokenType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from './mail.service';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  emailVerifiedAt: true,
  lastActiveAt: true,
  createdAt: true,
  profile: {
    select: {
      avatarUrl: true,
      headline: true,
      bio: true,
      location: true,
      website: true,
      company: true,
      visibility: true,
      messagingPermission: true,
    },
  },
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createEmailToken(userId: string, type: EmailTokenType, ttlMs: number) {
    const raw = randomBytes(32).toString('hex');
    await this.prisma.emailToken.deleteMany({
      where: { userId, type, usedAt: null },
    });
    await this.prisma.emailToken.create({
      data: {
        userId,
        type,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return raw;
  }

  private async consumeEmailToken(raw: string, type: EmailTokenType) {
    const token = await this.prisma.emailToken.findFirst({
      where: { tokenHash: this.hashToken(raw) },
      include: { user: { select: { id: true, email: true, username: true } } },
    });
    if (!token || token.type !== type || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('This link is invalid or has expired');
    }
    await this.prisma.emailToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
    return token;
  }

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const email = dto.email.toLowerCase().trim();
    const username = dto.username.toLowerCase().trim();

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      if (existing.email === email) {
        throw new ConflictException('An account with this email already exists');
      }
      throw new ConflictException('This username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Without a mail provider configured, auto-verify so local accounts are not
    // locked out of features that require a confirmed address.
    const autoVerify = !this.mail.isConfigured;

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        emailVerifiedAt: autoVerify ? new Date() : null,
        profile: {
          create: {
            headline: dto.name,
          },
        },
      },
      select: PUBLIC_USER_SELECT,
    });

    await this.notifications.create(user.id, {
      type: NotificationType.WELCOME,
      message: 'Welcome to QUITIN! Complete your profile to get started.',
    });

    let emailVerificationSent = false;
    if (!autoVerify) {
      const token = await this.createEmailToken(
        user.id,
        EmailTokenType.VERIFY_EMAIL,
        24 * 60 * 60 * 1000,
      );
      emailVerificationSent = await this.mail.sendVerificationEmail(email, username, token);
    }

    return { user, emailVerificationSent };
  }

  async validateUser(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true, passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { id: user.id, email: user.email, username: user.username };
  }

  async getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
  }

  async forgotPassword(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true },
    });

    // Always respond the same way so the endpoint cannot be used to enumerate accounts.
    if (!user) {
      return { success: true, message: 'If that email exists, a reset link has been sent.' };
    }

    const token = await this.createEmailToken(
      user.id,
      EmailTokenType.RESET_PASSWORD,
      60 * 60 * 1000,
    );
    const sent = await this.mail.sendPasswordResetEmail(user.email, user.username, token);

    return {
      success: true,
      message: 'If that email exists, a reset link has been sent.',
      // Only exposed in development when no mail provider is configured, so the
      // flow can be tested end-to-end without external credentials.
      ...(!sent && this.config.get<string>('NODE_ENV') !== 'production'
        ? { devResetToken: token }
        : {}),
    };
  }

  async resetPassword(token: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    const record = await this.consumeEmailToken(token, EmailTokenType.RESET_PASSWORD);
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.emailToken.deleteMany({
        where: { userId: record.userId, type: EmailTokenType.RESET_PASSWORD },
      }),
    ]);
    return { success: true };
  }

  async verifyEmail(token: string) {
    const record = await this.consumeEmailToken(token, EmailTokenType.VERIFY_EMAIL);
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return { success: true };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, emailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Your email is already verified');
    }
    if (!this.mail.isConfigured) {
      // Nothing to resend without a provider; verify immediately in development.
      await this.prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
      return { success: true, sent: false, autoVerified: true };
    }
    const token = await this.createEmailToken(
      user.id,
      EmailTokenType.VERIFY_EMAIL,
      24 * 60 * 60 * 1000,
    );
    const sent = await this.mail.sendVerificationEmail(user.email, user.username, token);
    return { success: true, sent };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Your current password is incorrect');
    if (currentPassword === newPassword) {
      throw new BadRequestException('Choose a password different from your current one');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    return { success: true };
  }

  signToken(payload: { id: string; email: string; username: string }) {
    return this.jwt.sign({ sub: payload.id, email: payload.email, username: payload.username });
  }

  getCookieOptions(rememberMe = false) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
    };
  }

  get cookieName() {
    return this.config.get<string>('COOKIE_NAME', 'quitin_token');
  }

  // Used by the WebSocket gateway to authenticate handshake cookies.
  async verifyToken(token: string) {
    try {
      return await this.jwt.verifyAsync(token);
    } catch {
      return null;
    }
  }
}
