import { PrismaClient, ShiftType, ScanType } from '@prisma/client';
import QRCode from 'qrcode';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ValidationError, NotFoundError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import type { QRCodePayload } from '../types/qr-code.type';
import attendanceService from './attendance.service';

const prisma = new PrismaClient();
const QR_SECRET = process.env.QR_SECRET || 'your-qr-secret-key-change-in-production';
const STANDARD_START_TIME = '08:30:00'; // 8:30 AM

class QRCodeService {
  /**
   * Generate QR code for attendance check-in
   */
  async generateQRCode(
    startDate: Date, 
    endDate: Date, 
    createdBy: number, 
    shift: ShiftType = 'all_day',
    type: ScanType = 'check_in',
    clientUrl?: string
  ) {
    // Create unique session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Create JWT payload
    const payload: QRCodePayload = {
      sessionToken,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      createdAt: new Date().toISOString(),
    };
    
    // Sign JWT with 90 days expiration
    const token = jwt.sign(payload, QR_SECRET, { expiresIn: '90d' });
    
    // Build the QR data text
    const qrText = clientUrl ? `${clientUrl}/attendance/scan?qrData=${token}` : token;

    // Generate QR code image as base64 data URL
    const qrCodeDataURL = await QRCode.toDataURL(qrText, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    
    // Calculate expiration date (90 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    
    // Save to database
    const qrCode = await prisma.attendanceQRCode.create({
      data: {
        qrCode: qrCodeDataURL,
        sessionToken,
        startDate,
        endDate,
        expiresAt,
        createdBy,
        shift,
        type,
      },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });
    
    // Log activity
    await logActivity('create', createdBy, 'attendance_qr_code', {
      id: qrCode.id,
      startDate,
      endDate,
      shift,
      type,
    });
    
    return {
      ...qrCode,
      token, // Return token for reference
    };
  }
  
  /**
   * Validate shift time
   */
  private validateShiftTime(shift: ShiftType) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes; // Convert to minutes

    // Morning: 6:00 (360) - 8:30 (510)
    if (shift === 'morning') {
      if (currentTime < 360 || currentTime > 510) {
        throw new ValidationError('Mã QR này chỉ có hiệu lực trong Ca Sáng (06:00 - 08:30)');
      }
    }
    // Afternoon: 13:30 (810) - 14:30 (870)
    else if (shift === 'afternoon') {
      if (currentTime < 810 || currentTime > 870) {
        throw new ValidationError('Mã QR này chỉ có hiệu lực trong Ca Chiều (13:30 - 14:30)');
      }
    }
  }

  /**
   * Scan and validate QR code, then perform check-in/check-out
   */
  async scanQRCode(
    qrData: string,
    userId: number,
    location?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    let decoded: QRCodePayload;
    
    try {
      // Verify and decode JWT
      decoded = jwt.verify(qrData, QR_SECRET) as QRCodePayload;
    } catch (error) {
      await this.logScan(null, userId, 'invalid', 'QR code không hợp lệ hoặc đã hết hạn', ipAddress, userAgent, location);
      throw new ValidationError('QR code không hợp lệ hoặc đã hết hạn');
    }
    
    // Find QR code in database
    const qrCode = await prisma.attendanceQRCode.findUnique({
      where: { sessionToken: decoded.sessionToken },
    });
    
    if (!qrCode) {
      await this.logScan(null, userId, 'invalid', 'QR code không tồn tại trong hệ thống', ipAddress, userAgent, location);
      throw new NotFoundError('QR code không tồn tại trong hệ thống');
    }
    
    if (!qrCode.isActive) {
      await this.logScan(qrCode.id, userId, 'invalid', 'QR code đã bị vô hiệu hóa', ipAddress, userAgent, location);
      throw new ValidationError('QR code đã bị vô hiệu hóa');
    }
    
    // Check if QR code has expired
    if (new Date() > qrCode.expiresAt) {
      await this.logScan(qrCode.id, userId, 'expired', 'QR code đã hết hạn', ipAddress, userAgent, location);
      throw new ValidationError('QR code đã hết hạn');
    }
    
    // Check date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDate = new Date(qrCode.startDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(qrCode.endDate);
    endDate.setHours(23, 59, 59, 999);
    
    if (today < startDate || today > endDate) {
      const message = `QR code chỉ hiệu lực từ ${startDate.toLocaleDateString('vi-VN')} đến ${new Date(qrCode.endDate).toLocaleDateString('vi-VN')}`;
      await this.logScan(qrCode.id, userId, 'outside_date_range', message, ipAddress, userAgent, location);
      throw new ValidationError(message);
    }

    // Validate Shift Time
    try {
      this.validateShiftTime(qrCode.shift);
    } catch (error: any) {
      await this.logScan(qrCode.id, userId, 'invalid', error.message, ipAddress, userAgent, location);
      throw error;
    }
    
    // Process Check-in or Check-out
    if (qrCode.type === 'check_out') {
      try {
        const result = await attendanceService.checkOut(userId, {
          checkOutLocation: location || 'QR Check-out',
        });
        
        await this.logScan(qrCode.id, userId, 'success', null, ipAddress, userAgent, location, result.id);
        
        // Update usage count
        await prisma.attendanceQRCode.update({
          where: { id: qrCode.id },
          data: { usageCount: { increment: 1 } },
        });

        return {
          attendance: result,
          message: 'Chấm công ra thành công',
          isLate: false,
        };
      } catch (error: any) {
        await this.logScan(qrCode.id, userId, 'error', error.message, ipAddress, userAgent, location);
        throw error;
      }
    } else {
      // CHECK-IN
      // Check if already checked in today
      const localNow = new Date();
      const today = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate()));

