import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse, ErrorCode } from '@custom-types/common.type';
import { logError } from '@utils/logger';
import { AppError } from '@utils/errors';
import { Prisma } from '@prisma/client';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  let statusCode = 500;
  let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
  let message = 'Internal server error';
  let details: any = undefined;

  logError('Error occurred', err, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = 400;
    code = ErrorCode.DATABASE_ERROR;

    switch (err.code) {
      case 'P2002':
        const field = err.meta?.target || 'unknown field';
        message = `Dữ liệu bị trùng lặp. Đã tồn tại bản ghi với ${field} này.`;
        details = { field };
        console.log('PRISMA P2002 ERROR DETAILS:', details, 'TABLE/MODEL:', err.meta);
        code = ErrorCode.CONFLICT;
        statusCode = 409;
        break;
      case 'P2025':
        message = 'Record not found';
        code = ErrorCode.NOT_FOUND;
        statusCode = 404;
        break;
      case 'P2003':
        message = 'Foreign key constraint failed';
        details = { field: err.meta?.field_name };
        break;
      case 'P2014':
        message = 'Invalid ID provided';
        code = ErrorCode.VALIDATION_ERROR;
        break;
      default:
        message = 'Database operation failed';
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    code = ErrorCode.VALIDATION_ERROR;
    message = 'Invalid data provided';
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    code = ErrorCode.VALIDATION_ERROR;
    message = 'Validation failed';
    details = (err as any).errors;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = ErrorCode.AUTHENTICATION_ERROR;
    message = err.message;
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    code = ErrorCode.VALIDATION_ERROR;
    message = 'File upload error: ' + err.message;
  }

  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  };

  if (process.env.NODE_ENV !== 'production' && err.stack) {
    (errorResponse.error as any).stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction) => {
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  };

  res.status(404).json(errorResponse);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
