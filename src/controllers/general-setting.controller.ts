import { Request, Response } from 'express';
import generalSettingService from '@services/general-setting.service';
import { AppError } from '@utils/errors';
import { ErrorCode } from '@custom-types/common.type';
import os from 'os';
import fs from 'fs';
import path from 'path';

export class GeneralSettingController {
  async getSystemInfo(_req: Request, res: Response) {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const formatBytes = (bytes: number) => {
        const gb = bytes / (1024 ** 3);
        return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
      };
      const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${d}d ${h}h ${m}m`;
      };

      // Đọc package.json để lấy dependencies
      let dependencies: Record<string, string> = {};
      let devDependencies: Record<string, string> = {};
      try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        dependencies = pkg.dependencies || {};
        devDependencies = pkg.devDependencies || {};
      } catch { /* bỏ qua nếu không đọc được */ }

      return res.status(200).json({
        success: true,
        data: {
          payload: {
            serverInfo: {
              platform: `${os.type()} (${os.platform()})`,
              architecture: os.arch(),
              cpuCount: os.cpus().length,
              totalMemory: formatBytes(totalMem),
              freeMemory: formatBytes(freeMem),
              uptime: formatUptime(os.uptime()),
              hostname: os.hostname(),
            },
            processInfo: {
              nodeVersion: process.version,
              cwd: process.cwd(),
              memoryUsage: formatBytes(process.memoryUsage().rss),
              uptime: formatUptime(process.uptime()),
              environment: process.env.NODE_ENV || 'development',
            },
            dependencies,
            devDependencies,
          },
        },
        message: 'Lấy thông tin hệ thống thành công',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Có lỗi xảy ra',
      });
    }
  }

  async getGeneralSetting(_req: Request, res: Response) {
    try {
      const setting = await generalSettingService.getGeneralSetting();

      return res.status(200).json({
        success: true,
        data: setting,
        message: 'Lấy cài đặt chung thành công',
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Có lỗi xảy ra',
      });
    }
  }

  async updateGeneralSetting(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { brandName, logo, name, email, phone, address, taxCode, website, banks } = req.body;

      // Validate required fields
      if (!brandName || !name || !email || !phone || !address || !taxCode || !website) {
        throw new AppError(
          'Vui lòng điền đầy đủ các trường bắt buộc',
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      const setting = await generalSettingService.updateGeneralSetting(
        {
          brandName,
          logo,
          name,
          email,
          phone,
          address,
          taxCode,
          website,
          banks,
        },
        userId
      );

      return res.status(200).json({
        success: true,
        data: setting,
        message: 'Cập nhật cài đặt chung thành công',
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Có lỗi xảy ra',
      });
    }
  }
}

export default new GeneralSettingController();
