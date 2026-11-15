import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends transactional email through SMTP (nodemailer) or Resend.
 * When neither is configured the message is written to the server log instead,
 * so local development and tests keep working without external credentials.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    this.from = this.config.get<string>(
      'MAIL_FROM',
      'QUITIN <no-reply@quitin.local>',
    );

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT', '587')),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: this.config.get<string>('SMTP_USER')
          ? {
              user: this.config.get<string>('SMTP_USER'),
              pass: this.config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
    }
  }

  get isConfigured() {
    return Boolean(this.transporter || this.config.get<string>('RESEND_API_KEY'));
  }

  private get frontendUrl() {
    return this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  async send(input: MailInput): Promise<boolean> {
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return true;
      } catch (err) {
        this.logger.error(`SMTP send failed: ${(err as Error).message}`);
        return false;
      }
    }

    const resendKey = this.config.get<string>('RESEND_API_KEY');
    if (resendKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text,
          }),
        });
        if (!res.ok) {
          this.logger.error(`Resend error ${res.status}: ${await res.text()}`);
          return false;
        }
        return true;
      } catch (err) {
        this.logger.error(`Resend request failed: ${(err as Error).message}`);
        return false;
      }
    }

    // Development fallback: print the email so links are still usable.
    this.logger.warn(
      `[mail:not-configured] to=${input.to} subject="${input.subject}"\n${input.text ?? input.html}`,
    );
    return false;
  }

  private layout(title: string, body: string) {
    return `<!doctype html>
<html><body style="margin:0;background:#09090b;padding:32px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#101013;border:1px solid #26262c;border-radius:16px;padding:32px">
        <tr><td>
          <div style="font-size:20px;font-weight:700;color:#f4f4f5;letter-spacing:-0.02em">QUITIN</div>
          <h1 style="font-size:22px;color:#f4f4f5;margin:24px 0 12px">${title}</h1>
          <div style="font-size:14px;line-height:1.6;color:#a1a1aa">${body}</div>
          <p style="margin-top:32px;font-size:12px;color:#71717a">
            If you did not request this email you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  async sendVerificationEmail(email: string, username: string, token: string) {
    const link = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const html = this.layout(
      'Verify your email',
      `<p>Hi @${username},</p>
       <p>Confirm your email address to finish setting up your QUITIN account.</p>
       <p style="margin:24px 0">
         <a href="${link}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Verify email</a>
       </p>
       <p>Or paste this link into your browser:<br><span style="color:#60a5fa;word-break:break-all">${link}</span></p>
       <p>This link expires in 24 hours.</p>`,
    );
    return this.send({
      to: email,
      subject: 'Verify your QUITIN email',
      html,
      text: `Verify your QUITIN email: ${link}`,
    });
  }

  async sendPasswordResetEmail(email: string, username: string, token: string) {
    const link = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const html = this.layout(
      'Reset your password',
      `<p>Hi @${username},</p>
       <p>We received a request to reset your QUITIN password.</p>
       <p style="margin:24px 0">
         <a href="${link}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Choose a new password</a>
       </p>
       <p>Or paste this link into your browser:<br><span style="color:#60a5fa;word-break:break-all">${link}</span></p>
       <p>This link expires in 1 hour.</p>`,
    );
    return this.send({
      to: email,
      subject: 'Reset your QUITIN password',
      html,
      text: `Reset your QUITIN password: ${link}`,
    });
  }
}
