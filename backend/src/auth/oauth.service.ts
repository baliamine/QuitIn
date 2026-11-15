import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export type OAuthProvider = 'google' | 'facebook';

interface OAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  private credentials(provider: OAuthProvider) {
    if (provider === 'google') {
      return {
        clientId: this.config.get<string>('GOOGLE_CLIENT_ID', ''),
        clientSecret: this.config.get<string>('GOOGLE_CLIENT_SECRET', ''),
      };
    }
    return {
      clientId: this.config.get<string>('FACEBOOK_APP_ID', ''),
      clientSecret: this.config.get<string>('FACEBOOK_APP_SECRET', ''),
    };
  }

  isConfigured(provider: OAuthProvider) {
    const { clientId, clientSecret } = this.credentials(provider);
    return Boolean(clientId && clientSecret);
  }

  callbackUrl(provider: OAuthProvider) {
    const base = this.config.get<string>(
      'OAUTH_CALLBACK_BASE',
      `http://localhost:${this.config.get<string>('PORT', '4000')}`,
    );
    return `${base.replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;
  }

  authorizationUrl(provider: OAuthProvider, state: string) {
    if (!this.isConfigured(provider)) {
      throw new ServiceUnavailableException(`${provider} login is not configured`);
    }
    const { clientId } = this.credentials(provider);
    const redirectUri = encodeURIComponent(this.callbackUrl(provider));

    if (provider === 'google') {
      return (
        'https://accounts.google.com/o/oauth2/v2/auth' +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${redirectUri}` +
        '&response_type=code' +
        '&scope=openid%20email%20profile' +
        `&state=${encodeURIComponent(state)}` +
        '&prompt=select_account'
      );
    }

    return (
      'https://www.facebook.com/v19.0/dialog/oauth' +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${redirectUri}` +
      '&response_type=code' +
      '&scope=email,public_profile' +
      `&state=${encodeURIComponent(state)}`
    );
  }

  private async exchangeCode(provider: OAuthProvider, code: string) {
    const { clientId, clientSecret } = this.credentials(provider);
    const redirectUri = this.callbackUrl(provider);

    if (provider === 'google') {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!res.ok) {
        this.logger.error(`Google token exchange failed: ${await res.text()}`);
        throw new BadRequestException('Google authentication failed');
      }
      const data = (await res.json()) as { access_token?: string };
      if (!data.access_token) throw new BadRequestException('Google authentication failed');

      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (!infoRes.ok) throw new BadRequestException('Could not load your Google profile');
      const info = (await infoRes.json()) as {
        sub: string;
        email?: string;
        name?: string;
        picture?: string;
      };
      return {
        providerAccountId: info.sub,
        email: info.email ?? '',
        name: info.name ?? info.email?.split('@')[0] ?? 'QUITIN member',
        avatarUrl: info.picture ?? null,
      };
    }

    const tokenUrl =
      'https://graph.facebook.com/v19.0/oauth/access_token' +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${encodeURIComponent(clientSecret)}` +
      `&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      this.logger.error(`Facebook token exchange failed: ${await tokenRes.text()}`);
      throw new BadRequestException('Facebook authentication failed');
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) throw new BadRequestException('Facebook authentication failed');

    const infoRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(tokenData.access_token)}`,
    );
    if (!infoRes.ok) throw new BadRequestException('Could not load your Facebook profile');
    const info = (await infoRes.json()) as {
      id: string;
      name?: string;
      email?: string;
      picture?: { data?: { url?: string } };
    };
    return {
      providerAccountId: info.id,
      email: info.email ?? '',
      name: info.name ?? 'QUITIN member',
      avatarUrl: info.picture?.data?.url ?? null,
    };
  }

  private async uniqueUsername(email: string, name: string) {
    const base =
      email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 20) ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 20) ||
      'member';

    let candidate = base.length >= 3 ? base : `${base}user`;
    for (let i = 0; i < 20; i += 1) {
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
      candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    }
    return `${base}${randomBytes(3).toString('hex')}`;
  }

  async loginWithCode(provider: OAuthProvider, code: string) {
    if (!this.isConfigured(provider)) {
      throw new ServiceUnavailableException(`${provider} login is not configured`);
    }
    const raw = await this.exchangeCode(provider, code);
    if (!raw.email) {
      throw new BadRequestException(
        'Your provider did not share an email address. Please use email and password instead.',
      );
    }
    const email = raw.email.toLowerCase();
    const profile: OAuthProfile = { ...raw, provider, email };

    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });
    if (linked) return linked.user;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      await this.prisma.oAuthAccount.create({
        data: {
          userId: existingUser.id,
          provider,
          providerAccountId: profile.providerAccountId,
        },
      });
      if (!existingUser.emailVerifiedAt) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
      return existingUser;
    }

    const username = await this.uniqueUsername(email, profile.name);
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            headline: profile.name,
            avatarUrl: profile.avatarUrl ?? null,
          },
        },
        oauthAccounts: {
          create: { provider, providerAccountId: profile.providerAccountId },
        },
      },
    });

    await this.notifications.create(user.id, {
      type: 'WELCOME',
      message: 'Welcome to QUITIN! Complete your profile to get started.',
    });

    return user;
  }
}