      const existingAttendance = await prisma.attendance.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      if (existingAttendance?.checkInTime) {
        await this.logScan(qrCode.id, userId, 'already_checked_in', 'Đã chấm công hôm nay', ipAddress, userAgent, location, existingAttendance.id);
        throw new ValidationError('Bạn đã chấm công vào hôm nay rồi');
      }
      
      // Perform check-in
      const now = new Date();
      const late = this.isLate(now);
      
      const attendance = await prisma.attendance.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          checkInTime: now,
          status: late ? 'late' : 'present',
          checkInLocation: location || 'QR Check-in',
        },
        create: {
          userId,
          date: today,
          checkInTime: now,
          status: late ? 'late' : 'present',
          checkInLocation: location || 'QR Check-in',
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
        },
      });
      
      // Update usage count
      await prisma.attendanceQRCode.update({
        where: { id: qrCode.id },
        data: { usageCount: { increment: 1 } },
      });
      
      // Log successful scan
      await this.logScan(qrCode.id, userId, 'success', null, ipAddress, userAgent, location, attendance.id);
      
      // Log activity
      await logActivity('qr_check_in', userId, 'attendance', {
        id: attendance.id,
        qrCodeId: qrCode.id,
        status: attendance.status,
      });
      
      return {
        attendance,
        message: late ? 'Chấm công thành công (Đi muộn)' : 'Chấm công thành công',
        isLate: late,
      };
    }
  }
  
  /**
   * Get all QR codes with pagination
   */
  async getAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [records, total] = await Promise.all([
      prisma.attendanceQRCode.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          sessionToken: true,
          startDate: true,
          endDate: true,
          shift: true,
          type: true,
          isActive: true,
          usageCount: true,
          createdBy: true,
          createdAt: true,
          expiresAt: true,
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          _count: {
            select: { logs: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.attendanceQRCode.count({ where: { deletedAt: null } }),
    ]);
    
    return {
      data: records,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  
  /**
   * Get QR code by ID
   */
  async getById(id: number) {
    const qrCode = await prisma.attendanceQRCode.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        logs: {
          take: 10,
          orderBy: { scannedAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                employeeCode: true,
              },
            },
          },
        },
      },
    });
    
    if (!qrCode) {
      throw new NotFoundError('QR code không tồn tại');
    }
    
    return qrCode;
  }
  
  /**
   * Deactivate QR code
   */
  async deactivate(id: number, userId: number) {
    const qrCode = await prisma.attendanceQRCode.findUnique({
      where: { id },
    });
    
    if (!qrCode) {
      throw new NotFoundError('QR code không tồn tại');
    }
    
    const updated = await prisma.attendanceQRCode.update({
      where: { id },
      data: { isActive: false },
    });
    
    // Log activity
    await logActivity('deactivate', userId, 'attendance_qr_code', {
      id,
    });
    
    return updated;
  }
  
  /**
   * Delete QR code (soft delete)
   */
  async delete(id: number, userId: number) {
    const qrCode = await prisma.attendanceQRCode.findUnique({
      where: { id },
    });
    
    if (!qrCode) {
      throw new NotFoundError('QR code không tồn tại');
    }
    
    await prisma.attendanceQRCode.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    
    // Log activity
    await logActivity('delete', userId, 'attendance_qr_code', {
      id,
    });
    
    return { message: 'Đã xóa QR code thành công' };
  }
  
  /**
   * Check if check-in time is late (after 8:30 AM)
   */
  private isLate(checkInTime: Date): boolean {
    const hours = checkInTime.getHours();
    const minutes = checkInTime.getMinutes();
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    return timeString > STANDARD_START_TIME;
  }
  
  /**
   * Log QR scan attempt for audit trail
   */
  private async logScan(
    qrCodeId: number | null,
    userId: number,
    status: string,
    errorMessage: string | null,
    ipAddress?: string,
    userAgent?: string,
    location?: string,
    attendanceId?: number
  ) {
    if (!qrCodeId) return;
    
    try {
      await prisma.attendanceQRLog.create({
        data: {
          qrCodeId,
          userId,
          status: status as any,
          errorMessage,
          ipAddress,
          userAgent,
          location,
          attendanceId,
        },
      });
    } catch (error) {
      // Don't throw error if logging fails
      console.error('Failed to log QR scan:', error);
    }
  }
}

export default new QRCodeService();
