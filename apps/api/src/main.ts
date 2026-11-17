import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { GlobalSecurityExceptionFilter } from './common/security/security-exception.filter.js';
import { securityMiddleware } from './common/security/security-headers.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { limit: '2mb', extended: true });
  app.use(securityMiddleware);

  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
    : [];
  const defaultOrigins = ['http://localhost:3002', 'http://127.0.0.1:3002'];
  const allowedOrigins = new Set([...configuredOrigins, ...defaultOrigins]);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      const norm = requestOrigin.trim().toLowerCase();
      const isExplicitlyAllowed = allowedOrigins.has(norm);
      const isMniLabSubdomain =
        /^https?:\/\/([a-z0-9-]+\.)?mnilab\.my\.id(:\d+)?$/.test(norm) ||
        /^https?:\/\/([a-z0-9-]+\.)?mnilab\.id(:\d+)?$/.test(norm);
      const isDevSubdomain =
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/([a-z0-9-]+\.)?(localhost|127\.0\.0\.1)(:\d+)?$/.test(norm);

      if (isExplicitlyAllowed || isMniLabSubdomain || isDevSubdomain) {
        callback(null, true);
      } else {
        callback(new Error(`Akses CORS ditolak untuk origin: ${requestOrigin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Tenant-Slug',
      'X-Requested-With',
    ],
  });

  app.useGlobalFilters(new GlobalSecurityExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3003);
}

await bootstrap();
