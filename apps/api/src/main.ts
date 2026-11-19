import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AllowedOriginService } from './common/security/allowed-origin.service.js';
import { GlobalSecurityExceptionFilter } from './common/security/security-exception.filter.js';
import { securityMiddleware } from './common/security/security-headers.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { limit: '2mb', extended: true });
  app.use(securityMiddleware);

  const allowedOriginService = app.get(AllowedOriginService);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      void allowedOriginService
        .validateOrigin(requestOrigin)
        .then((result) => {
          if (result.allowed) {
            callback(null, result.normalizedOrigin ?? true);
          } else {
            callback(null, false);
          }
        })
        .catch(() => {
          callback(null, false);
        });
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
