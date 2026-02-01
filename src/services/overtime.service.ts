import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';

const prisma = new PrismaClient();

export class OvertimeService {
  /**
   * Create a new overtime session
   */
  async createSession(adminId: number, data: { sessionName: string; startTime: Date | string; notes?: string }) {
    const startTime = new Date(data.startTime);
    
    const session = await prisma.overtimeSession.create({
      data: {
        sessionName: data.sessionName,
        startTime,
        notes: data.notes,
        status: 'open',
        createdBy: adminId,
      },
    });

    await logActivity('create', adminId, 'overtime_session', {
      id: session.id,
      name: session.sessionName,
    });

    return session;
  }

  /**
   * Add employees to a session
   */
  async addEmployees(adminId: number, sessionId: number, userIds: number[]) {
    const session = await prisma.overtimeSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundError('Phiên tăng ca không tồn tại');
    }

    if (session.status !== 'open') {
      throw new ValidationError('Chỉ có thể thêm nhân viên vào phiên đang mở');
    }

    // Filter out existing users
    const existingEntries = await prisma.overtimeEntry.findMany({
      where: {
        overtimeSessionId: sessionId,
        userId: { in: userIds },
      },
      select: { userId: true },
    });

    const existingUserIds = existingEntries.map(e => e.userId);
    const newUserIds = userIds.filter(id => !existingUserIds.includes(id));

    if (newUserIds.length === 0) {
      return { message: 'Tất cả nhân viên đã có trong phiên này' };
    }

    // Bulk create
    await prisma.overtimeEntry.createMany({
      data: newUserIds.map(userId => ({
        overtimeSessionId: sessionId,
        userId,
        startTime: session.startTime, // Default to session start
      })),
    });

    await logActivity('update', adminId, 'overtime_session', {
      action: 'add_employees',
      sessionId,
      count: newUserIds.length,
      userIds: newUserIds,
    });

    return { message: `Đã thêm ${newUserIds.length} nhân viên vào phiên` };
  }

  /**
   * Remove employee from session
   */
  async removeEmployee(_adminId: number, sessionId: number, userId: number) {
    const session = await prisma.overtimeSession.findUnique({
        where: { id: sessionId },
    });
  
    if (!session) throw new NotFoundError('Phiên tăng ca không tồn tại');
    if (session.status !== 'open') throw new ValidationError('Không thể xóa nhân viên khỏi phiên đã đóng');

    await prisma.overtimeEntry.deleteMany({
      where: {
        overtimeSessionId: sessionId,
        userId,
      },
    });
    
    return { message: 'Đã xóa nhân viên khỏi phiên tăng ca' };
  }

  /**
   * Close session and calculate hours
   */
  async closeSession(adminId: number, sessionId: number, endTime: Date | string) {
    const session = await prisma.overtimeSession.findUnique({
      where: { id: sessionId },
      include: { entries: true },
    });

    if (!session) {
      throw new NotFoundError('Phiên tăng ca không tồn tại');
    }

    if (session.status !== 'open') {
      throw new ValidationError('Phiên này đã đóng hoặc bị hủy');
    }

    const end = new Date(endTime);
    const start = new Date(session.startTime);

    if (end <= start) {
      throw new ValidationError('Thời gian kết thúc phải sau thời gian bắt đầu');
    }

    // 1. Update session status
    await prisma.overtimeSession.update({
      where: { id: sessionId },
      data: {
        status: 'closed',
        endTime: end,
      },
    });

    // 2. Calculate hours for each entry
    // Hours = (End - Start) in hours.
    // Logic: If entry has specific start/end, use that. Else use session start/end.
    
    // For now, we assume bulk update based on session duration for everyone (simplest MVP)
    // unless we implement individual adjustment later.
    
    const durationMs = end.getTime() - start.getTime();
    const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100; // Round 2 decimals

    // Update all entries that don't have custom hours yet
    // Note: Prisma createMany doesn't support updateMany with join logic easily for different values,
    // but here we are setting same value for all who rely on session time.
    
    await prisma.overtimeEntry.updateMany({
      where: {
        overtimeSessionId: sessionId,
        actualHours: 0, // Only update those not manually set (if valid assumption)
      },
      data: {
        actualHours: durationHours,
        endTime: end,
      },
    });

    await logActivity('update', adminId, 'overtime_session', {
      action: 'close',
      sessionId,
      durationHours,
    });

    return { 
      message: 'Đã đóng phiên tăng ca thành công', 
      totalHours: durationHours 
    };
  }

  /**
   * Get all sessions
   */
  async getSessions(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const [sessions, total] = await Promise.all([
      prisma.overtimeSession.findMany({
        skip,
        take: limit,
        orderBy: { startTime: 'desc' },
        include: {
          _count: {
            select: { entries: true },
          },
          creator: {
            select: { fullName: true }
          }
        }
      }),
      prisma.overtimeSession.count(),
    ]);

    return {
      data: sessions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  /**
   * Get session detail
   */
  async getSessionById(id: number) {
    const session = await prisma.overtimeSession.findUnique({
      where: { id },
      include: {
        creator: {
          select: { fullName: true, id: true }
        },
        entries: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                employeeCode: true,
                role: { select: { roleName: true } }
              }
            }
          }
        }
      }
    });

    if (!session) throw new NotFoundError('Phiên tăng ca không tồn tại');
    return session;
  }
}

export default new OvertimeService();
