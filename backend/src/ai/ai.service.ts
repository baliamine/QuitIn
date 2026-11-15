import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { basename, join } from 'path';
import { AttachmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiAttachmentDto } from './dto/ai.dto';

const SYSTEM_PROMPT = `You are QUITIN Assistant, a helpful AI assistant embedded in QUITIN, a professional
social network for developers, students and tech professionals.
Help with technical questions (programming, software engineering, career advice, interview prep),
explain concepts clearly, give practical code examples, and keep answers concise and well structured.
Use Markdown for formatting: short paragraphs, bullet lists, and fenced code blocks with a language tag.
If a question is unrelated to technology or careers, answer briefly and steer back to those topics.`;

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

const ATTACHMENT_INCLUDE = { orderBy: { createdAt: 'asc' } } satisfies Prisma.AiMessageAttachmentFindManyArgs;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listConversations(userId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.aiConversation.findMany({
      where: {
        userId,
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                {
                  messages: {
                    some: { content: { contains: query, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { attachments: ATTACHMENT_INCLUDE } },
      },
    });
  }

  async createConversation(userId: string, title?: string) {
    return this.prisma.aiConversation.create({
      data: { userId, title: title?.trim() || 'New chat' },
      include: { messages: true },
    });
  }

  async getConversation(userId: string, id: string) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { attachments: ATTACHMENT_INCLUDE },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId) {
      throw new ForbiddenException('You cannot access this conversation');
    }
    return conversation;
  }

  async renameConversation(userId: string, id: string, title: string) {
    await this.getConversation(userId, id);
    return this.prisma.aiConversation.update({
      where: { id },
      data: { title: title.trim() },
    });
  }

  async deleteConversation(userId: string, id: string) {
    await this.getConversation(userId, id);
    await this.prisma.aiConversation.delete({ where: { id } });
    return { success: true };
  }

  async share(userId: string, id: string) {
    const conversation = await this.getConversation(userId, id);
    const token = conversation.shareToken ?? randomBytes(18).toString('base64url');
    await this.prisma.aiConversation.update({
      where: { id },
      data: { shareToken: token, shareEnabled: true },
    });
    return { token, path: `/shared/ai/${token}` };
  }

  async unshare(userId: string, id: string) {
    await this.getConversation(userId, id);
    await this.prisma.aiConversation.update({
      where: { id },
      data: { shareEnabled: false },
    });
    return { success: true };
  }

  async getShared(token: string) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { shareToken: token },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { attachments: ATTACHMENT_INCLUDE },
        },
        user: {
          select: {
            username: true,
            profile: { select: { avatarUrl: true, headline: true } },
          },
        },
      },
    });
    if (!conversation || !conversation.shareEnabled) {
      throw new NotFoundException('This shared conversation is not available');
    }
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      author: conversation.user,
      messages: conversation.messages,
    };
  }

  private sanitizeAttachments(attachments?: AiAttachmentDto[]) {
    if (!attachments?.length) return [];
    return attachments.map((a) => {
      if (!a.url.startsWith('/uploads/') || a.url.includes('..')) {
        throw new BadRequestException('Invalid attachment URL');
      }
      const type: AttachmentType =
        a.type === 'IMAGE' || (a.type == null && a.mimeType.startsWith('image/'))
          ? 'IMAGE'
          : 'DOCUMENT';
      return { url: a.url, name: a.name, mimeType: a.mimeType, size: a.size, type };
    });
  }

  /** Builds the current user message parts, inlining images and text documents. */
  private buildUserContent(
    text: string,
    attachments: { url: string; name: string; mimeType: string; type: AttachmentType }[],
  ): string | ContentPart[] {
    const parts: ContentPart[] = [];
    const notes: string[] = [];

    for (const attachment of attachments) {
      const filePath = join(process.cwd(), 'uploads', 'files', basename(attachment.url));

      if (attachment.type === 'IMAGE') {
        try {
          if (statSync(filePath).size > 8 * 1024 * 1024) {
            notes.push(`[Image “${attachment.name}” was too large to include.]`);
            continue;
          }
          const base64 = readFileSync(filePath).toString('base64');
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${attachment.mimeType};base64,${base64}` },
          });
        } catch {
          notes.push(`[Image “${attachment.name}” could not be read.]`);
        }
        continue;
      }

      const isText =
        attachment.mimeType.startsWith('text/') ||
        /\.(txt|md|csv)$/i.test(attachment.name);
      if (isText) {
        try {
          const raw = readFileSync(filePath, 'utf8').slice(0, 20_000);
          notes.push(`--- Attached file: ${attachment.name} ---\n${raw}\n--- End of file ---`);
        } catch {
          notes.push(`[Document “${attachment.name}” could not be read.]`);
        }
      } else {
        notes.push(
          `[Document “${attachment.name}” is attached. Its contents cannot be read directly; ask the user to paste relevant text if needed.]`,
        );
      }
    }

    const combinedText = [text, ...notes].filter(Boolean).join('\n\n');
    if (combinedText) {
      parts.unshift({ type: 'text', text: combinedText });
    }
    if (parts.length === 0) {
      parts.push({ type: 'text', text: 'Please analyze the attached file.' });
    }
    if (parts.length === 1 && parts[0].type === 'text') {
      return parts[0].text;
    }
    return parts;
  }

  private historyFor(
    messages: { role: string; content: string }[],
  ): ChatMessage[] {
    return messages.slice(-20).map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: { content?: string; attachments?: AiAttachmentDto[] },
  ) {
    const conversation = await this.getConversation(userId, conversationId);
    const trimmed = (input.content ?? '').trim();
    const attachments = this.sanitizeAttachments(input.attachments);
    if (!trimmed && attachments.length === 0) {
      throw new BadRequestException('Write a message or attach a file');
    }

    const history = this.historyFor(conversation.messages);
    const currentContent = this.buildUserContent(trimmed, attachments);

    const updateData: { title?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (conversation.messages.length === 0) {
      updateData.title = (trimmed || attachments[0]?.name || 'New chat').slice(0, 60);
    }

    // Persist the user's message first: if the provider is temporarily down the
    // message is kept and the user can retry with "Regenerate".
    const userMessage = await this.prisma.aiMessage.create({
      data: {
        aiConversationId: conversationId,
        role: 'user',
        content: trimmed || `Attached: ${attachments.map((a) => a.name).join(', ')}`,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: { attachments: ATTACHMENT_INCLUDE },
    });
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    const replyText = await this.callModel([...history, { role: 'user', content: currentContent }]);

    const assistantMessage = await this.prisma.aiMessage.create({
      data: { aiConversationId: conversationId, role: 'assistant', content: replyText },
      include: { attachments: ATTACHMENT_INCLUDE },
    });

    return { userMessage, assistantMessage, conversationId };
  }

  async regenerate(userId: string, conversationId: string) {
    const conversation = await this.getConversation(userId, conversationId);
    const messages = [...conversation.messages];
    if (messages.length === 0) {
      throw new BadRequestException('There is nothing to regenerate');
    }

    const last = messages[messages.length - 1];
    // Regenerate can also recover a send that failed after saving the user message.
    if (last.role === 'assistant') {
      await this.prisma.aiMessage.delete({ where: { id: last.id } });
      messages.pop();
    }

    const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) {
      throw new BadRequestException('There is no question to answer');
    }

    const history = this.historyFor(messages.slice(0, lastUserIndex + 1));
    const replyText = await this.callModel(history);

    const assistantMessage = await this.prisma.aiMessage.create({
      data: { aiConversationId: conversationId, role: 'assistant', content: replyText },
      include: { attachments: ATTACHMENT_INCLUDE },
    });
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return { assistantMessage, conversationId };
  }

  private async callModel(messages: ChatMessage[]): Promise<string> {
    const baseUrl = this.config.get<string>('AI_BASE_URL', 'https://api.openai.com/v1');
    const apiKey = this.config.get<string>('AI_API_KEY', '');
    const model = this.config.get<string>('AI_MODEL', 'gemini-3.5-flash');

    if (!apiKey) {
      // Graceful degradation: the app remains usable without a configured provider.
      return [
        'The AI assistant is not configured yet.',
        '',
        'Set `AI_API_KEY` (and optionally `AI_BASE_URL` and `AI_MODEL`) in the backend `.env` file to enable real answers. QUITIN works with any OpenAI-compatible API.',
      ].join('\n');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          temperature: 0.4,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`AI provider error ${res.status}: ${text}`);
        throw new ServiceUnavailableException('AI provider returned an error');
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        throw new ServiceUnavailableException('AI provider returned an empty response');
      }
      return reply;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      if ((err as Error).name === 'AbortError') {
        this.logger.error('AI provider timed out after 90s');
        throw new ServiceUnavailableException(
          'The AI provider took too long to respond. Please try again.',
        );
      }
      this.logger.error(`AI request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach the AI provider');
    }
  }
}
