import { Request, Response } from 'express';
import customerAuthService from '@services/customer-auth.service';

class CustomerAuthController {
  // POST /api/customer-portal/auth/register
  async register(req: Request, res: Response) {
    const result = await customerAuthService.register(req.body);
    res.status(201).json({
      success: true,
      data: result.customer,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/customer-portal/auth/login
  async login(req: Request, res: Response) {
    const result = await customerAuthService.login(req.body);
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/customer-portal/auth/google
  async googleLogin(req: Request, res: Response) {
    const result = await customerAuthService.googleLogin(req.body);
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/customer-portal/auth/logout
  async logout(req: Request, res: Response) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
    const result = await customerAuthService.logout(token);
    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export default new CustomerAuthController();
