import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import logger, { logInfo, logActivity } from '@utils/logger';
import { AuthRequest } from '@custom-types/common.type';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

morgan.token('user-id', (req: AuthRequest) => {
  return req.user ? req.user.id.toString() : 'anonymous';
});

morgan.token('response-time-ms', (req, _res) => {
  const startTime = (req as any)._startTime;
  if (!startTime) return '0';
  return `${Date.now() - startTime}ms`;
});

export const httpLogger = morgan(
  ':method :url :status :response-time-ms - :user-id - :remote-addr',
  {
    stream: {
      write: (message: string) => {
        logInfo(message.trim());
      },
    },
  }
);

export const requestTimer = (req: Request, _res: Response, next: NextFunction) => {
  (req as any)._startTime = Date.now();
  next();
};

export const logActivityMiddleware = (action: string, resourceType: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    (req as any).activityLog = {
      action,
      resourceType,
      recordId: req.params.id ? parseInt(req.params.id) : null,
    };

    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const activityInfo = (req as any).activityLog;

        logActivity(activityInfo.action, req.user.id, activityInfo.resourceType, {
          recordId: activityInfo.recordId,
          method: req.method,
          path: req.path,
          ip: req.ip,
        });

        saveActivityToDatabase(req, activityInfo).catch((error) => {
          logger.error('Failed to save activity log to database', { error });
        });
      }

      return originalJson(body);
    };

    next();
  };
};

const saveActivityToDatabase = async (req: AuthRequest, activityInfo: any) => {
  if (!req.user) return;

  const actionMap: { [key: string]: 'create' | 'update' | 'delete' | 'approve' | 'login' | 'logout' } = {
    create: 'create',
    update: 'update',
    delete: 'delete',
    approve: 'approve',
    cancel: 'delete',
    login: 'login',
    logout: 'logout',
  };

  const action = actionMap[activityInfo.action] || 'update';

  try {
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action,
        tableName: activityInfo.resourceType,
        recordId: activityInfo.recordId,
        oldValue: action === 'update' ? req.body : undefined,
        newValue: action === 'create' || action === 'update' ? req.body : undefined,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        status: 'success',
      },
    });
  } catch (error) {
    logger.error('Failed to save activity log', { error });
  }
};

export const performanceMonitor = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  const originalSend = res.send.bind(res);
  res.send = function (body: any) {
    const duration = Date.now() - startTime;

    if (duration > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        ip: req.ip,
      });
    }

    res.setHeader('X-Response-Time', `${duration}ms`);

    return originalSend(body);
  };

  next();
};
