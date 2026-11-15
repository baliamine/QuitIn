import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const AVATAR_DIR = join(process.cwd(), 'uploads', 'avatars');
const FILE_DIR = join(process.cwd(), 'uploads', 'files');

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const DOCUMENT_EXT = [
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.md',
  '.csv',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
];

const IMAGE_MAX = 10 * 1024 * 1024; // 10 MB
const FILE_MAX = 20 * 1024 * 1024; // 20 MB

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

@Controller('upload')
export class UploadController {
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureDir(AVATAR_DIR);
          cb(null, AVATAR_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!IMAGE_EXT.includes(ext) || !file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Only image files are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return { url: `/uploads/avatars/${file.filename}` };
  }

  /**
   * General-purpose attachment upload used by posts, messages and the AI
   * assistant. Images and common documents are accepted, with a hard size cap.
   */
  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureDir(FILE_DIR);
          cb(null, FILE_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: FILE_MAX },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const isImage = IMAGE_EXT.includes(ext) && file.mimetype.startsWith('image/');
        const isDocument = DOCUMENT_EXT.includes(ext);
        if (!isImage && !isDocument) {
          cb(
            new BadRequestException(
              'Unsupported file type. Allowed: images (png, jpg, jpeg, webp, gif) and documents (pdf, doc, docx, txt, md, csv, ppt, pptx, xls, xlsx).',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const ext = extname(file.originalname).toLowerCase();
    const isImage = IMAGE_EXT.includes(ext) && file.mimetype.startsWith('image/');

    if (isImage && file.size > IMAGE_MAX) {
      throw new BadRequestException('Images must be 10 MB or smaller');
    }

    return {
      url: `/uploads/files/${file.filename}`,
      name: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      type: isImage ? 'IMAGE' : 'DOCUMENT',
    };
  }
}
