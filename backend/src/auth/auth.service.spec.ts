import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;
  let config: any;
  let notifications: any;
  let mail: any;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token'), verifyAsync: jest.fn() };
    config = { get: jest.fn((key: string, fallback?: unknown) => fallback) };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    mail = {
      isConfigured: false,
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    };
    service = new AuthService(prisma, jwt, config, notifications, mail);
  });

  it('rejects registration when passwords do not match', async () => {
    await expect(
      service.register({
        name: 'Ada',
        email: 'a@b.com',
        username: 'ada',
        password: 'password123',
        confirmPassword: 'different',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate emails', async () => {
    prisma.user.findFirst.mockResolvedValue({ email: 'a@b.com', username: 'taken' });
    await expect(
      service.register({
        name: 'Ada',
        email: 'a@b.com',
        username: 'ada',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hashes the password and never returns the hash', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'ada' });

    await service.register({
      name: 'Ada',
      email: 'A@B.com',
      username: 'Ada',
      password: 'password123',
      confirmPassword: 'password123',
    });

    const createArgs = prisma.user.create.mock.calls[0][0];
    expect(createArgs.data.email).toBe('a@b.com');
    expect(createArgs.data.username).toBe('ada');
    expect(createArgs.data.passwordHash).toBeDefined();
    expect(createArgs.data.passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', createArgs.data.passwordHash)).toBe(true);
  });

  it('rejects login with a wrong password', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      username: 'ada',
      passwordHash: hash,
    });

    await expect(
      service.validateUser({ email: 'a@b.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts login with the correct password', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      username: 'ada',
      passwordHash: hash,
    });

    const user = await service.validateUser({ email: 'a@b.com', password: 'correct-password' });
    expect(user).toEqual({ id: 'u1', email: 'a@b.com', username: 'ada' });
  });
});
