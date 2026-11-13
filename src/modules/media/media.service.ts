import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { AppConfig } from '../../config/configuration';

export type UploadedMedia = { url: string; publicId: string };

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private cloudinaryConfig() {
    const c = this.config.get('cloudinary', { infer: true });
    if (!c?.cloudName || !c.apiKey || !c.apiSecret) {
      throw new ServiceUnavailableException('cloudinary_not_configured');
    }
    return c;
  }

  async uploadImage(buffer: Buffer): Promise<UploadedMedia> {
    const c = this.cloudinaryConfig();
    cloudinary.config({
      cloud_name: c.cloudName,
      api_key: c.apiKey,
      api_secret: c.apiSecret,
      secure: true,
    });

    try {
      return await new Promise<UploadedMedia>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: c.uploadFolder, resource_type: 'image' },
          (err, result) => {
            if (err || !result) {
              reject(err ?? new Error('empty_cloudinary_result'));
              return;
            }
            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        );
        stream.end(buffer);
      });
    } catch (err) {
      this.logger.error(
        `Cloudinary upload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException('photo_upload_failed');
    }
  }
}
