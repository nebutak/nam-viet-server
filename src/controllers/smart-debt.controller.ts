import { Request, Response, NextFunction } from 'express';
import debtService from '../services/smart-debt.service';
import { ValidationError } from '../utils/errors';

// Interface mở rộng cho Request (đã qua middleware Auth)
export interface AuthRequest extends Request {
  user?: {
    id: number;
    roleId: number;
    // ... các field khác
  };
}

class SmartDebtController {

  // =========================================================================
  // 1. NHÓM READ (Lấy dữ liệu hiển thị)
  // =========================================================================

  /**
   * GET /api/smart-debt
   * Lấy danh sách công nợ (Master View - Từ bảng DebtPeriod)
   * Query: page, limit, search, status, year, type, assignedUserId...
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status, year, assignedUserId, type, address } = req.query;

      const result = await debtService.getAll({
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search: search as string,
        status: status as 'paid' | 'unpaid',
        year: year ? Number(year) : undefined,
        assignedUserId: assignedUserId ? Number(assignedUserId) : undefined,
        type: type as 'customer' | 'supplier',
        address: address as string
      });

      res.status(200).json({
        success: true,
        data: (result as any).data,
        meta: (result as any).meta,
        timestamp: new Date().toISOString(),
      });
      console.log('SmartDebtController.getAll executed with data:', (result as any).data);
    } catch (error) {
      next(error);
    }
  }

  /**
     * GET /api/smart-debt/export-list
     * Params: year (number), type ('all' | 'customer' | 'supplier')
     */
  async exportList(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Lấy tham số từ Query String
      const { year, type } = req.query;

      const targetYear = year ? Number(year) : new Date().getFullYear();

      // 2. Validate và gán mặc định cho 'type'
      // Nếu user gửi linh tinh hoặc không gửi -> mặc định là 'all'
      const exportType = (type === 'customer' || type === 'supplier') ? type : 'all';

      // 3. Gọi Service với tham số mới
      const data = await debtService.getListForExport(targetYear, exportType);

      res.status(200).json({
        success: true,
        data: data,
        message: `Đã lấy danh sách in (${exportType}) cho năm ${targetYear}.`
      });

      console.log(`SmartDebtController.exportList executed for year ${targetYear} and type ${exportType} with data:`, data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/smart-debt/:id
   * Lấy chi tiết công nợ & lịch sử giao dịch
   * ⚠️ THAY ĐỔI: Cần truyền thêm ?type=customer hoặc ?type=supplier
   * URL VD: /api/smart-debt/10?type=customer&year=2025
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params; // Đây là CustomerID hoặc SupplierID
      const { year, type } = req.query;

      if (!type || (type !== 'customer' && type !== 'supplier')) {
        throw new ValidationError("Vui lòng truyền tham số type='customer' hoặc 'supplier'");
      }

      const data = await debtService.getDetail(
        Number(id),
        type as 'customer' | 'supplier',
        year ? Number(year) : undefined
      );

      res.status(200).json({
        success: true,
        data: data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // 2. NHÓM SYNC - SINGLE (Xử lý 1 đối tượng)
  // =========================================================================

  /**
   * POST /api/smart-debt/sync-snap
   * Chế độ: NHANH (Snapshot)
   * Body: { customerId, supplierId, notes, year }
   */
  async syncSnap(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { customerId, supplierId, notes, year, assignedUserId } = req.body;
      const targetYear = year || new Date().getFullYear();

      if (!customerId && !supplierId) {
        throw new ValidationError('Vui lòng chọn Khách hàng hoặc Nhà cung cấp');
      }

      // SyncSnap chạy rất nhanh nên có thể await trực tiếp
      const data = await debtService.syncSnap({
        customerId: customerId ? Number(customerId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        year: Number(targetYear),
        notes,
        assignedUserId: assignedUserId ? Number(assignedUserId) : undefined
      });

      res.status(200).json({
        success: true,
        message: `Đã cập nhật nhanh số liệu năm ${targetYear}`,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/smart-debt/sync-full
   * Chế độ: CHẬM (Full History)
   * Body: { customerId, supplierId, notes, year }
   */
  async syncFull(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { customerId, supplierId, notes, year, assignedUserId } = req.body;
      const targetYear = year || new Date().getFullYear();

      if (!customerId && !supplierId) {
        throw new ValidationError('Vui lòng chọn Khách hàng hoặc Nhà cung cấp');
      }

      // 🚀 FIRE & FORGET (Chạy nền)
      debtService.syncFull({
        customerId: customerId ? Number(customerId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        year: Number(targetYear),
        notes,
        assignedUserId: assignedUserId ? Number(assignedUserId) : undefined
      })
        .then(() => console.log(`✅ [Background] SyncFull hoàn tất cho ${customerId ? 'C-' + customerId : 'S-' + supplierId}`))
        .catch((err) => console.error(`❌ [Background] Lỗi SyncFull:`, err));

      res.status(202).json({
        success: true,
        message: "Hệ thống đang xử lý đồng bộ sâu trong nền. Vui lòng kiểm tra lại sau ít phút.",
        background: true
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // 3. NHÓM SYNC - BATCH (Xử lý hàng loạt)
  // =========================================================================

  /**
   * POST /api/smart-debt/sync-snap-batch
   * Chế độ: NHANH TOÀN BỘ
   */
  async syncSnapBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const year = req.body.year || new Date().getFullYear();

      // 🚀 FIRE & FORGET
      debtService.syncSnapAll(Number(year))
        .then((r) => console.log(`✅ [Batch Snap] Hoàn tất: ${r.success}/${r.totalChecked}`))
        .catch((e) => console.error(`❌ [Batch Snap] Lỗi:`, e));

      res.status(202).json({
        success: true,
        message: `Đã kích hoạt đồng bộ nhanh toàn hệ thống năm ${year}.`,
        background: true
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/smart-debt/sync-full-batch
   * Chế độ: BẢO TRÌ TOÀN BỘ
   */
  async syncFullBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const year = req.body.year || new Date().getFullYear();

      // 🚀 FIRE & FORGET
      debtService.syncFullAll(Number(year))
        .then((r) => console.log(`✅ [Batch Full] Hoàn tất: ${r.success}/${r.totalChecked}`))
        .catch((e) => console.error(`❌ [Batch Full] Lỗi:`, e));

      res.status(202).json({
        success: true,
        message: `Đã kích hoạt chế độ BẢO TRÌ hệ thống năm ${year}.`,
        background: true
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // 4. TIỆN ÍCH KHÁC (Check Integrity, Email, PDF)
  // =========================================================================

  /**
   * GET /api/smart-debt/check-integrity
   * Kiểm tra sai lệch dữ liệu
   */
  async checkIntegrity(req: Request, res: Response, next: NextFunction) {
    try {
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

      const result = await debtService.checkDataIntegrity(year);

      res.status(200).json({
        success: true,
        message: result.discrepanciesCount > 0
          ? `Cảnh báo: Phát hiện ${result.discrepanciesCount} sai lệch dữ liệu!`
          : 'Dữ liệu toàn vẹn, không có sai lệch.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  // /**
  //  * POST /api/smart-debt/:id/email
  //  * Gửi thông báo công nợ (Nhắc nợ hoặc Đối chiếu năm)
  //  * Body: { type, year, message, customEmail... }
  //  */
  // async sendEmail(req: AuthRequest, res: Response, next: NextFunction) {
  //   try {
  //     const { id } = req.params;
  //     // ✅ Cập nhật: Lấy thêm type, year từ body
  //     const { type, year, message, customEmail } = req.body;
  //     const userId = req.user?.id; 

  //     if (!userId) {
  //       res.status(401).json({ success: false, message: "Không xác định được người gửi." });
  //       return;
  //     }

  //     if (!type || (type !== 'customer' && type !== 'supplier')) {
  //       throw new ValidationError("Thiếu tham số type ('customer' hoặc 'supplier')");
  //     }

  //     // Gọi Service mới (sendDebtNotice)
  //     const result = await debtService.sendDebtNotice({
  //         id: Number(id),
  //         type,
  //         year: year ? Number(year) : undefined,
  //         message,
  //         customEmail
  //     }, userId);

  //     res.status(200).json({
  //       success: true,
  //       message: result.message,
  //       data: result,
  //       timestamp: new Date().toISOString(),
  //     });
  //   } catch (error) {
  //     next(error);
  //   }
  // }

  /**
   * GET /api/smart-debt/:id/pdf
   * Xuất dữ liệu in ấn
   * Query: ?type=customer&year=2025
   */
  async exportPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { year, type } = req.query;

      if (!type || (type !== 'customer' && type !== 'supplier')) {
        throw new ValidationError("Thiếu tham số type");
      }

      const data = await debtService.getDetail(
        Number(id),
        type as 'customer' | 'supplier',
        year ? Number(year) : undefined
      );

      res.status(200).json({
        success: true,
        data: data,
        message: 'Ready for printing',
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new SmartDebtController();