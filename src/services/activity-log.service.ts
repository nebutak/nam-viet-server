import { PrismaClient, Prisma } from '@prisma/client';
// import { NotFoundError } from '@utils/errors';

const prisma = new PrismaClient();

export interface QueryActivityLogsInput {
  page?: string;
  limit?: string;
  userId?: string;
  action?: string;
  tableName?: string;
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
      ...(tableName && { tableName: { contains: tableName } }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
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
