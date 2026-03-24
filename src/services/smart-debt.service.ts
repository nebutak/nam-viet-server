import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
// import { logActivity } from '@utils/logger';

const prisma = new PrismaClient();

export interface DebtQueryParams {
  year?: number;          // Mặc định năm hiện tại
  page?: number;
  limit?: number;
  search?: string;        // Tìm tên, sđt, mã...
  status?: 'paid' | 'unpaid';

  assignedUserId?: number; // Lọc theo nhân viên phụ trách
  type?: 'customer' | 'supplier';
  address?: string;        // Lọc theo địa chỉ
}

// ==========================================
// 2. SYNC PARAMS (Dùng cho syncFull, syncSnap)
// ==========================================
export interface SyncDebtParams {
  customerId?: number;
  supplierId?: number;

  year?: number;          // Năm cần đồng bộ
  notes?: string;         // Ghi chú hệ thống/thủ công

  assignedUserId?: number; // Cập nhật người phụ trách (nếu có)


  adjustmentAmount?: number;
}

// ==========================================
// 3. SEND NOTICE PARAMS (⚠️ CẬP NHẬT LỚN)
// ==========================================
// Interface cũ SendEmailData quá đơn giản, không đủ cho logic mới
export interface SendDebtNoticeParams {
  id: number;                      // ID của Customer hoặc Supplier
  type: 'customer' | 'supplier';   // Loại đối tượng

  year?: number;                   // Có year => Gửi biên bản đối chiếu. Không year => Nhắc nợ hiện tại

  customEmail?: string;            // Nếu muốn gửi đè tới email khác (VD: email kế toán trưởng)
  message?: string;                // Lời nhắn thêm từ người gửi
  cc?: string[];                   // Danh sách email CC (nếu cần)
}

// ==========================================
// 4. (MỚI) DETAIL PARAMS (Dùng cho getDetail)
// ==========================================
// Giúp Controller validate chặt chẽ hơn
export interface DebtDetailParams {
  id: number;
  type: 'customer' | 'supplier';
  year?: number;
}
class SmartDebtService {
  // =========================================================================
  // 1. GET ALL (ĐÃ FIX LỖI LỌC TỈNH CHO NCC VÀ ALL)
  // =========================================================================
  async getAll(params: DebtQueryParams) {

    const { page = 1, limit = 20, search, status, year, assignedUserId, type, address } = params;
    const skip = (Number(page) - 1) * Number(limit);
    const targetYearStr = year ? String(year) : String(new Date().getFullYear());

    let data: any[] = [];
    let total = 0;

    // =========================================================================
    // A. CHIẾN LƯỢC QUERY
    // =========================================================================

    // --- 1. LỌC THEO KHÁCH HÀNG (Query bảng Customer) ---
    if (type === 'customer') {
      const where: any = { status: 'active' };

      if (search) {
        where.OR = [
          { customerName: { contains: search } },
          { customerCode: { contains: search } },
          { phone: { contains: search } }
        ];
      }
      if (assignedUserId) where.assignedUserId = Number(assignedUserId);
      if (address) where.address = { contains: address };

      if (status) {
        const debtCondition = { periodName: targetYearStr };
        if (status === 'unpaid') {
          where.debtPeriods = { some: { ...debtCondition, closingBalance: { gt: 1000 } } };
        } else {
          where.OR = [
            { debtPeriods: { none: { periodName: targetYearStr } } },
            { debtPeriods: { some: { ...debtCondition, closingBalance: { lte: 1000 } } } }
          ];
        }
      }

      const [customers, count] = await Promise.all([
        prisma.customer.findMany({
          where, skip, take: Number(limit),
          include: {
            assignedUser: { select: { id: true, fullName: true } },
            debtPeriods: { where: { periodName: targetYearStr }, take: 1 }
          },
          orderBy: { createdBy: 'desc' }
        }),
        prisma.customer.count({ where })
      ]);

      data = customers.map(c => {
        const debt = c.debtPeriods[0];
        return this._mapToDebtItem(c, debt, 'customer', targetYearStr);
      });
      total = count;
    }

    // --- 2. LỌC THEO NCC (Query bảng Supplier) ---
    else if (type === 'supplier') {
      const where: any = { status: 'active' };

      if (search) {
        where.OR = [
          { supplierName: { contains: search } },
          { supplierCode: { contains: search } },
          { phone: { contains: search } }
        ];
      }

      if (assignedUserId) where.assignedUserId = Number(assignedUserId);
      if (address) where.address = { contains: address };

      if (status) {
        const debtCondition = { periodName: targetYearStr };
        if (status === 'unpaid') {
          where.debtPeriods = { some: { ...debtCondition, closingBalance: { gt: 1000 } } };
        } else {
          where.OR = [
            { debtPeriods: { none: { periodName: targetYearStr } } },
            { debtPeriods: { some: { ...debtCondition, closingBalance: { lte: 1000 } } } }
          ];
        }
      }

      const [suppliers, count] = await Promise.all([
        prisma.supplier.findMany({
          where, skip, take: Number(limit),
          include: {
            assignedUser: { select: { id: true, fullName: true } },
            debtPeriods: { where: { periodName: targetYearStr }, take: 1 }
          }
        }),
        prisma.supplier.count({ where })
      ]);

      data = suppliers.map(s => {
        const debt = s.debtPeriods[0];
        return this._mapToDebtItem(s, debt, 'supplier', targetYearStr);
      });
      total = count;
    }

    // --- 3. TẤT CẢ (Gộp cả Khách hàng và NCC) ---
    else {
      // 1. Tạo điều kiện lọc cho Khách hàng
      const customerWhere: any = { status: 'active' };
      if (search) {
        customerWhere.OR = [
          { customerName: { contains: search } },
          { customerCode: { contains: search } },
        ];
      }
      if (assignedUserId) customerWhere.assignedUserId = Number(assignedUserId);
      if (address) customerWhere.address = { contains: address };

      // 2. Tạo điều kiện lọc cho Nhà cung cấp
      const supplierWhere: any = { status: 'active' };
      if (search) {
        supplierWhere.OR = [
          { supplierName: { contains: search } },
          { supplierCode: { contains: search } },
        ];
      }
      if (assignedUserId) supplierWhere.assignedUserId = Number(assignedUserId);
      if (address) supplierWhere.address = { contains: address };

      // 3. Query song song cả 2 bảng
      const [customers, suppliers] = await Promise.all([
        prisma.customer.findMany({
          where: customerWhere,
          include: {
            assignedUser: { select: { id: true, fullName: true } },
            debtPeriods: { where: { periodName: targetYearStr }, take: 1 }
          }
        }),
        prisma.supplier.findMany({
          where: supplierWhere,
          include: {
            assignedUser: { select: { id: true, fullName: true } },
            debtPeriods: { where: { periodName: targetYearStr }, take: 1 }
          }
        })
      ]);

      // 4. Map dữ liệu về chuẩn chung
      const allData = [
        ...customers.map(c => this._mapToDebtItem(c, c.debtPeriods[0], 'customer', targetYearStr)),
        ...suppliers.map(s => this._mapToDebtItem(s, s.debtPeriods[0], 'supplier', targetYearStr))
      ];

      // 5. Lọc theo trạng thái công nợ (nếu có)
      let filteredData = allData;
      if (status === 'unpaid') {
        // Thêm check item && ...
        filteredData = allData.filter(item => item && item.closingBalance > 1000);
      } else if (status === 'paid') {
        filteredData = allData.filter(item => item && item.closingBalance <= 1000);
      }

      // 6. Sắp xếp
      total = filteredData.length;
      data = filteredData
        .sort((a, b) => {
          // Đảm bảo a và b tồn tại, nếu không coi như bằng 0
          const valA = a?.closingBalance ?? 0;
          const valB = b?.closingBalance ?? 0;
          return valB - valA;
        })
        .slice(skip, skip + Number(limit));
    }

    const globalSummary = await this.getGlobalSummary(targetYearStr, type, assignedUserId);

    const result = {
      data, // Biến data lấy từ logic query List (bước trước)
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
        summary: globalSummary // ✅ Số liệu này luôn đúng và cố định
      }
    };

