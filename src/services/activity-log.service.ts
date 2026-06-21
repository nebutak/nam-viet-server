import { PrismaClient, Prisma } from '@prisma/client';
// import { NotFoundError } from '@utils/errors';

const prisma = new PrismaClient();

export interface QueryActivityLogsInput {
  page?: string;
  limit?: string;
  userId?: string;
  action?: string;
  tableName?: string;
  entity?: string; // Add support for entity as alias for tableName
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

class ActivityLogService {
  async getAllActivityLogs(query: QueryActivityLogsInput) {
    const {
      page = '1',
      limit = '20',
      userId,
      action,
      tableName,
      entity,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Prisma.ActivityLogWhereInput = {
      ...(userId && { userId: parseInt(userId) }),
      ...(action && { action: action as any }), // Cast to enum if needed, or let Prisma handle it
      ...((tableName || entity) && { 
        tableName: { 
          contains: tableName || entity,
        } 
      }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { 
            lte: (() => {
              const date = new Date(endDate);
              date.setHours(23, 59, 59, 999);
              return date;
            })()
          }),
        },
      }),
    };

    // Execute queries in parallel
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    avatarUrl: true
                }
            }
        }
      }),
      prisma.activityLog.count({ where }),
    ]);

    // Handle BigInt serialization
    const serializedLogs = logs.map(log => ({
      ...log,
      id: log.id.toString(),
    }));

    return {
      data: serializedLogs,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }
}

export default new ActivityLogService();
