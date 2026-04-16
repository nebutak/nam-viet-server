import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword } from '@utils/password';
import { generateAccessToken } from '@utils/jwt';
import { AuthenticationError, NotFoundError, ValidationError } from '@utils/errors';
import { JwtPayload } from '@custom-types/common.type';
import { logActivity } from '@utils/logger';
import emailService from './email.service';
import loginHistoryService from './login-history.service';

const prisma = new PrismaClient();

// Local Memory Maps for Rate Limiting and Token Blacklisting
const loginAttemptsMap = new Map<string, { attempts: number; expiry: number }>();
const tokenBlacklist = new Set<string>();

// Constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_TIME = 15 * 60;

class AuthService {
  // Login user
  async login(email: string, password: string, ipAddress?: string) {
    const loginAttempts = this.getLoginAttempts(email);
    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockData = loginAttemptsMap.get(email);
      const lockTimeRemaining = lockData ? Math.ceil((lockData.expiry - Date.now()) / 1000) : 0;
      const minutesLeft = Math.ceil(lockTimeRemaining / 60);
      throw new AuthenticationError(
        `Tài khoản bị khóa do đăng nhập không thành công quá nhiều lần. Vui lòng thử lại sau ${minutesLeft} phút.`
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          select: {
            id: true,
            roleKey: true,
            roleName: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            warehouseCode: true,
            warehouseName: true,
            warehouseType: true,
          },
        },
      },
    });

    if (!user) {
      this.incrementLoginAttempts(email);
      throw new AuthenticationError('Email hoặc mật khẩu không đúng');
    }

    if (user.status === 'locked') {
      throw new AuthenticationError('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên');
    }

    if (user.status === 'inactive') {
      throw new AuthenticationError(
        'Tài khoản của bạn đang không hoạt động. Vui lòng liên hệ quản trị viên'
      );
    }

    if (!user.passwordHash || !user.email) {
      throw new AuthenticationError('Tài khoản chưa được cấp quyền đăng nhập');
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      this.incrementLoginAttempts(email);
      throw new AuthenticationError('Email hoặc mật khẩu không đúng');
    }

    this.clearLoginAttempts(email);

    // Create OTP code and send via email
    const { code, expiresIn } = await this.createOTPCode(user.id, user.email!, ipAddress);

    // Send OTP via email
    const emailSent = await emailService.sendEmail({
      to: user.email!,
      subject: 'Mã xác thực đăng nhập - Công Ty Nam Việt',
      html: this.getOTPEmailTemplate(user.fullName, code),
      text: `Xin chào ${user.fullName},\n\nMã xác thực đăng nhập của bạn là: ${code}\n\nMã này sẽ hết hạn sau 5 phút.\n\nTrân trọng,\nCông Ty Nam Việt`,
    });

    logActivity('login_otp_sent', user.id, 'auth', {
      ipAddress,
      emailSent,
    });

    // Return OTP required response
    return {
      requireOTP: true,
      email: user.email,
      expiresIn,
      // For development only - return code if email not configured
      code: process.env.NODE_ENV === 'development' && !emailSent ? code : undefined,
    };
  }

  // Logout user
  async logout(userId: number, accessToken: string) {
    if (accessToken) {
      tokenBlacklist.add(accessToken);
    }
    // Auto cleanup logic could be added here, but for simplicity we rely on JWT maxAge

    logActivity('logout', userId, 'auth');

    // Create ActivityLog entry for system log
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'logout',
        tableName: 'auth',
        recordId: userId,
        status: 'success',
      },
    });

    return { message: 'Đăng xuất thành công' };
  }



  // Change password
  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Người dùng không tồn tại');
    }

    if (!user.passwordHash || !user.email) {
      throw new AuthenticationError('Tài khoản chưa được cấp quyền đăng nhập');
    }

    const isOldPasswordValid = await comparePassword(oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      throw new ValidationError('Mật khẩu hiện tại không đúng');
    }

    const isSamePassword = await comparePassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new ValidationError('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });

    logActivity('update', userId, 'users', {
      recordId: userId,
      action: 'change_password',
    });

    // Send notification email
    if (user.email) {
      await emailService.sendPasswordChangedEmail(user.email, user.fullName);
    }

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại' };
  }

  // Forgot password - Send reset token
  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
      },
    });

    if (!user) {
      return {
        message: 'Nếu email tồn tại, một liên kết đặt lại mật khẩu đã được gửi',
      };
    }

    if (user.status !== 'active') {
      return {
        message: 'Nếu email tồn tại, một liên kết đặt lại mật khẩu đã được gửi',
      };
    }

    const resetToken = this.generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour


    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        email: user.email!,
        code: resetToken,
        type: 'forgot_password' as any,
        expiresAt,
      },
    });

    // Send email with reset link
    const emailSent = await emailService.sendPasswordResetEmail(
      user.email!,
      user.fullName,
      resetToken
    );

    // Log activity
    logActivity('forgot_password', user.id, 'auth', {
      email: user.email!,
      emailSent,
    });

    return {
      message: 'Nếu email tồn tại, một liên kết đặt lại mật khẩu đã được gửi',
      // For development only - return token if email not configured or in dev mode
      resetToken: process.env.NODE_ENV === 'development' || !emailSent ? resetToken : undefined,
    };
  }

  // Reset password with token
  async resetPassword(token: string, newPassword: string) {
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        code: token,
        type: 'forgot_password' as any,
        isUsed: false,
      },
    });

    if (!verificationCode || new Date() > verificationCode.expiresAt) {
      throw new AuthenticationError('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    const userId = verificationCode.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Người dùng không tồn tại');
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });

    await prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { isUsed: true, usedAt: new Date() },
    });

    logActivity('update', userId, 'users', {
      recordId: userId,
      action: 'reset_password',
    });

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới' };
  }

  // Get current user details
  async getCurrentUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          select: {
            id: true,
            roleKey: true,
            roleName: true,
            description: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            warehouseCode: true,
            warehouseName: true,
            warehouseType: true,
            address: true,
            city: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('Người dùng không tồn tại');
    }

    // Get user permissions (Role + Direct)
    const permissions = await this.getUserPermissions(user.id, user.roleId);

    const mappedPermissions = permissions.map(code => ({ code }));

    const { passwordHash, createdBy, updatedBy, ...userWithoutPassword } = user;

    return {
      ...userWithoutPassword,
      role: {
        ...userWithoutPassword.role,
        permissions: mappedPermissions
      }
    };
  }

  // Helper methods
  // Update last login timestamp
  private async updateLastLogin(userId: number) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }

  // Get login attempts count
  private getLoginAttempts(email: string): number {
    const data = loginAttemptsMap.get(email);
    if (!data) return 0;
    if (Date.now() > data.expiry) {
      loginAttemptsMap.delete(email);
      return 0;
    }
    return data.attempts;
  }

  // Increment login attempts
  private incrementLoginAttempts(email: string) {
    const data = loginAttemptsMap.get(email);
    if (data && Date.now() <= data.expiry) {
      data.attempts += 1;
    } else {
      loginAttemptsMap.set(email, {
        attempts: 1,
        expiry: Date.now() + LOGIN_LOCK_TIME * 1000,
      });
    }
  }

  // Clear login attempts
  private clearLoginAttempts(email: string) {
    loginAttemptsMap.delete(email);
  }

  // Generate reset token
  private generateResetToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate 6-digit OTP code
  private generateOTPCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Create and save OTP verification code
  async createOTPCode(
    userId: number,
    email: string,
    ipAddress?: string
  ): Promise<{ code: string; expiresIn: number }> {
    // Delete any existing unused OTP codes for this user
    await prisma.verificationCode.deleteMany({
      where: {
        userId,
        type: 'login_otp',
        isUsed: false,
      },
    });

    const code = this.generateOTPCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.verificationCode.create({
      data: {
        userId,
        email,
        code,
        type: 'login_otp',
        expiresAt,
        ipAddress,
      },
    });

    return {
      code,
      expiresIn: 5 * 60, // 5 minutes in seconds
    };
  }

  // Helper method to get user permissions (Role + Direct)
  private async getUserPermissions(userId: number, roleId: number): Promise<string[]> {
    // 1. Get permissions from Role
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId },
      include: {
        permission: {
          select: {
            permissionKey: true,
          },
        },
      },
    });

    const permissionsSet = new Set(rolePermissions.map((rp) => rp.permission.permissionKey));

    // 2. Get direct user permissions (Grant/Revoke)
    const userPermissions = await prisma.userPermission.findMany({
      where: { userId },
      include: {
        permission: {
          select: {
            permissionKey: true,
          },
        },
      },
    });

    // 3. Apply overrides
    for (const up of userPermissions) {
      if (up.grantType === 'grant') {
        permissionsSet.add(up.permission.permissionKey);
      } else if (up.grantType === 'revoke') {
        permissionsSet.delete(up.permission.permissionKey);
      }
    }

    return Array.from(permissionsSet);
  }

  // Verify OTP code and complete login
  async verifyOTPAndLogin(email: string, code: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          select: {
            id: true,
            roleKey: true,
            roleName: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            warehouseCode: true,
            warehouseName: true,
            warehouseType: true,
          },
        },
      },
    });

    if (!user) {
      throw new AuthenticationError('Mã xác thực không hợp lệ');
    }

    // Find the OTP code
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        userId: user.id,
        email,
        code,
        type: 'login_otp',
        isUsed: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!verificationCode) {
      throw new AuthenticationError('Mã xác thực không hợp lệ');
    }

    // Check if code is expired
    if (new Date() > verificationCode.expiresAt) {
      throw new AuthenticationError('Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới');
    }

    // Check max attempts (5 attempts)
    if (verificationCode.attempts >= 5) {
      throw new AuthenticationError('Quá nhiều lần nhập sai. Vui lòng yêu cầu mã mới');
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: {
        isUsed: true,
        usedAt: new Date(),
        attempts: verificationCode.attempts + 1,
      },
    });

    // Generate tokens
    const payload: JwtPayload = {
      id: user.id,
      email: user.email!,
      roleId: user.roleId,
      warehouseId: user.warehouseId || undefined,
      employeeCode: user.employeeCode,
    };

    const accessToken = generateAccessToken(payload, '7d'); // Changed to 7d to match crm-template

    await this.updateLastLogin(user.id);

    logActivity('login', user.id, 'auth', {
      ipAddress,
      userAgent: userAgent || 'unknown',
      method: '2FA_OTP',
    });

    // Create LoginHistory entry
    await loginHistoryService.createLoginHistory(user.id, {
      userAgent: userAgent || 'unknown',
      ipAddress: ipAddress || 'unknown',
    });

    // Create ActivityLog entry for system log
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'login',
        tableName: 'auth',
        recordId: user.id,
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        status: 'success',
      },
    });

    const permissions = await this.getUserPermissions(user.id, user.roleId);
    const mappedPermissions = permissions.map(code => ({ code }));

    // Prepare response
    const { passwordHash, createdBy, updatedBy, ...userWithoutPassword } = user;

    return {
      token: accessToken,
      user: {
        ...userWithoutPassword,
        role: {
          ...userWithoutPassword.role,
          permissions: mappedPermissions
        }
      }
    };
  }

  // Resend OTP code
  async resendOTPCode(email: string, ipAddress?: string): Promise<{ expiresIn: number }> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
      },
    });

    if (!user || user.status !== 'active') {
      throw new AuthenticationError('Yêu cầu không hợp lệ');
    }

    if (!user.email) throw new AuthenticationError('Tài khoản chưa có email');

    const { code, expiresIn } = await this.createOTPCode(user.id, user.email!, ipAddress);

    // Send OTP via email
    await emailService.sendEmail({
      to: user.email!,
      subject: 'Mã xác thực đăng nhập - Công Ty Nam Việt',
      html: this.getOTPEmailTemplate(user.fullName, code),
      text: `Xin chào ${user.fullName},\n\nMã xác thực đăng nhập của bạn là: ${code}\n\nMã này sẽ hết hạn sau 5 phút.\n\nTrân trọng,\nCông Ty Nam Việt`,
    });

    return { expiresIn };
  }

  // OTP Email Template
  private getOTPEmailTemplate(fullName: string, code: string): string {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã xác thực đăng nhập</title>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#0f1a13;font-family:'Be Vietnam Pro',Arial,sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1a13;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Logo / Brand Header -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:14px;padding:10px 18px;">
                    <span style="font-size:13px;font-weight:700;color:#fff;letter-spacing:2px;text-transform:uppercase;">Nam Việt</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.4);">

              <!-- Top accent bar -->
              <div style="height:5px;background:linear-gradient(90deg,#22c55e 0%,#4ade80 50%,#86efac 100%);"></div>

              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Hero section -->
                <tr>
                  <td style="background:linear-gradient(160deg,#052e16 0%,#14532d 60%,#166534 100%);padding:44px 44px 36px;text-align:center;">
                    <!-- Shield icon -->
                    <div style="display:inline-block;background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.15);border-radius:20px;padding:16px 20px;margin-bottom:22px;">
                      <span style="font-size:32px;line-height:1;">🛡️</span>
                    </div>
                    <h1 style="margin:0 0 10px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Xác Thực Đăng Nhập</h1>
                    <p style="margin:0;font-size:14px;color:#86efac;font-weight:500;">Hệ thống Quản Lý Bán Hàng</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:40px 44px 36px;">

                    <!-- Greeting -->
                    <p style="margin:0 0 8px;font-size:15px;color:#6b7280;font-weight:500;">Xin chào,</p>
                    <p style="margin:0 0 28px;font-size:20px;font-weight:700;color:#111827;">${fullName} 👋</p>

                    <p style="margin:0 0 32px;font-size:14px;color:#6b7280;line-height:1.8;">
                      Chúng tôi nhận được yêu cầu đăng nhập vào hệ thống từ tài khoản của bạn. Sử dụng mã xác thực bên dưới để hoàn tất quá trình đăng nhập.
                    </p>

                    <!-- OTP Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                      <tr>
                        <td style="background:linear-gradient(145deg,#f0fdf4,#dcfce7);border:1.5px solid #bbf7d0;border-radius:16px;padding:28px;text-align:center;">
                          <p style="margin:0 0 14px;font-size:12px;font-weight:600;color:#16a34a;letter-spacing:2.5px;text-transform:uppercase;">Mã xác thực của bạn</p>
                          <div style="display:inline-block;background:#ffffff;border-radius:12px;padding:16px 32px;box-shadow:0 4px 20px rgba(22,163,74,0.15);">
                            <span style="font-size:42px;font-weight:800;color:#15803d;letter-spacing:12px;font-family:'Courier New',monospace;">${code}</span>
                          </div>
                          <p style="margin:16px 0 0;font-size:12px;color:#16a34a;font-weight:500;">
                            ⏱&nbsp; Hiệu lực trong <strong>5 phút</strong>
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Warning cards -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                      <tr>
                        <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 18px;">
                          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
                            <strong>⚠️ Lưu ý:</strong>&nbsp; Mã này chỉ sử dụng được <strong>một lần</strong> và sẽ hết hạn sau 5 phút kể từ thời điểm gửi.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 18px;">
                          <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6;">
                            <strong>🔒 Bảo mật:</strong>&nbsp; Tuyệt đối <strong>không chia sẻ</strong> mã này với bất kỳ ai. Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.
                          </p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 44px;">
                    <div style="height:1px;background:linear-gradient(90deg,transparent,#e5e7eb,transparent);"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:28px 44px 36px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827;">Công Ty Cổ Phần Hóa Sinh Nam Việt</p>
                          <p style="margin:0;font-size:12px;color:#9ca3af;">Email tự động — vui lòng không phản hồi lại email này.</p>
                        </td>
                        <td align="right" valign="middle">
                          <div style="background:linear-gradient(135deg,#22c55e,#15803d);border-radius:10px;padding:8px 14px;display:inline-block;">
                            <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:1.5px;">NV</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Bottom note -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:#4b5563;line-height:1.6;">
                Email này được gửi tới bạn vì có yêu cầu đăng nhập từ hệ thống của Nam Việt.<br>
                © 2025 Công Ty Cổ Phần Hóa Sinh Nam Việt. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
    `;
  }
}

// Export token blacklist for middleware to use
export { tokenBlacklist };

export default new AuthService();
