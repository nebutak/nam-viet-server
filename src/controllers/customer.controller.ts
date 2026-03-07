import path from 'path';
import fs from 'fs';
import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import customerService from '@services/customer.service';

class CustomerController {
  // GET /api/customers - Get all customers
  async getAll(req: AuthRequest, res: Response) {

    //ép kiểu và set giá trị mặc định cho page và limit
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const params = {
        ...req.query,
        page,
        limit
    };
    const result = await customerService.getAll(params as any);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.meta,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/customers/:id - Get customer by ID
  async getById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const customer = await customerService.getById(id);

    res.status(200).json({
      success: true,
      data: customer,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/customers - Create new customer
  async create(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const customer = await customerService.create(req.body, userId);

    res.status(201).json({
      success: true,
      data: customer,
      message: 'Customer created successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/customers/:id - Update customer
  async update(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const customer = await customerService.update(id, req.body, userId);

    res.status(200).json({
      success: true,
      data: customer,
      message: 'Customer updated successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/customers/:id/credit-limit - Update credit limit
  async updateCreditLimit(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const customer = await customerService.updateCreditLimit(id, req.body, userId);

    res.status(200).json({
      success: true,
      data: customer,
      message: 'Credit limit updated successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // PATCH /api/customers/:id/status - Update status
  async updateStatus(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const customer = await customerService.updateStatus(id, req.body, userId);

    res.status(200).json({
      success: true,
      data: customer,
      message: 'Customer status updated successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/customers/:id/debt - Get customer debt info
  async getDebtInfo(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const debtInfo = await customerService.getDebtInfo(id);

    res.status(200).json({
      success: true,
      data: debtInfo,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/customers/overdue-debt - Get customers with overdue debt
  async getOverdueDebt(_req: AuthRequest, res: Response) {
    const customers = await customerService.getOverdueDebt();

    res.status(200).json({
      success: true,
      data: customers,
      meta: {
        total: customers.length,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/customers/:id/orders - Get customer order history
  async getOrderHistory(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await customerService.getOrderHistory(id, page, limit);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // DELETE /api/customers/:id - Delete customer
  async delete(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await customerService.delete(id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }
  // GET /api/customers/invoices
  async getCustomerInvoices(req: AuthRequest, res: Response) {
    const result = await customerService.getCustomerInvoices(req.query);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/customers/purchased-products
  async getCustomerPurchasedProducts(req: AuthRequest, res: Response) {
    const products = await customerService.getCustomerPurchasedProducts(req.query);

    res.status(200).json({
      success: true,
      data: products,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/crm/customers/:id/overview
  async getCustomerOverview(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const result = await customerService.getCustomerOverview(id);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/crm/customers/:id/timeline
  async getCustomerTimeline(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const result = await customerService.getCustomerTimeline(id, req.query);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/customers/import
  async import(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const items = req.body.items;

    if (!items || !Array.isArray(items)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
        }
      });
      return;
    }

    try {
      const result = await customerService.importCustomers(items, userId);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Customers imported successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.importErrors) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Import failed with validation errors',
            importErrors: error.importErrors,
            timestamp: new Date().toISOString(),
          }
        });
        return;
      }
      throw error;
    }
  }

  // GET /api/customers/import-template
  async downloadTemplate(req: AuthRequest, res: Response) {
    const { type } = req.query;
    const extension = type === 'excel' ? 'xlsx' : 'csv';
    const filename = `customer_import_template.${extension}`;
    const filePath = path.join(process.cwd(), 'public/templates', filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `File mẫu (${filename}) chưa được tải lên hệ thống`
        }
      });
      return;
    }

    res.download(filePath, filename);
  }
}

export default new CustomerController();
