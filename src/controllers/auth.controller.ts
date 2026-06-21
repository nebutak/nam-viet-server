import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import authService from '@services/auth.service';
import { ApiResponse } from '@custom-types/common.type';
class AuthController {
  // POST /api/auth/login
  async login(req: AuthRequest, res: Response) {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;

    const result = await authService.login(email, password, ipAddress);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/auth/logout
  async logout(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const token = req.headers.authorization?.substring(7) || '';

    const result = await authService.logout(userId, token);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }



  // PUT /api/auth/change-password
  async changePassword(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const { oldPassword, newPassword } = req.body;

    const result = await authService.changePassword(userId, oldPassword, newPassword);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/auth/forgot-password
  async forgotPassword(req: AuthRequest, res: Response) {
    const { email } = req.body;

    const result = await authService.forgotPassword(email);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  //POST /api/auth/reset-password
  async resetPassword(req: AuthRequest, res: Response) {
    const { token, newPassword } = req.body;

    const result = await authService.resetPassword(token, newPassword);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/auth/authenticated
  async authenticated(req: AuthRequest, res: Response) {
    const userId = req.user!.id;

    const user = await authService.getCurrentUser(userId);

    const response: ApiResponse = {
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/auth/verify-otp
  async verifyOTP(req: AuthRequest, res: Response) {
    const { email, code } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await authService.verifyOTPAndLogin(email, code, ipAddress, userAgent);

    // Return the token as string to match crm-template AuthSlice expectation
    const response: ApiResponse = {
      success: true,
      data: result.token,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/auth/resend-otp
  async resendOTP(req: AuthRequest, res: Response) {
    const { email } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;

    const result = await authService.resendOTPCode(email, ipAddress);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }
}

export default new AuthController();
