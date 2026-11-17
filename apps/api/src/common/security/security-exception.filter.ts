import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalSecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalSecurityExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : body,
      );
      return;
    }

    if (exception instanceof QueryFailedError) {
      const pgCode = (exception as QueryFailedError & { code?: string }).code;
      if (pgCode === '23505') {
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'Data yang dimasukkan sudah terdaftar di sistem',
        });
        return;
      }
      if (pgCode === '23503') {
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Referensi data terkait tidak ditemukan atau masih digunakan',
        });
        return;
      }
      if (
        pgCode === '22P02' ||
        pgCode === '22007' ||
        pgCode === '22008' ||
        pgCode === '23514'
      ) {
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Format parameter atau data yang dikirim tidak valid',
        });
        return;
      }

      this.logger.error(
        `Database error [${pgCode ?? 'UNKNOWN'}] pada ${req.method} ${req.url}: ${exception.message}`,
      );
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Terjadi kesalahan saat memproses permintaan data',
      });
      return;
    }

    this.logger.error(
      `Unhandled exception pada ${req.method} ${req.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan internal pada server',
    });
  }
}
