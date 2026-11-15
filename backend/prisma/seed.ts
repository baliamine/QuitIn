/**
 * Seed script for QUITIN.
 * Creates a handful of demo users, profiles, posts and follows.
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const ada = await prisma.user.upsert({
    where: { email: 'ada@quitin.dev' },
    update: {},
    create: {
      email: 'ada@quitin.dev',
      username: 'ada',
      passwordHash,
      profile: {
        create: {
          headline: 'Full-stack Engineer',
          bio: 'I build developer tools and love TypeScript. Open source enthusiast.',
          location: 'London, UK',
          company: 'Lovelace Labs',
          skills: {
            create: [
              { name: 'TypeScript' },
              { name: 'React' },
              { name: 'Node.js' },
              { name: 'PostgreSQL' },
            ],
          },
          experiences: {
            create: [
              {
                title: 'Senior Software Engineer',
                company: 'Lovelace Labs',
                location: 'London, UK',
                current: true,
                startDate: new Date('2022-03-01'),
                description: 'Leading the developer platform team.',
              },
            ],
          },
          educations: {
            create: [
              {
                school: 'University of Cambridge',
                degree: 'BSc',
                fieldOfStudy: 'Computer Science',
                startDate: new Date('2015-09-01'),
                endDate: new Date('2018-06-30'),
              },
            ],
          },
        },
      },
    },
  });

  const linus = await prisma.user.upsert({
    where: { email: 'linus@quitin.dev' },
    update: {},
    create: {
      email: 'linus@quitin.dev',
      username: 'linus',
      passwordHash,
      profile: {
        create: {
          headline: 'Backend Engineer',
          bio: 'Distributed systems, databases and everything in between.',
          location: 'Helsinki, FI',
          company: 'Kernel Systems',
          skills: { create: [{ name: 'Go' }, { name: 'Rust' }, { name: 'Kubernetes' }] },
        },
      },
    },
  });

  const grace = await prisma.user.upsert({
    where: { email: 'grace@quitin.dev' },
    update: {},
    create: {
      email: 'grace@quitin.dev',
      username: 'grace',
      passwordHash,
      profile: {
        create: {
          headline: 'CS Student & Aspiring Developer',
          bio: 'Final year computer science student. Learning React and Next.js.',
          location: 'Berlin, DE',
          skills: { create: [{ name: 'Python' }, { name: 'React' }, { name: 'SQL' }] },
        },
      },
    },
  });

  const existingPosts = await prisma.post.count();
  if (existingPosts === 0) {
    await prisma.post.createMany({
      data: [
        {
          authorId: ada.id,
          content:
            'Just shipped a new feature that cuts our CI build time by 40%. Caching is underrated.',
        },
        {
          authorId: linus.id,
          content: 'Hot take: most performance problems are actually database problems in disguise.',
        },
        {
          authorId: grace.id,
          content: 'Looking for advice: Next.js App Router vs Pages Router for a new project?',
        },
      ],
    });
  }

  // Follow relationships.
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: grace.id, followingId: ada.id } },
    update: {},
    create: { followerId: grace.id, followingId: ada.id },
  });
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: ada.id, followingId: linus.id } },
    update: {},
    create: { followerId: ada.id, followingId: linus.id },
  });

  console.log('Seed complete. Demo login: ada@quitin.dev / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