    return result;
  }

  // =========================================================================
  // 🛠️ HELPER: TÍNH TỔNG TOÀN CỤC (CỐ ĐỊNH THEO NĂM & LOẠI)
  // =========================================================================
  async getGlobalSummary(year: string, type?: string, assignedUserId?: number) {
    // Điều kiện lọc CỐ ĐỊNH: Chỉ theo Năm và Loại (Khách/NCC)
    // ⚠️ TUYỆT ĐỐI KHÔNG đưa Search Text hay Tỉnh Thành vào đây
    const where: any = { periodName: year };

    if (type === 'customer') {
      where.customerId = { not: null };
    } else if (type === 'supplier') {
      where.supplierId = { not: null };
    }

    // Nếu lọc theo User phụ trách thì Summary cũng nên theo User đó (Logic Dashboard cá nhân)
    if (assignedUserId) {
      where.OR = [
        { customer: { assignedUserId: Number(assignedUserId) } },
        { supplier: { assignedUserId: Number(assignedUserId) } }
      ];
    }

    // Thực hiện tính toán
    const agg = await prisma.debtPeriod.aggregate({
      _sum: {
        openingBalance: true,
        increasingAmount: true,
        decreasingAmount: true,
        returnAmount: true,      // Tổng trả hàng
        adjustmentAmount: true,  // Tổng điều chỉnh
        closingBalance: true
      },
      where
    });

    return {
      opening: Number(agg._sum.openingBalance || 0),
      increase: Number(agg._sum.increasingAmount || 0),
      payment: Number(agg._sum.decreasingAmount || 0),
      returnAmount: Number(agg._sum.returnAmount || 0),
      adjustmentAmount: Number(agg._sum.adjustmentAmount || 0),
      closing: Number(agg._sum.closingBalance || 0),
    };
  }

  // ---------------------------------------------------------------------------
  // HELPER: Map Data thống nhất
  // ---------------------------------------------------------------------------
  private _mapToDebtItem(obj: any, debt: any, type: 'customer' | 'supplier', year: string) {
    if (!obj) return null;
    return {
      id: debt?.id || 0, // Nếu chưa có DebtPeriod, ID = 0
      type,
      objId: obj.id,
      code: type === 'customer' ? obj.customerCode : obj.supplierCode,
      name: type === 'customer' ? obj.customerName : obj.supplierName,
      phone: obj.phone,
      location: obj.address,
      avatar: type === 'customer' ? obj.avatarUrl : null,
      assignedUser: obj.assignedUser,

      periodName: year,
      // Nếu không có debt record -> Tất cả bằng 0
      openingBalance: Number(debt?.openingBalance || 0),
      increasingAmount: Number(debt?.increasingAmount || 0),
      decreasingAmount: Number(debt?.decreasingAmount || 0),
      returnAmount: Number(debt?.returnAmount || 0),
      adjustmentAmount: Number(debt?.adjustmentAmount || 0),
      closingBalance: Number(debt?.closingBalance || 0),

      status: Number(debt?.closingBalance || 0) > 1000 ? 'unpaid' : 'paid',
      updatedAt: debt?.updatedAt || new Date().toISOString(),
      notes: debt?.notes || ''
    };
  }

  // =========================================================================
  // 2. GET DETAIL (CÁC TRƯỜNG MỚI TỪ DB THẬT)
  // =========================================================================
  async getDetail(id: number, type: 'customer' | 'supplier', year?: number) {
    const targetYear = year || new Date().getFullYear();
    const periodName = String(targetYear);

    // 🟢 LOGIC QUERY DB
    console.log(`🐢 Querying DB for Detail...`);

    const startOfYear = new Date(targetYear, 0, 1);
    const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59);

    let entityInfo: any = null;
    let debtPeriod: any = null;
    let orders: any[] = [];
    let payments: any[] = [];

    // Biến cho các nghiệp vụ mới (Trả hàng, Điều chỉnh)
    let returns: any[] = [];
    let adjustments: any[] = []; // Hiện tại chưa có bảng adjustment, để trống

    if (type === 'customer') {
      const customer = await prisma.customer.findUnique({
        where: { id: Number(id) },
        include: { assignedUser: true }
      });
      if (!customer) throw new NotFoundError('Không tìm thấy khách hàng này.');

      entityInfo = {
        id: customer.id,
        code: customer.customerCode,
        name: customer.customerName,
        phone: customer.phone,
        address: customer.address,
        email: customer.email,
        avatar: customer.avatarUrl,
        type: 'customer',
      };

      debtPeriod = await prisma.debtPeriod.findUnique({
        where: { customerId_periodName: { customerId: Number(id), periodName } }
      });

      orders = await prisma.invoice.findMany({
        where: {
          customerId: Number(id),
          orderDate: { gte: startOfYear, lte: endOfYear },
          orderStatus: { not: 'cancelled' }
        },
        orderBy: { orderDate: 'desc' },
        select: {
          id: true, orderCode: true, totalAmount: true, orderDate: true, orderStatus: true,
          notes: true
        }
      });

      payments = await prisma.paymentReceipt.findMany({
        where: {
          customerId: Number(id),
          receiptDate: { gte: startOfYear, lte: endOfYear }
        },
        orderBy: { receiptDate: 'desc' },
        select: { id: true, receiptCode: true, amount: true, receiptDate: true, notes: true }
      });

      // ✅ LẤY DỮ LIỆU TRẢ HÀNG TỪ KHO (Sale Refunds)
      const stockReturns = await prisma.stockTransaction.findMany({
        where: {
          transactionType: 'import',      // Nhập kho lại
          referenceType: 'sale_refunds',  // Khách trả hàng
          referenceId: { not: null },
          createdAt: { gte: startOfYear, lte: endOfYear },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          details: {
            include: { product: { select: { productName: true, code: true } } }
          }
        }
      });

      if (stockReturns.length > 0) {
        const orderIdsFromReturns = Array.from(
          new Set(stockReturns.map(r => r.referenceId).filter(Boolean))
        ) as number[];

        if (orderIdsFromReturns.length > 0) {
          // Chỉ lấy những trả hàng thuộc về đúng khách đang xem
          const allowedInvoices = await prisma.invoice.findMany({
            where: { id: { in: orderIdsFromReturns }, customerId: Number(id), orderStatus: { not: 'cancelled' } },
            select: { id: true }
          });
          const allowedSet = new Set(allowedInvoices.map(o => o.id));

          const allowedOrderIds = Array.from(allowedSet);
          if (allowedOrderIds.length > 0) {
            // Map unitValue cho InvoiceDetail: unitValue = lineTotal / lineQty
            const invoiceDetails = await prisma.invoiceDetail.findMany({
              where: { orderId: { in: allowedOrderIds } },
              select: { orderId: true, productId: true, quantity: true, total: true }
            });

            const unitValueMap = new Map<string, number>();
            for (const d of invoiceDetails) {
              const qty = this._toNumber(d.quantity);
              if (!qty) continue;
              const total = this._toNumber(d.total);
              unitValueMap.set(`${d.orderId}:${d.productId}`, total / qty);
            }

            const filteredReturns = stockReturns.filter(r => r.referenceId && allowedSet.has(r.referenceId));

            // Map về cấu trúc hiển thị (tính amount theo từng stockReturn)
            returns = filteredReturns.map(r => {
              const orderId = r.referenceId as number;
              let amount = 0;

              for (const det of r.details || []) {
                const unit = unitValueMap.get(`${orderId}:${det.productId}`);
                if (!unit) continue;
                amount += this._toNumber(det.quantity) * unit;
              }

              return {
                id: r.id,
                code: r.transactionCode,
                date: r.createdAt,
                amount,
                note: r.reason || r.notes || 'Khách trả hàng',
                details: r.details
              };
            });
          }
        }
      }

    } else {
      const supplier = await prisma.supplier.findUnique({
        where: { id: Number(id) },
        include: { assignedUser: true }
      });
      if (!supplier) throw new NotFoundError('Không tìm thấy nhà cung cấp này.');

      entityInfo = {
        id: supplier.id,
        code: supplier.supplierCode,
        name: supplier.supplierName,
        phone: supplier.phone,
        address: supplier.address,
        email: supplier.email,
        type: 'supplier',
        assignedUser: supplier.assignedUser,
        // Nhà cung cấp thường ít dùng tỉnh/huyện hơn, nhưng nếu model có thì thêm vào
      };

      debtPeriod = await prisma.debtPeriod.findUnique({
        where: { supplierId_periodName: { supplierId: Number(id), periodName } }
      });

      orders = await prisma.purchaseOrder.findMany({
        where: {
          supplierId: Number(id),
          orderDate: { gte: startOfYear, lte: endOfYear },
          status: { not: 'cancelled' }
        },
        orderBy: { orderDate: 'desc' },
        select: {
          id: true, poCode: true, totalAmount: true, orderDate: true, status: true,
          notes: true,
          details: {
            include: { product: { select: { id: true, productName: true, code: true } } }
          }
        }
      });

      payments = await prisma.paymentVoucher.findMany({
        where: {
          supplierId: Number(id),
          paymentDate: { gte: startOfYear, lte: endOfYear }
        },
        orderBy: { paymentDate: 'desc' },
        select: { id: true, voucherCode: true, amount: true, paymentDate: true, notes: true }
      });

      // ✅ LẤY DỮ LIỆU TRẢ HÀNG NCC TỪ KHO (Purchase Refunds)
      const stockReturns = await prisma.stockTransaction.findMany({
        where: {
          transactionType: 'export',          // Xuất trả NCC
          referenceType: 'purchase_refunds',  // Trả hàng mua
          referenceId: { not: null },
          createdAt: { gte: startOfYear, lte: endOfYear },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          details: {
            include: { product: { select: { productName: true, code: true } } }
          }
        }
      });

      if (stockReturns.length > 0) {
        const poIdsFromReturns = Array.from(
          new Set(stockReturns.map(r => r.referenceId).filter(Boolean))
        ) as number[]

        if (poIdsFromReturns.length > 0) {
          // Chỉ lấy những trả hàng thuộc về đúng nhà cung cấp đang xem
          const allowedPos = await prisma.purchaseOrder.findMany({
            where: { id: { in: poIdsFromReturns }, supplierId: Number(id), status: { not: 'cancelled' } },
            select: { id: true, taxRate: true }
          })
          const allowedSet = new Set(allowedPos.map(p => p.id))
          const allowedPoIds = Array.from(allowedSet)

          if (allowedPoIds.length > 0) {
            const taxRateMap = new Map<number, number>();
            for (const po of allowedPos) {
              taxRateMap.set(po.id, this._toNumber(po.taxRate));
            }

            const poDetails = await prisma.purchaseOrderDetail.findMany({
              where: { poId: { in: allowedPoIds } },
              select: { poId: true, productId: true, unitPrice: true }
            });

            const unitPriceMap = new Map<string, number>();
            for (const d of poDetails) {
              unitPriceMap.set(`${d.poId}:${d.productId}`, this._toNumber(d.unitPrice));
            }

            const filteredReturns = stockReturns.filter(r => r.referenceId && allowedSet.has(r.referenceId))

            returns = filteredReturns.map(r => {
              const poId = r.referenceId as number;
              let subTotalReturned = 0;

              for (const det of r.details || []) {
                const unit = unitPriceMap.get(`${poId}:${det.productId}`) || 0;
                subTotalReturned += this._toNumber(det.quantity) * unit;
              }

              const taxRate = taxRateMap.get(poId) ?? 0;
              const amount = subTotalReturned * (1 + taxRate / 100);

              return {
                id: r.id,
                code: r.transactionCode,
                date: r.createdAt,
                amount,
                note: r.reason || r.notes || 'Trả hàng NCC',
                details: r.details
              };
            });
          }
        }
      }
    }

    // Flatten Product History
    let productHistory: any[] = [];
    orders.forEach((order: any) => {
      if (order.details) {
        order.details.forEach((item: any) => {
          productHistory.push({
            orderId: order.id,
            orderCode: order.orderCode || order.poCode,
            date: order.orderDate,
            productId: item.productId,
            productName: item.product?.productName || "Sản phẩm đã xóa",
            sku: item.product?.code,
            quantity: Number(item.quantity),
            price: Number(item.unitPrice || item.price || 0),
          });
        });
      }
    });

    // Tính tổng tiền trả hàng thực tế từ DB
    const totalReturnReal = returns.reduce((sum, item) => sum + item.amount, 0);
    const totalAdjustReal = 0; // Chưa có logic adjustment

    // Logic tính Closing Balance:
    // Closing = Opening + Increase - (Payment + Return + Adjust)
    // Lưu ý: Cột decreasingAmount trong DB thường lưu tổng giảm (Payment + Return) nếu hàm Sync đã gộp.
    // Nếu hàm Sync chưa gộp return vào decreasingAmount, thì ta trừ thủ công ở đây.
    // Giả sử hàm SyncSnap đã gộp return vào decreasingAmount, thì closingBalance trong DB là đúng.
    // Nhưng để hiển thị tách bạch trên UI, ta cần:
    // - Payment (Thanh toán thuần) = decreasingAmount (DB) - Return (DB)
    // - Return = Return (DB)

    // Tuy nhiên, vì bảng DebtPeriod hiện tại CHƯA có cột returnAmount riêng,
    // và decreasingAmount đang chứa cả hai (hoặc chỉ payment tùy logic sync cũ).
    // An toàn nhất là tính toán lại closing để hiển thị realtime:

    const opening = Number(debtPeriod?.openingBalance || 0);
    const increase = Number(debtPeriod?.increasingAmount || 0);
    // Giả sử decreasingAmount trong DB chỉ là tiền thanh toán (từ PaymentReceipt/Voucher)
    // Nếu syncSnap logic cũ chỉ cộng PaymentReceipt vào decreasingAmount, thì Return chưa được trừ.
    const payment = Number(debtPeriod?.decreasingAmount || 0);

    // Vậy Closing hiển thị sẽ là:
    const closingCalculated = opening + increase - payment - totalReturnReal;

    const financials = debtPeriod ? {
      opening,
      increase,
      payment, // Đây là tiền thanh toán

      returnAmount: totalReturnReal,
      adjustmentAmount: totalAdjustReal,

      closing: closingCalculated, // Số dư cuối kỳ chính xác
      status: closingCalculated > 1000 ? 'unpaid' : 'paid'
    } : {
      opening: 0, increase: 0, payment: 0,
      returnAmount: totalReturnReal,
      adjustmentAmount: 0,
      closing: 0 - totalReturnReal, // Khách trả hàng khi chưa mua gì -> Âm nợ (Có tiền dư)
      status: 'paid'
    };

    const response = {
      info: entityInfo,
      periodName,
      hasData: !!debtPeriod || orders.length > 0,
      financials,
      history: {
        orders,
        payments,
        products: productHistory,
        returns: returns,       // Danh sách trả hàng
        adjustments: adjustments // Danh sách điều chỉnh
      }
    };

    return response;
  }

  // =================================================================
  // 1. SYNC FULL (Đồng bộ toàn bộ lịch sử)
  // =================================================================
  async syncFull(data: SyncDebtParams) {
    const { customerId, supplierId, notes, assignedUserId } = data;

    // Validate input
    if ((!customerId && !supplierId) || (customerId && supplierId)) {
      throw new ValidationError('Phải chọn một Khách hàng hoặc một Nhà cung cấp');
    }

    const targetYear = data.year || new Date().getFullYear();

    // 🟢 BƯỚC 1: GÁN TRANSACTION VÀO BIẾN 'RESULT'
    const result = await prisma.$transaction(async (tx) => {

      // 1.1. KIỂM TRA SỰ TỒN TẠI & CẬP NHẬT NGƯỜI QUẢN LÝ
      if (customerId) {
        const customer = await tx.customer.findUnique({ where: { id: Number(customerId) } });
        if (!customer) throw new NotFoundError(`Khách hàng ID ${customerId} không tồn tại`);

        if (assignedUserId) {
          await tx.customer.update({
            where: { id: Number(customerId) },
            data: { assignedUserId: Number(assignedUserId) }
          });
        }

      } else if (supplierId) {
        const supplier = await tx.supplier.findUnique({ where: { id: Number(supplierId) } });
        if (!supplier) throw new NotFoundError(`Nhà cung cấp ID ${supplierId} không tồn tại`);

        if (assignedUserId) {
          await tx.supplier.update({
            where: { id: Number(supplierId) },
            data: { assignedUserId: Number(assignedUserId) }
          });
        }
      }

      // 1.2. TÌM NĂM BẮT ĐẦU (Quét lịch sử)
      let startYear = targetYear;

      if (customerId) {
        const firstOrder = await tx.invoice.findFirst({
          where: { customerId: Number(customerId) },
          orderBy: { orderDate: 'asc' }, select: { orderDate: true }
        });
        const firstReceipt = await tx.paymentReceipt.findFirst({
          where: { customerId: Number(customerId) },
          orderBy: { receiptDate: 'asc' }, select: { receiptDate: true }
        });
        const orderYear = firstOrder ? firstOrder.orderDate.getFullYear() : targetYear;
        const receiptYear = firstReceipt ? firstReceipt.receiptDate.getFullYear() : targetYear;
        startYear = Math.min(orderYear, receiptYear);

      } else if (supplierId) {
        const firstPO = await tx.purchaseOrder.findFirst({
          where: { supplierId: Number(supplierId) },
          orderBy: { orderDate: 'asc' }, select: { orderDate: true }
        });
        const firstVoucher = await tx.paymentVoucher.findFirst({
          where: { supplierId: Number(supplierId) },
          orderBy: { paymentDate: 'asc' }, select: { paymentDate: true }
        });
        const poYear = firstPO ? firstPO.orderDate.getFullYear() : targetYear;
        const voucherYear = firstVoucher ? firstVoucher.paymentDate.getFullYear() : targetYear;
        startYear = Math.min(poYear, voucherYear);
      }

      // Fallback nếu dữ liệu tương lai
      if (startYear > targetYear) startYear = targetYear;

      console.log(`🔄 [SyncFull] Đang đồng bộ từ năm ${startYear} đến ${targetYear}...`);

      // 1.3. TÍNH SỐ DƯ ĐẦU KỲ CỦA "NĂM KHỞI THỦY"
      // (Công thức: Đầu kỳ = Tổng Mua Quá Khứ - Tổng Trả Tiền Quá Khứ - Tổng Trả Hàng Quá Khứ)
      let currentOpeningBalance = 0;
      const startOfStartYear = new Date(startYear, 0, 1);

      if (customerId) {
        // A. Tăng (Mua hàng quá khứ)
        const prevOrders = await tx.invoice.aggregate({
          where: { customerId: Number(customerId), orderDate: { lt: startOfStartYear }, orderStatus: { not: 'cancelled' } },
          _sum: { totalAmount: true }
        });

        // B. Giảm (Trả tiền quá khứ)
        const prevReceipts = await tx.paymentReceipt.aggregate({
          where: { customerId: Number(customerId), receiptDate: { lt: startOfStartYear } },
          _sum: { amount: true }
        });

        // C. Giảm (Trả hàng quá khứ) - ✅ LOGIC MỚI
        // Trả hàng tính theo createdAt (StockTransaction), không theo orderDate
        const prevReturnAmount = await this._getCustomerReturnAmountByCustomerIdAndDateRange(
          tx,
          Number(customerId),
          new Date(0),
          new Date(startOfStartYear.getTime() - 1),
        );

        currentOpeningBalance = Number(prevOrders._sum.totalAmount || 0)
          - Number(prevReceipts._sum.amount || 0)
          - prevReturnAmount;

      } else if (supplierId) {
        // A. Tăng (Mua hàng quá khứ)
        const prevPO = await tx.purchaseOrder.aggregate({
          where: { supplierId: Number(supplierId), orderDate: { lt: startOfStartYear }, status: { not: 'cancelled' } },
          _sum: { totalAmount: true }
        });
        // B. Giảm (Trả tiền quá khứ)
        const prevVouchers = await tx.paymentVoucher.aggregate({
          where: { supplierId: Number(supplierId), paymentDate: { lt: startOfStartYear } },
          _sum: { amount: true }
        });
        // C. Giảm (Trả hàng quá khứ) - ✅ LOGIC MỚI
        const prevReturnAmount = await this._getSupplierReturnAmountBySupplierIdAndDateRange(
          tx,
          Number(supplierId),
          new Date(0),
          new Date(startOfStartYear.getTime() - 1),
        );

        currentOpeningBalance = Number(prevPO._sum.totalAmount || 0)
          - Number(prevVouchers._sum.amount || 0)
          - prevReturnAmount;
      }

      // 1.4. VÒNG LẶP THỜI GIAN
      for (let y = startYear; y <= targetYear; y++) {
        const isTargetYear = y === targetYear;
        const currentNotes = isTargetYear ? notes : `Đồng bộ lịch sử tự động năm ${y}`;

        // Gọi hàm xử lý và cập nhật lại currentOpeningBalance cho vòng lặp kế tiếp
        currentOpeningBalance = await this._processSinglePeriod(
          tx,
          y,
          currentOpeningBalance,
          customerId ? Number(customerId) : undefined,
          supplierId ? Number(supplierId) : undefined,
          currentNotes
        );
      }

      // 1.5. TRẢ KẾT QUẢ TRANSACTION
      return {
        message: "Đồng bộ hoàn tất",
        year: targetYear,
        finalDebt: currentOpeningBalance
      };

    }, {
      maxWait: 10000,
      timeout: 120000
    });

    console.log(`🧹 Sync Full completed for ${customerId ? 'Customer' : 'Supplier'}`);

    // 🟢 BƯỚC 3: RETURN FINAL RESULT
    return result;
  }



  // =================================================================
  // 2. SYNC SNAP (CẬP NHẬT: GHI VÀO CỘT RIÊNG & TÍNH TRẢ HÀNG)
  // =================================================================
  async syncSnap(data: SyncDebtParams) {
    const { customerId, supplierId, notes, assignedUserId } = data;

    if ((!customerId && !supplierId) || (customerId && supplierId)) {
      throw new ValidationError('Phải chọn một Khách hàng hoặc một Nhà cung cấp');
    }

    const year = data.year || new Date().getFullYear();
    const periodName = `${year}`;
    const prevPeriodName = `${year - 1}`;
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    // 🟢 BƯỚC 1: GÁN TRANSACTION VÀO BIẾN 'RESULT'
    const result = await prisma.$transaction(async (tx) => {

      // 2.1. KIỂM TRA SỰ TỒN TẠI
      if (customerId) {
        const customer = await tx.customer.findUnique({ where: { id: Number(customerId) } });
        if (!customer) throw new NotFoundError(`Khách hàng ID ${customerId} không tồn tại`);
        if (assignedUserId) {
          await tx.customer.update({ where: { id: Number(customerId) }, data: { assignedUserId: Number(assignedUserId) } });
        }
      } else if (supplierId) {
        const supplier = await tx.supplier.findUnique({ where: { id: Number(supplierId) } });
        if (!supplier) throw new NotFoundError(`Nhà cung cấp ID ${supplierId} không tồn tại`);
        if (assignedUserId) {
          await tx.supplier.update({ where: { id: Number(supplierId) }, data: { assignedUserId: Number(assignedUserId) } });
        }
      }

      // 2.2. TÍNH NỢ ĐẦU KỲ
      let openingBalance = 0;
      let calculationMethod = 'SNAPSHOT';

      const wherePrevPeriod = customerId
        ? { customerId_periodName: { customerId: Number(customerId), periodName: prevPeriodName } }
        : { supplierId_periodName: { supplierId: Number(supplierId), periodName: prevPeriodName } };

      const prevPeriod = await tx.debtPeriod.findUnique({ where: wherePrevPeriod });

      if (prevPeriod) {
        openingBalance = Number(prevPeriod.closingBalance);
      } else {
        calculationMethod = 'AGGREGATE_FALLBACK';
        // Logic tính fallback nếu chưa có kỳ trước (Tính tổng lịch sử)
        const startOfStartYear = startOfYear;

        if (customerId) {
          const prevOrders = await tx.invoice.aggregate({
            where: { customerId: Number(customerId), orderDate: { lt: startOfStartYear }, orderStatus: { not: 'cancelled' } },
            _sum: { totalAmount: true }
          });
          const prevReceipts = await tx.paymentReceipt.aggregate({
            where: { customerId: Number(customerId), receiptDate: { lt: startOfStartYear } },
            _sum: { amount: true }
          });

          // Trả hàng quá khứ (tính theo StockTransaction.createdAt)
          const prevReturnAmount = await this._getCustomerReturnAmountByCustomerIdAndDateRange(
            tx,
            Number(customerId),
            new Date(0),
            new Date(startOfStartYear.getTime() - 1),
          );

          openingBalance =
            Number(prevOrders._sum.totalAmount || 0) -
            Number(prevReceipts._sum.amount || 0) -
            prevReturnAmount;
        } else if (supplierId) {
          const prevPO = await tx.purchaseOrder.aggregate({
            where: { supplierId: Number(supplierId), orderDate: { lt: startOfStartYear }, status: { not: 'cancelled' } },
            _sum: { totalAmount: true }
          });
          const prevVouchers = await tx.paymentVoucher.aggregate({
            where: { supplierId: Number(supplierId), paymentDate: { lt: startOfStartYear } },
            _sum: { amount: true }
          });

          // Trả hàng quá khứ (tính theo StockTransaction.createdAt)
          const prevReturnAmount = await this._getSupplierReturnAmountBySupplierIdAndDateRange(
            tx,
            Number(supplierId),
            new Date(0),
            new Date(startOfStartYear.getTime() - 1),
          );

          openingBalance =
            Number(prevPO._sum.totalAmount || 0) -
            Number(prevVouchers._sum.amount || 0) -
            prevReturnAmount;
        }
      }

      // 2.3. TÍNH PHÁT SINH TRONG KỲ
      let increasingAmount = 0; // Tăng (Mua)
      let paymentAmount = 0;    // Giảm (Tiền) -> Lưu vào decreasingAmount
      let returnAmount = 0;     // Giảm (Hàng) -> Lưu vào returnAmount
      let adjustmentAmount = 0; // Điều chỉnh -> Lưu vào adjustmentAmount

      if (customerId) {
        // A. Tăng: Đơn hàng
        const currOrders = await tx.invoice.aggregate({
          where: { customerId: Number(customerId), orderDate: { gte: startOfYear, lte: endOfYear }, orderStatus: { not: 'cancelled' } },
          _sum: { totalAmount: true }
        });
        increasingAmount = Number(currOrders._sum.totalAmount || 0);

        // B. Giảm 1: Thanh toán (Phiếu thu)
        const currReceipts = await tx.paymentReceipt.aggregate({
          where: { customerId: Number(customerId), receiptDate: { gte: startOfYear, lte: endOfYear } },
          _sum: { amount: true }
        });
        paymentAmount = Number(currReceipts._sum.amount || 0);

        // C. Giảm 2: Trả hàng (sale_refunds)
        // Tính theo thời điểm trả (StockTransaction.createdAt)
        returnAmount = await this._getCustomerReturnAmountByCustomerIdAndDateRange(
          tx,
          Number(customerId),
          startOfYear,
          endOfYear
        );

      } else if (supplierId) {
        // A. Tăng: PO
        const currPO = await tx.purchaseOrder.aggregate({
          where: { supplierId: Number(supplierId), orderDate: { gte: startOfYear, lte: endOfYear }, status: { not: 'cancelled' } },
          _sum: { totalAmount: true }
        });
        increasingAmount = Number(currPO._sum.totalAmount || 0);

        // B. Giảm 1: Thanh toán (Phiếu chi)
        const currVouchers = await tx.paymentVoucher.aggregate({
          where: { supplierId: Number(supplierId), paymentDate: { gte: startOfYear, lte: endOfYear } },
          _sum: { amount: true }
        });
        paymentAmount = Number(currVouchers._sum.amount || 0);

        // C. Giảm 2: Trả hàng (purchase_refunds)
        // Tính theo thời điểm trả (StockTransaction.createdAt)
        returnAmount = await this._getSupplierReturnAmountBySupplierIdAndDateRange(
          tx,
          Number(supplierId),
          startOfYear,
          endOfYear
        );
      }

      // 2.4. CHỐT SỐ (CÔNG THỨC MỚI)
      const closingBalance = openingBalance + increasingAmount - paymentAmount - returnAmount - adjustmentAmount;

      let finalNote = notes || '';
      if (calculationMethod === 'AGGREGATE_FALLBACK') {
        const autoNote = `(Tự động tính lại đầu kỳ do thiếu dữ liệu năm ${prevPeriodName})`;
        finalNote = finalNote ? `${finalNote} ${autoNote}` : autoNote;
      }

      // 2.5. LƯU DB (Mapping vào đúng cột mới)
      const whereClause = customerId
        ? { customerId_periodName: { customerId: Number(customerId), periodName } }
        : { supplierId_periodName: { supplierId: Number(supplierId), periodName } };

      const period = await tx.debtPeriod.upsert({
        where: whereClause,
        update: {
          openingBalance,
          increasingAmount,
          decreasingAmount: paymentAmount, // ✅ Chỉ lưu tiền
          returnAmount,                    // ✅ Lưu trả hàng riêng
          adjustmentAmount,                // ✅ Lưu điều chỉnh riêng
          closingBalance,
          updatedAt: new Date(),
          ...(notes ? { notes: finalNote } : {})
        },
        create: {
          customerId: customerId ? Number(customerId) : null,
          supplierId: supplierId ? Number(supplierId) : null,
          periodName,
          startTime: startOfYear,
          endTime: endOfYear,
          openingBalance,
          increasingAmount,
          decreasingAmount: paymentAmount,
          returnAmount,
          adjustmentAmount,
          closingBalance,
          notes: finalNote,
          isLocked: false
        }
      });

      // 2.6. CẬP NHẬT SỐ DƯ BẢNG CHÍNH (Nếu năm hiện tại)
      const currentYear = new Date().getFullYear();
      if (year >= currentYear) {
        if (customerId) {
          await tx.customer.update({
            where: { id: Number(customerId) },
            data: { currentDebt: closingBalance, debtUpdatedAt: new Date() }
          });
        } else if (supplierId) {
          await tx.supplier.update({
            where: { id: Number(supplierId) },
            data: { totalPayable: closingBalance, payableUpdatedAt: new Date() }
          });
        }
      }

      // 2.7. TRẢ KẾT QUẢ TRANSACTION
      const status = closingBalance <= 1000 ? 'paid' : 'unpaid';
      return {
        ...period,
        status,
        method: calculationMethod
      };
    });

    console.log(`🧹 Sync Snap completed for ${customerId ? 'Customer' : 'Supplier'}`);

    // 🟢 BƯỚC 3: RETURN FINAL RESULT
    return result;
  }

  // =================================================================
  // 3. SYNC FULL ALL (Chạy batch - Không cần sửa logic chính, chỉ cần helper chuẩn)
  // =================================================================
  async syncFullAll(year: number) {
    const targetYear = year || new Date().getFullYear();

    console.log(`🚀 [Batch Full] Bắt đầu đồng bộ toàn bộ dữ liệu lịch sử cho năm ${targetYear}...`);
    const start = Date.now();

    // 1. Lấy danh sách ID cần chạy (Cập nhật helper để lấy cả người trả hàng)
    const activeCustomerIds = await this._getActiveCustomerIds(targetYear);
    const activeSupplierIds = await this._getActiveSupplierIds(targetYear);

    const totalTasks = activeCustomerIds.length + activeSupplierIds.length;
    console.log(`📊 Tìm thấy ${activeCustomerIds.length} Khách hàng và ${activeSupplierIds.length} NCC có hoạt động.`);

    let successCount = 0;
    let failCount = 0;
    const errors: any[] = [];

    // 2. Chạy vòng lặp cho KHÁCH HÀNG
    for (const customerId of activeCustomerIds) {
      try {
        await this.syncFull({
          customerId,
          year: targetYear,
          notes: 'Đồng bộ hệ thống định kỳ (Batch Job)'
        });
        successCount++;
      } catch (error: any) {
        failCount++;
        console.error(`❌ Lỗi sync Customer ID ${customerId}:`, error.message);
        errors.push({ type: 'customer', id: customerId, error: error.message });
      }
    }

    // 3. Chạy vòng lặp cho NHÀ CUNG CẤP
    for (const supplierId of activeSupplierIds) {
      try {
        await this.syncFull({
          supplierId,
          year: targetYear,
          notes: 'Đồng bộ hệ thống định kỳ (Batch Job)'
        });
        successCount++;
      } catch (error: any) {
        failCount++;
        console.error(`❌ Lỗi sync Supplier ID ${supplierId}:`, error.message);
        errors.push({ type: 'supplier', id: supplierId, error: error.message });
      }
    }

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [Batch Full] Hoàn tất sau ${duration}s. Thành công: ${successCount}/${totalTasks}, Thất bại: ${failCount}`);

    return {
      year: targetYear,
      mode: 'FULL_ALL',
      totalChecked: totalTasks,
      success: successCount,
      failed: failCount,
      durationSeconds: duration,
      errors
    };
  }

  // =================================================================
  // 4. SYNC SNAP ALL (Chạy batch nhanh)
  // =================================================================
  async syncSnapAll(year: number) {
    const targetYear = year || new Date().getFullYear();
    console.log(`⚡ [Batch Snap] Bắt đầu đồng bộ nhanh toàn bộ cho năm ${targetYear}...`);

    const start = Date.now();

    const activeCustomerIds = await this._getActiveCustomerIds(targetYear);
    const activeSupplierIds = await this._getActiveSupplierIds(targetYear);

    const totalTasks = activeCustomerIds.length + activeSupplierIds.length;
    console.log(`📊 Tìm thấy ${totalTasks} đối tượng có phát sinh giao dịch trong năm.`);

    let successCount = 0;
    let failCount = 0;
    const errors: any[] = [];

    // 2. Chạy vòng lặp cho KHÁCH HÀNG
    for (const customerId of activeCustomerIds) {
      try {
        await this.syncSnap({
          customerId,
          year: targetYear,
          notes: 'Auto-sync: Cập nhật nhanh cuối ngày'
        });
        successCount++;
      } catch (error: any) {
        failCount++;
        console.error(`❌ Lỗi Snap khách ID ${customerId}:`, error.message);
        errors.push({ type: 'customer', id: customerId, error: error.message });
      }
    }

    // 3. Chạy vòng lặp cho NHÀ CUNG CẤP
    for (const supplierId of activeSupplierIds) {
      try {
        await this.syncSnap({
          supplierId,
          year: targetYear,
          notes: 'Auto-sync: Cập nhật nhanh cuối ngày'
        });
        successCount++;
      } catch (error: any) {
        failCount++;
        console.error(`❌ Lỗi Snap NCC ID ${supplierId}:`, error.message);
        errors.push({ type: 'supplier', id: supplierId, error: error.message });
      }
    }

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [Batch Snap] Hoàn tất sau ${duration}s. Thành công: ${successCount}/${totalTasks}`);

    return {
      year: targetYear,
      mode: 'SNAP_ALL',
      totalChecked: totalTasks,
      success: successCount,
      failed: failCount,
      durationSeconds: duration,
      errors
    };
  }



  // =========================================================================
  // 4. DATA INTEGRITY CHECK (THANH TRA DỮ LIỆU) - VERSION 2.0
  // =========================================================================

  /**
     * HÀM KIỂM TRA SAI SÓT (AUDIT TOOL)
     * - Check 1: Logic toán học nội bộ (Internal Math)
     * - Check 2: Tính nhất quán giữa các năm (Cross-Period Consistency)
     * - Check 3: Phát hiện kỳ bị thiếu (Missing Periods)
     */
  async checkDataIntegrity(year: number) {
    const targetYear = year || new Date().getFullYear();
    console.log(`🕵️‍♀️ [Check] Bắt đầu kiểm tra dữ liệu năm ${targetYear}...`);

    const discrepancies: any[] = [];

    // =========================================================================
    // 1. LẤY DỮ LIỆU ĐỂ SO SÁNH (Năm hiện tại & Năm trước)
    // =========================================================================
    const [currentPeriods, prevPeriods] = await Promise.all([
      prisma.debtPeriod.findMany({
        where: { periodName: String(targetYear) },
        include: { customer: true, supplier: true }
      }),
      prisma.debtPeriod.findMany({
        where: { periodName: String(targetYear - 1) },
        select: { customerId: true, supplierId: true, closingBalance: true }
      })
    ]);

    // Tạo Map tra cứu năm ngoái cho nhanh (O(1))
    // Key: "C-123" (Customer 123) hoặc "S-456" (Supplier 456)
    const prevPeriodMap = new Map<string, number>();
    prevPeriods.forEach(p => {
      const key = p.customerId ? `C-${p.customerId}` : `S-${p.supplierId}`;
      prevPeriodMap.set(key, Number(p.closingBalance));
    });

    const checkedEntityKeys = new Set<string>(); // Để kiểm tra Check 3

    // =========================================================================
    // 2. VÒNG LẶP KIỂM TRA CHÍNH (Internal & Cross-Period)
    // =========================================================================
    for (const curr of currentPeriods) {
      const isCustomer = !!curr.customerId;
      const entityId = isCustomer ? curr.customerId : curr.supplierId;
      const entityKey = isCustomer ? `C-${entityId}` : `S-${entityId}`;
      const entityName = isCustomer ? curr.customer?.customerName : curr.supplier?.supplierName;

      checkedEntityKeys.add(entityKey);

      // ---------------------------------------------------------
      // CHECK 1: LOGIC NỘI BỘ (Internal Math)
      // Công thức: Cuối = Đầu + Tăng - Giảm
      // ---------------------------------------------------------
      const calcClosing = Number(curr.openingBalance) + Number(curr.increasingAmount) - Number(curr.decreasingAmount);

      // Sai số cho phép (do làm tròn số thực) là 10 đồng
      if (Math.abs(calcClosing - Number(curr.closingBalance)) > 10) {
        discrepancies.push({
          type: 'INTERNAL_MATH_ERROR',
          id: entityId,
          typeObj: isCustomer ? 'customer' : 'supplier',
          name: entityName,
          reason: `Sai lệch công thức nội bộ năm ${targetYear}`,
          details: `Tính toán (${calcClosing}) != Lưu trữ (${curr.closingBalance})`,
          severity: 'CRITICAL'
        });
      }

      // ---------------------------------------------------------
      // CHECK 2: LIÊN KẾT KỲ TRƯỚC (Cross-Period Check)
      // Công thức: Đầu năm nay == Cuối năm ngoái
      // ---------------------------------------------------------
      if (prevPeriodMap.has(entityKey)) {
        const prevClosing = prevPeriodMap.get(entityKey) || 0;
        const currOpening = Number(curr.openingBalance);

        if (Math.abs(prevClosing - currOpening) > 10) {
          discrepancies.push({
            type: 'CROSS_PERIOD_ERROR',
            id: entityId,
            typeObj: isCustomer ? 'customer' : 'supplier',
            name: entityName,
            reason: `Đứt gãy số liệu giữa ${targetYear - 1} và ${targetYear}`,
            details: `Cuối ${targetYear - 1} (${prevClosing}) != Đầu ${targetYear} (${currOpening})`,
            severity: 'HIGH'
          });
        }
      }
    }

    // =========================================================================
    // 3. CHECK 3: PHÁT HIỆN KỲ BỊ THIẾU (Missing Periods)
    // Khách có giao dịch trong năm nhưng chưa có bản ghi trong DebtPeriod
    // =========================================================================
    const activeCustomerIds = await this._getActiveCustomerIds(targetYear);
    const activeSupplierIds = await this._getActiveSupplierIds(targetYear);

    // Kiểm tra Khách hàng
    for (const id of activeCustomerIds) {
      if (!checkedEntityKeys.has(`C-${id}`)) {
        discrepancies.push({
          type: 'MISSING_DATA',
          id: id,
          typeObj: 'customer',
          name: `Khách hàng ID ${id}`,
          reason: `Có phát sinh giao dịch năm ${targetYear} nhưng chưa có sổ công nợ`,
          details: 'Cần chạy SyncFull hoặc SyncSnap ngay',
          severity: 'MEDIUM'
        });
      }
    }

    // Kiểm tra NCC
    for (const id of activeSupplierIds) {
      if (!checkedEntityKeys.has(`S-${id}`)) {
        discrepancies.push({
          type: 'MISSING_DATA',
          id: id,
          typeObj: 'supplier',
          name: `Nhà cung cấp ID ${id}`,
          reason: `Có phát sinh giao dịch năm ${targetYear} nhưng chưa có sổ công nợ`,
          details: 'Cần chạy SyncFull hoặc SyncSnap ngay',
          severity: 'MEDIUM'
        });
      }
    }

    return {
      year: targetYear,
      totalChecked: currentPeriods.length,
      discrepanciesCount: discrepancies.length,
      discrepancies
    };
  }

  // =========================================================================
  // 5. SEND DEBT NOTICE (CẬP NHẬT: Gửi chi tiết gồm Trả hàng & Điều chỉnh)
  // =========================================================================
  // async sendDebtNotice(
  //   params: {
  //       id: number;                 // ID của Khách hàng hoặc NCC
  //       type: 'customer' | 'supplier';
  //       year?: number;              // Có năm -> Gửi biên bản đối chiếu
  //       customEmail?: string;       // Email nhận (nếu muốn gửi đè)
  //       message?: string;           // Lời nhắn thêm
  //       cc?: string[];
  //   },
  //   userId: number
  // ) {
  //   const { id, type, year, customEmail, message } = params;

  //   // 1. Lấy thông tin Đối tượng & Validate Email
  //   let recipient: any = null;
  //   let currentDebt = 0;

  //   if (type === 'customer') {
  //       const customer = await prisma.customer.findUnique({ where: { id: Number(id) } });
  //       if (!customer) throw new NotFoundError('Khách hàng không tồn tại');
  //       recipient = { name: customer.customerName, email: customer.email, code: customer.customerCode };
  //       currentDebt = Number(customer.currentDebt);
  //   } else {
  //       const supplier = await prisma.supplier.findUnique({ where: { id: Number(id) } });
  //       if (!supplier) throw new NotFoundError('Nhà cung cấp không tồn tại');
  //       recipient = { name: supplier.supplierName, email: supplier.email, code: supplier.supplierCode };
  //       currentDebt = Number(supplier.totalPayable);
  //   }

  //   const toEmail = customEmail || recipient.email;
  //   if (!toEmail) {
  //       throw new ValidationError(`Đối tượng ${recipient.name} chưa có email.`);
  //   }

  //   // 2. Chuẩn bị Dữ liệu & Nội dung Email
  //   let subject = '';
  //   let htmlContent = '';
  //   const fmt = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

  //   if (year) {
  //       // === TRƯỜNG HỢP A: Gửi Biên bản đối chiếu (Report) ===
  //       subject = `[NAM VIỆT] Biên bản đối chiếu công nợ năm ${year} - ${recipient.code}`;

  //       // 🔥 GỌI LẠI getDetail ĐỂ LẤY SỐ LIỆU ĐẦY ĐỦ (Bao gồm Return/Adjustment)
  //       const detailData = await this.getDetail(id, type, year);
  //       const fin = detailData.financials;

  //       htmlContent = `
  //           <h3>Kính gửi: ${recipient.name} (${recipient.code})</h3>
  //           <p>Chúng tôi xin gửi thông báo đối chiếu công nợ năm <strong>${year}</strong> như sau:</p>

  //           <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
  //               <tr style="background-color: #f3f4f6;">
  //                   <th>Khoản mục</th>
  //                   <th style="text-align: right;">Số tiền</th>
  //               </tr>
  //               <tr>
  //                   <td>Dư nợ đầu kỳ</td>
  //                   <td style="text-align: right;"><b>${fmt.format(fin.opening)}</b></td>
  //               </tr>
  //               <tr>
  //                   <td>Phát sinh tăng (Mua hàng)</td>
  //                   <td style="text-align: right; color: #2563eb;">+${fmt.format(fin.increase)}</td>
  //               </tr>
  //               <tr>
  //                   <td>Đã thanh toán (Tiền)</td>
  //                   <td style="text-align: right; color: #16a34a;">-${fmt.format(fin.payment)}</td>
  //               </tr>
  //               <tr>
  //                   <td>Hàng trả lại</td>
  //                   <td style="text-align: right; color: #4f46e5;">-${fmt.format(fin.returnAmount || 0)}</td>
  //               </tr>
  //               <tr>
  //                   <td>Điều chỉnh khác</td>
  //                   <td style="text-align: right; color: #9333ea;">${(fin.adjustmentAmount || 0) < 0 ? '' : '+'}${fmt.format(fin.adjustmentAmount || 0)}</td>
  //               </tr>
  //               <tr style="background-color: #fff1f2;">
  //                   <td><strong>DƯ NỢ CUỐI KỲ</strong></td>
  //                   <td style="text-align: right; color: #dc2626;"><strong>${fmt.format(fin.closing)}</strong></td>
  //               </tr>
  //           </table>

  //           <p><em>${message || ''}</em></p>
  //           <p>Vui lòng phản hồi lại email này nếu có sai sót.</p>
  //           <hr/>
  //           <p>Trân trọng,<br/>Phòng Kế Toán Nam Việt</p>
  //       `;

  //   } else {
  //       // === TRƯỜNG HỢP B: Gửi Nhắc nợ hiện tại (Reminder) ===
  //       subject = `[NAM VIỆT] Thông báo công nợ hiện tại - ${recipient.code}`;
  //       htmlContent = `
  //           <h3>Kính gửi: ${recipient.name}</h3>
  //           <p>Tính đến thời điểm hiện tại, tổng dư nợ của quý khách là:</p>
  //           <h2 style="color: #dc2626;">${fmt.format(currentDebt)}</h2>
  //           <p><em>${message || 'Vui lòng thanh toán sớm để đảm bảo tiến độ giao hàng.'}</em></p>
  //           <hr/>
  //           <p>Trân trọng,<br/>Phòng Kế Toán Nam Việt</p>
  //       `;
  //   }

  //   // 3. Gửi Email (Giả lập hoặc gọi Service thật)
  //   // await mailService.send({ to: toEmail, subject, html: htmlContent, cc: params.cc });
  //   console.log(`📧 [EMAIL MOCK] To: ${toEmail} | Subject: ${subject}`);
  //   // console.log(htmlContent); // Uncomment để debug HTML

  //   // 4. Ghi Log Hành động
  //   try {
  //       const logAction = year ? `Gửi đối chiếu năm ${year}` : `Gửi nhắc nợ (${fmt.format(currentDebt)})`;
  //       // Hàm logActivity của bạn (giữ nguyên logic cũ)
  //       logActivity(
  //           'EMAIL_DEBT',
  //           userId,
  //           type === 'customer' ? 'Customer' : 'Supplier',
  //           logAction,
  //       ); 

  //   } catch (e) {
  //       console.warn("Log activity failed:", e);
  //   }

  //   return {
  //       success: true,
  //       sentTo: toEmail,
  //       type: year ? 'PERIOD_REPORT' : 'CURRENT_REMINDER',
  //       message: `Đã gửi email thành công tới ${toEmail}`
  //   };
  // }

  // =========================================================================
  // 6. GET LIST FOR EXPORT (Hỗ trợ lọc theo Loại: 'all' | 'customer' | 'supplier')
  // =========================================================================
  async getListForExport(year: number, type: 'all' | 'customer' | 'supplier' = 'all') {
    const targetYearStr = String(year);
    let customers: any[] = [];
    let suppliers: any[] = [];

    // --- 1. LẤY DỮ LIỆU KHÁCH HÀNG (Nếu type là 'all' hoặc 'customer') ---
    if (type === 'all' || type === 'customer') {
      customers = await prisma.customer.findMany({
        where: { status: 'active' },
        include: {
          assignedUser: { select: { fullName: true } },
          debtPeriods: { where: { periodName: targetYearStr }, take: 1 }
        },
        orderBy: { customerName: 'asc' } // Sắp xếp nội bộ trước
      });
    }

    // --- 2. LẤY DỮ LIỆU NHÀ CUNG CẤP (Nếu type là 'all' hoặc 'supplier') ---
    if (type === 'all' || type === 'supplier') {
      suppliers = await prisma.supplier.findMany({
        where: { status: 'active' },
        include: {
          assignedUser: { select: { fullName: true } },
          debtPeriods: { where: { periodName: targetYearStr }, take: 1 }
        },
        orderBy: { supplierName: 'asc' } // Sắp xếp nội bộ trước
      });
    }

    // --- 3. HÀM MAPPER CHUNG (Dùng cho cả 2 đối tượng) ---
    const mapItem = (item: any, itemType: 'customer' | 'supplier') => {
      const debt = item.debtPeriods?.[0]; // Dùng optional chaining cho an toàn
      const isCustomer = itemType === 'customer';

      return {
        id: item.id,
        // Mã & Tên: Tự động lấy theo loại
        code: isCustomer ? item.customerCode : item.supplierCode,
        name: isCustomer ? item.customerName : item.supplierName,
        phone: item.phone,

        // Địa chỉ: Khách (Huyện, Tỉnh), NCC (Address full)
        location: isCustomer
          ? item.address
          : item.address,

        // Phân loại: Khách (Nhóm khách), NCC (Mặc định là 'NCC')
        category: isCustomer ? item.classification : 'Nhà Cung Cấp',

        // Người phụ trách
        pic: item.assignedUser?.fullName || '',

        // Ghi chú
        customerNotes: item.notes,

        // Số liệu tài chính (Mặc định 0 nếu không có)
        opening: Number(debt?.openingBalance || 0),
        increase: Number(debt?.increasingAmount || 0),
        returnAmt: Number(debt?.returnAmount || 0),
        adjustment: Number(debt?.adjustmentAmount || 0),
        payment: Number(debt?.decreasingAmount || 0),
        closing: Number(debt?.closingBalance || 0),
      };
    };

    // --- 4. GỘP DỮ LIỆU & TRẢ VỀ ---
    const list1 = customers.map(c => mapItem(c, 'customer'));
    const list2 = suppliers.map(s => mapItem(s, 'supplier'));

    // Gộp lại và sắp xếp chung theo tên A-Z (để danh sách hỗn hợp nhìn đẹp hơn)
    const combined = [...list1, ...list2].sort((a, b) => a.name.localeCompare(b.name));

    // Đánh số thứ tự lại từ 1
    return combined.map((item, idx) => ({ ...item, stt: idx + 1 }));
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // =================================================================
  // 🛠️ HELPER: XỬ LÝ 1 NĂM (Đã cập nhật logic Trả hàng & Ghi cột riêng)
  // =================================================================
  private async _processSinglePeriod(
    tx: any,
    year: number,
    openingBalance: number,
    customerId?: number,
    supplierId?: number,
    notes?: string
  ): Promise<number> {

    const periodName = String(year);
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    let increasingAmount = 0; // Tăng (Mua)
    let paymentAmount = 0;    // Giảm (Tiền)
    let returnAmount = 0;     // Giảm (Hàng) - ✅ Mới
    let adjustmentAmount = 0; // Điều chỉnh - ✅ Mới (Hiện tại để 0)

    if (customerId) {
      // 1. Tăng: Đơn hàng
      const orders = await tx.invoice.aggregate({
        where: { customerId, orderDate: { gte: startOfYear, lte: endOfYear }, orderStatus: { not: 'cancelled' } },
        _sum: { totalAmount: true }
      });
      increasingAmount = Number(orders._sum.totalAmount || 0);

      // 2. Giảm: Thanh toán
      const receipts = await tx.paymentReceipt.aggregate({
        where: { customerId, receiptDate: { gte: startOfYear, lte: endOfYear } },
        _sum: { amount: true }
      });
      paymentAmount = Number(receipts._sum.amount || 0);

      // 3. Giảm: Trả hàng (Sale Refunds)
      // Tính theo thời điểm trả (StockTransaction.createdAt)
      returnAmount = await this._getCustomerReturnAmountByCustomerIdAndDateRange(
        tx,
        Number(customerId),
        startOfYear,
        endOfYear
      );

    } else if (supplierId) {
      // 1. Tăng: PO
      const pos = await tx.purchaseOrder.aggregate({
        where: { supplierId, orderDate: { gte: startOfYear, lte: endOfYear }, status: { not: 'cancelled' } },
        _sum: { totalAmount: true }
      });
      increasingAmount = Number(pos._sum.totalAmount || 0);

      // 2. Giảm: Thanh toán
      const vouchers = await tx.paymentVoucher.aggregate({
        where: { supplierId, paymentDate: { gte: startOfYear, lte: endOfYear } },
        _sum: { amount: true }
      });
      paymentAmount = Number(vouchers._sum.amount || 0);

      // 3. Giảm: Trả hàng (Purchase Refunds)
      // Tính theo thời điểm trả (StockTransaction.createdAt)
      returnAmount = await this._getSupplierReturnAmountBySupplierIdAndDateRange(
        tx,
        Number(supplierId),
        startOfYear,
        endOfYear
      );
    }

    // 4. Tính Chốt sổ (Công thức chuẩn: Đầu + Tăng - TrảTiền - TrảHàng - ĐiềuChỉnh)
    const closingBalance = openingBalance + increasingAmount - paymentAmount - returnAmount - adjustmentAmount;

    // 5. Upsert vào DB (Ghi rõ ràng từng cột)
    const whereClause = customerId
      ? { customerId_periodName: { customerId, periodName } }
      : { supplierId_periodName: { supplierId, periodName } };

    await tx.debtPeriod.upsert({
      where: whereClause,
      update: {
        openingBalance,
        increasingAmount,
        decreasingAmount: paymentAmount, // ✅ Cột Tiền
        returnAmount,                    // ✅ Cột Hàng
        adjustmentAmount,                // ✅ Cột Điều chỉnh
        closingBalance,
        updatedAt: new Date(),
        ...(notes ? { notes } : {})
      },
      create: {
        customerId: customerId || null,
        supplierId: supplierId || null,
        periodName,
        startTime: startOfYear,
        endTime: endOfYear,
        openingBalance,
        increasingAmount,
        decreasingAmount: paymentAmount,
        returnAmount,
        adjustmentAmount,
        closingBalance,
        notes: notes || '',
        isLocked: false
      }
    });

    // 6. Cập nhật số dư hiện tại vào bảng Master (Customer/Supplier) nếu là năm hiện tại
    if (year === new Date().getFullYear()) {
      if (customerId) {
        await tx.customer.update({ where: { id: customerId }, data: { currentDebt: closingBalance, debtUpdatedAt: new Date() } });
      } else if (supplierId) {
        await tx.supplier.update({ where: { id: supplierId }, data: { totalPayable: closingBalance, payableUpdatedAt: new Date() } });
      }
    }

    // Trả về số dư cuối kỳ để làm đầu kỳ cho vòng lặp năm sau
    return closingBalance;
  }

  // =================================================================
  // 🛠️ HELPER: LẤY ID KHÁCH HÀNG HOẠT ĐỘNG (CẬP NHẬT MỚI)
  // =================================================================
  private async _getActiveCustomerIds(year: number): Promise<number[]> {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    // 1. Khách có đơn hàng (Mua)
    const orders = await prisma.invoice.findMany({
      where: { orderDate: { gte: startOfYear, lte: endOfYear }, orderStatus: { not: 'cancelled' } },
      select: { customerId: true },
      distinct: ['customerId']
    });

    // 2. Khách có phiếu thu (Trả tiền)
    const receipts = await prisma.paymentReceipt.findMany({
      where: { receiptDate: { gte: startOfYear, lte: endOfYear } },
      select: { customerId: true },
      distinct: ['customerId']
    });

    // 3. Khách có trả hàng (Sale Refunds từ Stock) - ✅ MỚI
    // Vì StockTransaction không có customerId trực tiếp, ta phải đi vòng: Stock -> Order -> Customer
    const stockReturns = await prisma.stockTransaction.findMany({
      where: {
        transactionType: 'import',
        referenceType: 'sale_refunds',
        createdAt: { gte: startOfYear, lte: endOfYear }
      },
      select: { referenceId: true }, // Đây là Order ID
      distinct: ['referenceId']
    });

    let returnCustomerIds: number[] = [];
    if (stockReturns.length > 0) {
      const orderIds = stockReturns.map(s => s.referenceId).filter(id => id !== null) as number[];
      if (orderIds.length > 0) {
        const ordersFromReturns = await prisma.invoice.findMany({
          where: { id: { in: orderIds } },
          select: { customerId: true },
          distinct: ['customerId']
        });
        returnCustomerIds = ordersFromReturns.map(o => o.customerId);
      }
    }

    // Gộp tất cả và lọc trùng (Set)
    const ids = new Set([
      ...orders.map(o => o.customerId),
      ...receipts.map(r => r.customerId),
      ...returnCustomerIds
    ]);

    return Array.from(ids);
  }

  // =================================================================
  // 🛠️ HELPER: LẤY ID NHÀ CUNG CẤP HOẠT ĐỘNG (CẬP NHẬT MỚI)
  // =================================================================
  private async _getActiveSupplierIds(year: number): Promise<number[]> {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    // 1. NCC có đơn đặt hàng (Mua)
    const pos = await prisma.purchaseOrder.findMany({
      where: { orderDate: { gte: startOfYear, lte: endOfYear }, status: { not: 'cancelled' } },
      select: { supplierId: true },
      distinct: ['supplierId']
    });

    // 2. NCC có phiếu chi (Trả tiền)
    const vouchers = await prisma.paymentVoucher.findMany({
      where: { paymentDate: { gte: startOfYear, lte: endOfYear } },
      select: { supplierId: true },
      distinct: ['supplierId'] // Lưu ý: voucher có thể null supplierId nếu là chi phí khác
    });
    const voucherSupplierIds = vouchers.filter(v => v.supplierId).map(v => v.supplierId!);

    // 3. NCC có trả hàng (Purchase Refunds từ Stock) - ✅ MỚI
    const stockReturns = await prisma.stockTransaction.findMany({
      where: {
        transactionType: 'export',
        referenceType: 'purchase_refunds',
        createdAt: { gte: startOfYear, lte: endOfYear }
      },
      select: { referenceId: true },
      distinct: ['referenceId']
    });

    let returnSupplierIds: number[] = [];
    if (stockReturns.length > 0) {
      const poIds = stockReturns.map(s => s.referenceId).filter(id => id !== null) as number[];
      if (poIds.length > 0) {
        const posFromReturns = await prisma.purchaseOrder.findMany({
          where: { id: { in: poIds } },
          select: { supplierId: true },
          distinct: ['supplierId']
        });
        returnSupplierIds = posFromReturns.map(p => p.supplierId);
      }
    }

    // Gộp tất cả
    const ids = new Set([
      ...pos.map(p => p.supplierId),
      ...voucherSupplierIds,
      ...returnSupplierIds
    ]);

    return Array.from(ids);
  }



  // =================================================================
  // Helpers: Tính giá trị trả hàng từ StockTransactionDetail
  // (StockTransaction không có field totalValue trong schema hiện tại)
  // =================================================================
  private _toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private async _getCustomerReturnAmountFromInvoiceIds(
    tx: any,
    invoiceIds: number[],
    start: Date,
    end: Date
  ): Promise<number> {
    if (!invoiceIds || invoiceIds.length === 0) return 0;

    const stockReturns = await tx.stockTransaction.findMany({
      where: {
        transactionType: 'import',
        referenceType: 'sale_refunds',
        referenceId: { in: invoiceIds },
        createdAt: { gte: start, lte: end },
      },
      include: { details: true },
      orderBy: { createdAt: 'desc' },
    });

    if (stockReturns.length === 0) return 0;

    // Map (orderId, productId) -> unitValue = lineTotal / lineQty
    const invoiceDetails = await tx.invoiceDetail.findMany({
      where: { orderId: { in: invoiceIds } },
      select: { orderId: true, productId: true, quantity: true, total: true },
    });

    const unitValueMap = new Map<string, number>();
    for (const d of invoiceDetails) {
      const qty = this._toNumber(d.quantity);
      if (!qty) continue;
      const total = this._toNumber(d.total);
      unitValueMap.set(`${d.orderId}:${d.productId}`, total / qty);
    }

    let totalReturn = 0;
    for (const r of stockReturns) {
      const orderId = r.referenceId;
      if (!orderId) continue;

      for (const det of r.details || []) {
        const unit = unitValueMap.get(`${orderId}:${det.productId}`);
        if (!unit) continue;
        totalReturn += this._toNumber(det.quantity) * unit;
      }
    }

    return totalReturn;
  }

  private async _getSupplierReturnAmountFromPurchaseOrderIds(
    tx: any,
    poIds: number[],
    start: Date,
    end: Date
  ): Promise<number> {
    if (!poIds || poIds.length === 0) return 0;

    const stockReturns = await tx.stockTransaction.findMany({
      where: {
        transactionType: 'export',
        referenceType: 'purchase_refunds',
        referenceId: { in: poIds },
        createdAt: { gte: start, lte: end },
      },
      include: { details: true },
      orderBy: { createdAt: 'desc' },
    });

    if (stockReturns.length === 0) return 0;

    const purchaseOrders = await tx.purchaseOrder.findMany({
      where: { id: { in: poIds } },
      select: { id: true, taxRate: true },
    });

    const taxRateMap = new Map<number, number>();
    for (const po of purchaseOrders) {
      taxRateMap.set(po.id, this._toNumber(po.taxRate));
    }

    // Map (poId, productId) -> unitPrice (pre-tax, from PurchaseOrderDetail)
    const poDetails = await tx.purchaseOrderDetail.findMany({
      where: { poId: { in: poIds } },
      select: { poId: true, productId: true, unitPrice: true },
    });

    const unitPriceMap = new Map<string, number>();
    for (const d of poDetails) {
      unitPriceMap.set(`${d.poId}:${d.productId}`, this._toNumber(d.unitPrice));
    }

    let totalReturn = 0;
    for (const r of stockReturns) {
      const poId = r.referenceId;
      if (!poId) continue;

      let subTotalReturned = 0;
      for (const det of r.details || []) {
        const unit = unitPriceMap.get(`${poId}:${det.productId}`) || 0;
        subTotalReturned += this._toNumber(det.quantity) * unit;
      }

      const taxRate = taxRateMap.get(poId) ?? 0;
      totalReturn += subTotalReturned * (1 + taxRate / 100);
    }

    return totalReturn;
  }


  // =================================================================
  // Helpers: Tính giá trị trả hàng theo thời điểm trả (StockTransaction.createdAt)
  // - Không ràng buộc theo `orderDate` (tránh lệch ở giao diện "theo tháng")
  // =================================================================
  private async _getCustomerReturnAmountByCustomerIdAndDateRange(
    tx: any,
    customerId: number,
    start: Date,
    end: Date
  ): Promise<number> {
    // Keep old helper referenced to satisfy TS "noUnusedLocals" (helper cũ vẫn còn để tham chiếu ngữ cảnh).
    void this._getCustomerReturnAmountFromInvoiceIds;

    const stockReturns = await tx.stockTransaction.findMany({
      where: {
        transactionType: 'import',
        referenceType: 'sale_refunds',
        referenceId: { not: null },
        createdAt: { gte: start, lte: end },
      },
      include: { details: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!stockReturns.length) return 0

    const orderIds = Array.from(
      new Set(stockReturns.map((r: any) => r.referenceId).filter(Boolean))
    ) as number[]
    if (!orderIds.length) return 0

    const allowedOrders = await tx.invoice.findMany({
      where: { id: { in: orderIds }, customerId: Number(customerId), orderStatus: { not: 'cancelled' } },
      select: { id: true },
    })
    const allowedSet = new Set(allowedOrders.map((o: any) => o.id))
    if (!allowedSet.size) return 0

    const invoiceDetails = await tx.invoiceDetail.findMany({
      where: { orderId: { in: Array.from(allowedSet) } },
      select: { orderId: true, productId: true, quantity: true, total: true },
    })

    const unitValueMap = new Map<string, number>()
    for (const d of invoiceDetails) {
      const qty = this._toNumber(d.quantity)
      if (!qty) continue
      const total = this._toNumber(d.total)
      unitValueMap.set(`${d.orderId}:${d.productId}`, total / qty)
    }

    let totalReturn = 0
    for (const r of stockReturns) {
      const orderId = r.referenceId
      if (!orderId || !allowedSet.has(orderId)) continue

      for (const det of r.details || []) {
        const unit = unitValueMap.get(`${orderId}:${det.productId}`)
        if (!unit) continue
        totalReturn += this._toNumber(det.quantity) * unit
      }
    }

    return totalReturn
  }

  private async _getSupplierReturnAmountBySupplierIdAndDateRange(
    tx: any,
    supplierId: number,
    start: Date,
    end: Date
  ): Promise<number> {
    // Keep old helper referenced to satisfy TS "noUnusedLocals" (helper cũ vẫn còn để tham chiếu ngữ cảnh).
    void this._getSupplierReturnAmountFromPurchaseOrderIds;

    const stockReturns = await tx.stockTransaction.findMany({
      where: {
        transactionType: 'export',
        referenceType: 'purchase_refunds',
        referenceId: { not: null },
        createdAt: { gte: start, lte: end },
      },
      include: { details: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!stockReturns.length) return 0

    const poIds = Array.from(
      new Set(stockReturns.map((r: any) => r.referenceId).filter(Boolean))
    ) as number[]
    if (!poIds.length) return 0

    const allowedPos = await tx.purchaseOrder.findMany({
      where: { id: { in: poIds }, supplierId: Number(supplierId), status: { not: 'cancelled' } },
      select: { id: true, taxRate: true },
    })
    const allowedSet = new Set(allowedPos.map((p: any) => p.id))
    if (!allowedSet.size) return 0

    const taxRateMap = new Map<number, number>()
    for (const po of allowedPos) {
      taxRateMap.set(po.id, this._toNumber(po.taxRate))
    }

    const poDetails = await tx.purchaseOrderDetail.findMany({
      where: { poId: { in: Array.from(allowedSet) } },
      select: { poId: true, productId: true, unitPrice: true },
    })

    const unitPriceMap = new Map<string, number>()
    for (const d of poDetails) {
      unitPriceMap.set(`${d.poId}:${d.productId}`, this._toNumber(d.unitPrice))
    }

    let totalReturn = 0
    for (const r of stockReturns) {
      const poId = r.referenceId
      if (!poId || !allowedSet.has(poId)) continue

      let subTotalReturned = 0
      for (const det of r.details || []) {
        const unit = unitPriceMap.get(`${poId}:${det.productId}`)
        if (!unit) continue
        subTotalReturned += this._toNumber(det.quantity) * unit
      }

      const taxRate = taxRateMap.get(poId) ?? 0
      totalReturn += subTotalReturned * (1 + taxRate / 100)
    }

    return totalReturn
  }

  private async _getCustomerReturnAmountByAssignedUserIdAndDateRange(
    tx: any,
    assignedUserId: number | undefined,
    start: Date,
    end: Date
  ): Promise<number> {
    const stockReturns = await tx.stockTransaction.findMany({
      where: {
        transactionType: 'import',
        referenceType: 'sale_refunds',
        referenceId: { not: null },
        createdAt: { gte: start, lte: end },
      },
      include: { details: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!stockReturns.length) return 0

    const orderIds = Array.from(
      new Set(stockReturns.map((r: any) => r.referenceId).filter(Boolean))
    ) as number[]
    if (!orderIds.length) return 0

    const allowedOrders = await tx.invoice.findMany({
      where: {
        id: { in: orderIds },
        orderStatus: { not: 'cancelled' },
        ...(assignedUserId
          ? { customer: { assignedUserId: Number(assignedUserId) } }
          : {}),
      },
      select: { id: true },
    })
    const allowedSet = new Set(allowedOrders.map((o: any) => o.id))
    if (!allowedSet.size) return 0

    const invoiceDetails = await tx.invoiceDetail.findMany({
      where: { orderId: { in: Array.from(allowedSet) } },
      select: { orderId: true, productId: true, quantity: true, total: true },
    })

    const unitValueMap = new Map<string, number>()
    for (const d of invoiceDetails) {
      const qty = this._toNumber(d.quantity)
      if (!qty) continue
      const total = this._toNumber(d.total)
      unitValueMap.set(`${d.orderId}:${d.productId}`, total / qty)
    }

    let totalReturn = 0
    for (const r of stockReturns) {
      const orderId = r.referenceId
      if (!orderId || !allowedSet.has(orderId)) continue

      for (const det of r.details || []) {
        const unit = unitValueMap.get(`${orderId}:${det.productId}`)
        if (!unit) continue
        totalReturn += this._toNumber(det.quantity) * unit
      }
    }

    return totalReturn
  }

  private async _getSupplierReturnAmountByAssignedUserIdAndDateRange(
    tx: any,
    assignedUserId: number | undefined,
    start: Date,
    end: Date
  ): Promise<number> {
    const stockReturns = await tx.stockTransaction.findMany({
      where: {
        transactionType: 'export',
        referenceType: 'purchase_refunds',
        referenceId: { not: null },
        createdAt: { gte: start, lte: end },
      },
      include: { details: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!stockReturns.length) return 0

    const poIds = Array.from(
      new Set(stockReturns.map((r: any) => r.referenceId).filter(Boolean))
    ) as number[]
    if (!poIds.length) return 0

    const allowedPos = await tx.purchaseOrder.findMany({
      where: {
        id: { in: poIds },
        status: { not: 'cancelled' },
        ...(assignedUserId
          ? { supplier: { assignedUserId: Number(assignedUserId) } }
          : {}),
      },
      select: { id: true, taxRate: true },
    })

    const allowedSet = new Set(allowedPos.map((p: any) => p.id))
    if (!allowedSet.size) return 0

    const taxRateMap = new Map<number, number>()
    for (const po of allowedPos) {
      taxRateMap.set(po.id, this._toNumber(po.taxRate))
    }

    const poDetails = await tx.purchaseOrderDetail.findMany({
      where: { poId: { in: Array.from(allowedSet) } },
      select: { poId: true, productId: true, unitPrice: true },
    })

    const unitPriceMap = new Map<string, number>()
    for (const d of poDetails) {
      unitPriceMap.set(`${d.poId}:${d.productId}`, this._toNumber(d.unitPrice))
    }

    let totalReturn = 0
    for (const r of stockReturns) {
      const poId = r.referenceId
      if (!poId || !allowedSet.has(poId)) continue

      let subTotalReturned = 0
      for (const det of r.details || []) {
        const unit = unitPriceMap.get(`${poId}:${det.productId}`)
        if (!unit) continue
        subTotalReturned += this._toNumber(det.quantity) * unit
      }

      const taxRate = taxRateMap.get(poId) ?? 0
      totalReturn += subTotalReturned * (1 + taxRate / 100)
    }

    return totalReturn
  }

  // =========================================================================
  // MONTHLY OBJECT LIST (Giao diện giống "Tổng hợp" nhưng chỉ tính tháng)
  // =========================================================================
  async getMonthlyObjects(
    params: {
      year?: number
      month?: number
      type?: string
      assignedUserId?: number
      page?: number
      limit?: number
      search?: string
      address?: string
      status?: 'paid' | 'unpaid'
    },
  ) {
    const {
      year,
      month,
      type,
      assignedUserId,
      page = 1,
      limit = 20,
      search,
      address,
      status,
    } = params || {}

    const targetYear = year ? Number(year) : new Date().getFullYear()
    const targetMonth = month ? Number(month) : new Date().getMonth() + 1
    const pageNum = Number(page) || 1
    const limitNum = Number(limit) || 20
    const skip = (pageNum - 1) * limitNum

    const startOfMonth = new Date(targetYear, targetMonth - 1, 1)
    const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59)
    const endOfPrev = new Date(startOfMonth.getTime() - 1)

    const allItems: any[] = []

    // ---------------------------
    // Customers
    // ---------------------------
    if (!type || type === 'customer') {
      const invoiceCustomerIds = await prisma.invoice.findMany({
        where: {
          orderDate: { lte: endOfMonth },
          orderStatus: { not: 'cancelled' },
        },
        select: { customerId: true },
        distinct: ['customerId'],
      })

      const receiptCustomerIds = await prisma.paymentReceipt.findMany({
        where: {
          receiptDate: { lte: endOfMonth },
        },
        select: { customerId: true },
        distinct: ['customerId'],
      })

      const returnTxRefs = await prisma.stockTransaction.findMany({
        where: {
          transactionType: 'import',
          referenceType: 'sale_refunds',
          createdAt: { lte: endOfMonth },
          referenceId: { not: null },
        },
        select: { referenceId: true },
        distinct: ['referenceId'],
      })

      const returnInvoiceIds = returnTxRefs
        .map((t: any) => t.referenceId)
        .filter(Boolean) as number[]

      let returnCustomerIds: { customerId: number }[] = []
      if (returnInvoiceIds.length > 0) {
        returnCustomerIds = await prisma.invoice.findMany({
          where: { id: { in: returnInvoiceIds } },
          select: { customerId: true },
          distinct: ['customerId'],
        })
      }

      const txnCustomerIdSet = new Set<number>([
        ...invoiceCustomerIds.map((x: any) => x.customerId),
        ...receiptCustomerIds.map((x: any) => x.customerId),
        ...(returnCustomerIds || []).map((x: any) => x.customerId),
      ].filter((x: any) => x !== null && x !== undefined))

      const txnCustomerIds = Array.from(txnCustomerIdSet)
      if (txnCustomerIds.length > 0) {
        const whereBase: any = { status: 'active', id: { in: txnCustomerIds } }
        if (assignedUserId) whereBase.assignedUserId = Number(assignedUserId)
        if (search) {
          whereBase.OR = [
            { customerName: { contains: search } },
            { customerCode: { contains: search } },
            { phone: { contains: search } },
          ]
        }
        if (address) whereBase.address = { contains: address }

        const customers = await prisma.customer.findMany({
          where: whereBase,
          select: {
            id: true,
            customerCode: true,
            customerName: true,
            phone: true,
            address: true,
            avatarUrl: true,
            assignedUser: { select: { id: true, fullName: true } },
          },
        })

        for (const customer of customers) {
          const customerId = customer.id

          const [incAgg, payAgg, openIncAgg, openPayAgg] = await Promise.all([
            prisma.invoice.aggregate({
              where: {
                customerId,
                orderDate: { gte: startOfMonth, lte: endOfMonth },
                orderStatus: { not: 'cancelled' },
              },
              _sum: { totalAmount: true },
            }),
            prisma.paymentReceipt.aggregate({
              where: {
                customerId,
                receiptDate: { gte: startOfMonth, lte: endOfMonth },
              },
              _sum: { amount: true },
            }),
            prisma.invoice.aggregate({
              where: {
                customerId,
                orderDate: { lt: startOfMonth },
                orderStatus: { not: 'cancelled' },
              },
              _sum: { totalAmount: true },
            }),
            prisma.paymentReceipt.aggregate({
              where: {
                customerId,
                receiptDate: { lt: startOfMonth },
              },
              _sum: { amount: true },
            }),
          ])

          const increase = Number(incAgg._sum.totalAmount || 0)
          const payment = Number(payAgg._sum.amount || 0)

          const openingSales = Number(openIncAgg._sum.totalAmount || 0)
          const openingPayments = Number(openPayAgg._sum.amount || 0)

          const returnOpening = await this._getCustomerReturnAmountByCustomerIdAndDateRange(
            prisma,
            customerId,
            new Date(0),
            endOfPrev,
          )
          const returnAmount = await this._getCustomerReturnAmountByCustomerIdAndDateRange(
            prisma,
            customerId,
            startOfMonth,
            endOfMonth,
          )

          const openingBalance = openingSales - openingPayments - returnOpening
          const closingBalance = openingBalance + increase - payment - returnAmount

          allItems.push(
            this._mapToDebtItem(
              customer,
              {
                id: 0,
                openingBalance,
                increasingAmount: increase,
                decreasingAmount: payment,
                returnAmount,
                adjustmentAmount: 0,
                closingBalance,
                updatedAt: new Date(),
                notes: '',
              },
              'customer',
              String(targetYear),
            ),
          )
        }
      }
    }

    // ---------------------------
    // Suppliers
    // ---------------------------
    if (!type || type === 'supplier') {
      const poSupplierIds = await prisma.purchaseOrder.findMany({
        where: {
          orderDate: { lte: endOfMonth },
          status: { not: 'cancelled' },
        },
        select: { supplierId: true },
        distinct: ['supplierId'],
      })

      const voucherSupplierIds = await prisma.paymentVoucher.findMany({
        where: {
          paymentDate: { lte: endOfMonth },
          supplierId: { not: null },
        },
        select: { supplierId: true },
        distinct: ['supplierId'],
      })

      const returnTxRefs = await prisma.stockTransaction.findMany({
        where: {
          transactionType: 'export',
          referenceType: 'purchase_refunds',
          createdAt: { lte: endOfMonth },
          referenceId: { not: null },
        },
        select: { referenceId: true },
        distinct: ['referenceId'],
      })

      const returnPoIds = returnTxRefs
        .map((t: any) => t.referenceId)
        .filter(Boolean) as number[]

      let returnSupplierIds: { supplierId: number }[] = []
      if (returnPoIds.length > 0) {
        returnSupplierIds = await prisma.purchaseOrder.findMany({
          where: { id: { in: returnPoIds } },
          select: { supplierId: true },
          distinct: ['supplierId'],
        })
      }

      const txnSupplierIdSet = new Set<number>([
        ...poSupplierIds.map((x: any) => x.supplierId),
        ...voucherSupplierIds.map((x: any) => x.supplierId),
        ...(returnSupplierIds || []).map((x: any) => x.supplierId),
      ].filter((x: any) => x !== null && x !== undefined))

      const txnSupplierIds = Array.from(txnSupplierIdSet)
      if (txnSupplierIds.length > 0) {
        const whereBase: any = { status: 'active', id: { in: txnSupplierIds } }
        if (assignedUserId) whereBase.assignedUserId = Number(assignedUserId)

        if (search) {
          whereBase.OR = [
            { supplierName: { contains: search } },
            { supplierCode: { contains: search } },
            { phone: { contains: search } },
          ]
        }
        if (address) whereBase.address = { contains: address }

        const suppliers = await prisma.supplier.findMany({
          where: whereBase,
          select: {
            id: true,
            supplierCode: true,
            supplierName: true,
            phone: true,
            address: true,
            assignedUser: { select: { id: true, fullName: true } },
          },
        })

        for (const supplier of suppliers) {
          const supplierId = supplier.id

          const [incAgg, payAgg, openIncAgg, openPayAgg] = await Promise.all([
            prisma.purchaseOrder.aggregate({
              where: {
                supplierId,
                orderDate: { gte: startOfMonth, lte: endOfMonth },
                status: { not: 'cancelled' },
              },
              _sum: { totalAmount: true },
            }),
            prisma.paymentVoucher.aggregate({
              where: {
                supplierId,
                paymentDate: { gte: startOfMonth, lte: endOfMonth },
              },
              _sum: { amount: true },
            }),
            prisma.purchaseOrder.aggregate({
              where: {
                supplierId,
                orderDate: { lt: startOfMonth },
                status: { not: 'cancelled' },
              },
              _sum: { totalAmount: true },
            }),
            prisma.paymentVoucher.aggregate({
              where: {
                supplierId,
                paymentDate: { lt: startOfMonth },
              },
              _sum: { amount: true },
            }),
          ])

          const increase = Number(incAgg._sum.totalAmount || 0)
          const payment = Number(payAgg._sum.amount || 0)

          const openingSales = Number(openIncAgg._sum.totalAmount || 0)
          const openingPayments = Number(openPayAgg._sum.amount || 0)

          const returnOpening = await this._getSupplierReturnAmountBySupplierIdAndDateRange(
            prisma,
            supplierId,
            new Date(0),
            endOfPrev,
          )
          const returnAmount = await this._getSupplierReturnAmountBySupplierIdAndDateRange(
            prisma,
            supplierId,
            startOfMonth,
            endOfMonth,
          )

          const openingBalance = openingSales - openingPayments - returnOpening
          const closingBalance = openingBalance + increase - payment - returnAmount

          allItems.push(
            this._mapToDebtItem(
              supplier,
              {
                id: 0,
                openingBalance,
                increasingAmount: increase,
                decreasingAmount: payment,
                returnAmount,
                adjustmentAmount: 0,
                closingBalance,
                updatedAt: new Date(),
                notes: '',
              },
              'supplier',
              String(targetYear),
            ),
          )
        }
      }
    }

    // Apply status filter (nếu có)
    let filtered = allItems.filter(Boolean)
    if (status === 'unpaid') filtered = filtered.filter(i => Number(i.closingBalance) > 1000)
    if (status === 'paid') filtered = filtered.filter(i => Number(i.closingBalance) <= 1000)

    filtered = filtered.sort((a, b) => Number(b.closingBalance) - Number(a.closingBalance))

    const total = filtered.length
    const paged = filtered.slice(skip, skip + limitNum)

    const summary = filtered.reduce(
      (acc: any, item: any) => {
        acc.opening += Number(item.openingBalance) || 0
        acc.increase += Number(item.increasingAmount) || 0
        acc.returnAmount += Number(item.returnAmount) || 0
        acc.payment += Number(item.decreasingAmount) || 0
        acc.closing += Number(item.closingBalance) || 0
        return acc
      },
      {
        opening: 0,
        increase: 0,
        returnAmount: 0,
        payment: 0,
        closing: 0,
      },
    )

    return {
      data: paged,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        summary: {
          opening: summary.opening,
          increase: summary.increase,
          payment: summary.payment,
          closing: summary.closing,
          returnAmount: summary.returnAmount,
          adjustmentAmount: 0,
        },
      },
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  // =========================================================================
  // MONTHLY BREAKDOWN (Tính công nợ theo tháng)
  // =========================================================================
  async getMonthlyBreakdown(year: number, type?: string, assignedUserId?: number) {
    const targetYear = year || new Date().getFullYear();
    const months: any[] = [];

    for (let m = 1; m <= 12; m++) {
      const startOfMonth = new Date(targetYear, m - 1, 1);
      const endOfMonth = new Date(targetYear, m, 0, 23, 59, 59);

      let increase = 0;
      let returnAmount = 0;
      let payment = 0;

      // ---- CUSTOMER ----
      if (!type || type === 'customer') {
        const customerWhere: any = {
          orderDate: { gte: startOfMonth, lte: endOfMonth },
          orderStatus: { not: 'cancelled' as const }
        };
        if (assignedUserId) {
          customerWhere.customer = { assignedUserId: Number(assignedUserId) };
        }

        const custOrders = await prisma.invoice.aggregate({
          where: customerWhere,
          _sum: { totalAmount: true }
        });
        increase += Number(custOrders._sum.totalAmount || 0);

        // Trả hàng tính theo StockTransaction.createdAt (không phụ thuộc orderDate của đơn)
        returnAmount += await this._getCustomerReturnAmountByAssignedUserIdAndDateRange(
          prisma,
          assignedUserId,
          startOfMonth,
          endOfMonth
        );

        const receiptWhere: any = {
          receiptDate: { gte: startOfMonth, lte: endOfMonth }
        };
        if (assignedUserId) {
          receiptWhere.customerRef = { assignedUserId: Number(assignedUserId) };
        }

        const custReceipts = await prisma.paymentReceipt.aggregate({
          where: receiptWhere,
          _sum: { amount: true }
        });
        payment += Number(custReceipts._sum.amount || 0);
      }

      // ---- SUPPLIER ----
      if (!type || type === 'supplier') {
        const supplierWhere: any = {
          orderDate: { gte: startOfMonth, lte: endOfMonth },
          status: { not: 'cancelled' as const }
        };
        if (assignedUserId) {
          supplierWhere.supplier = { assignedUserId: Number(assignedUserId) };
        }

        const suppOrders = await prisma.purchaseOrder.aggregate({
          where: supplierWhere,
          _sum: { totalAmount: true }
        });
        increase += Number(suppOrders._sum.totalAmount || 0);

        // Trả hàng tính theo StockTransaction.createdAt (không phụ thuộc orderDate của PO)
        returnAmount += await this._getSupplierReturnAmountByAssignedUserIdAndDateRange(
          prisma,
          assignedUserId,
          startOfMonth,
          endOfMonth
        );

        const voucherWhere: any = {
          paymentDate: { gte: startOfMonth, lte: endOfMonth },
          supplierId: { not: null }
        };
        if (assignedUserId) {
          voucherWhere.supplier = { assignedUserId: Number(assignedUserId) };
        }

        const suppVouchers = await prisma.paymentVoucher.aggregate({
          where: voucherWhere,
          _sum: { amount: true }
        });
        payment += Number(suppVouchers._sum.amount || 0);
      }

      const closing = increase - payment - returnAmount;

      months.push({
        month: m,
        monthLabel: `Tháng ${m}`,
        increase,
        returnAmount,
        payment,
        closing
      });
    }

    // Tính summary tổng
    const summary = months.reduce((acc, m) => ({
      increase: acc.increase + m.increase,
      returnAmount: acc.returnAmount + m.returnAmount,
      payment: acc.payment + m.payment,
      closing: acc.closing + m.closing
    }), { increase: 0, returnAmount: 0, payment: 0, closing: 0 });

    return { months, summary };
  }

}

export default new SmartDebtService();