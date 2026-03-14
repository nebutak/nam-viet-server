import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import stockTransactionService from '@services/stock-transaction.service';
import { ApiResponse } from '@custom-types/common.type';

class StockTransactionController {
  // GET /api/stock-transactions
  async getAll(req: AuthRequest, res: Response) {
    const result = await stockTransactionService.getAll(req.query as any);

    const response: ApiResponse = {
      success: true,
      data: result.data,
      meta: {
        ...result.meta,
        page: Number(result.meta.page),
        limit: Number(result.meta.limit),
      },
      message: result.message,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/stock-transactions/:id
  async getById(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const transaction = await stockTransactionService.getById(parseInt(id));

    const response: ApiResponse = {
      success: true,
      data: transaction,
      message: 'Success',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/stock-transactions/import
  async createImport(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    const transaction = await stockTransactionService.createImport(data, userId);

    const response: ApiResponse = {
      success: true,
      data: transaction,
      message: 'Giao dịch nhập kho được tạo thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // POST /api/stock-transactions/export
  async createExport(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    const transaction = await stockTransactionService.createExport(data, userId);

    const response: ApiResponse = {
      success: true,
      data: transaction,
      message: 'Export transaction created successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // POST /api/stock-transactions/transfer
  async createTransfer(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    const transaction = await stockTransactionService.createTransfer(data, userId);

    const response: ApiResponse = {
      success: true,
      data: transaction,
      message: 'Transfer transaction created successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // POST /api/stock-transactions/disposal
  async createDisposal(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    const transaction = await stockTransactionService.createDisposal(data, userId);

    const response: ApiResponse = {
      success: true,
      data: transaction,
      message: 'Disposal transaction created successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // POST /api/stock-transactions/stocktake
  async createStocktake(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    const transaction = await stockTransactionService.createStocktake(data, userId);

    const response: ApiResponse = {
      success: true,
      data: transaction,
      message: 'Stocktake transaction created successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // PUT /api/stock-transactions/:id/post
  async post(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const { notes } = req.body;

    const transaction = await stockTransactionService.postTransaction(parseInt(id), userId, notes);

    const response: ApiResponse = {
      success: true,
      data: transaction,
      message: 'Giao dịch đã được ghi sổ thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }


  // GET /api/stock-transactions/card/:warehouseId/:productId
  async getStockCard(req: AuthRequest, res: Response) {
    const { warehouseId, productId } = req.params;
    const { startDate, endDate } = req.query;

    const stockCard = await stockTransactionService.getStockCard(
      parseInt(warehouseId),
      parseInt(productId),
      startDate as string,
      endDate as string
    );

    const response: ApiResponse = {
      success: true,
      data: stockCard,
      message: 'Success',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/stock-transactions/quick-adjust
  async quickAdjustInventory(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    const result = await stockTransactionService.quickAdjustInventory(data, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Điều chỉnh tồn kho thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }
}

export default new StockTransactionController();
