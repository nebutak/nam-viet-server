// import { PrismaClient, Prisma } from '@prisma/client';
// import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
// import { logActivity } from '@utils/logger';

// const prisma = new PrismaClient();

// interface ReconciliationQueryParams {
//   page?: number;
//   limit?: number;
//   search?: string;
//   customerId?: number;
//   supplierId?: number;
//   reconciliationType?: 'monthly' | 'quarterly' | 'yearly';
//   status?: 'pending' | 'confirmed' | 'disputed';
//   period?: string;
//   fromDate?: string;
//   toDate?: string;
//   sortBy?: string;
//   sortOrder?: 'asc' | 'desc';
// }

// interface CreateReconciliationData {
//   reconciliationType: 'monthly' | 'quarterly' | 'yearly';
//   period: string;
//   customerId?: number;
//   supplierId?: number;
//   reconciliationDate: string;
//   notes?: string;
// }

// interface ConfirmReconciliationData {
//   confirmedByName: string;
//   confirmedByEmail: string;
//   discrepancyReason?: string;
//   notes?: string;
// }

// interface SendEmailData {
//   recipientEmail: string;
//   recipientName: string;
//   message?: string;
// }

// class DebtReconciliationService {
//   async getAll(params: ReconciliationQueryParams) {
//     const {
//       page = 1,
//       limit = 20,
//       search,
//       customerId,
//       supplierId,
//       reconciliationType,
//       status,
//       period,
//       fromDate,
//       toDate,
//       sortBy = 'reconciliationDate',
//       sortOrder = 'desc',
//     } = params;

//     const pageNumber = Number(page) || 1;
//     const limitNumber = Number(limit) || 20;
//     const skip = (pageNumber - 1) * limit;

//     const where: Prisma.DebtReconciliationWhereInput = {};

//     if (search) {
//       where.OR = [
//         { reconciliationCode: { contains: search } },
//         { confirmedByName: { contains: search } },
//         { confirmedByEmail: { contains: search } },
//       ];
//     }

//     if (customerId) {
//       where.customerId = Number(customerId);
//     }

//     if (supplierId) {
//       where.supplierId = Number(supplierId);
//     }

//     if (reconciliationType) {
//       where.reconciliationType = reconciliationType;
//     }

//     if (status) {
//       where.status = status;
//     }

//     if (period) {
//       where.period = period;
//     }

//     if (fromDate || toDate) {
//       where.reconciliationDate = {};
//       if (fromDate) {
//         where.reconciliationDate.gte = new Date(fromDate);
//       }
//       if (toDate) {
//         where.reconciliationDate.lte = new Date(toDate);
//       }
//     }

//     const [reconciliations, total] = await Promise.all([
//       prisma.debtReconciliation.findMany({
//         where,
//         skip,
//         take: limitNumber,
//         orderBy: { [sortBy]: sortOrder },
//         include: {
//           customer: {
//             select: {
//               id: true,
//               customerName: true,
//               contactPerson: true,
//               email: true,
//               phone: true,
//             },
//           },
//           supplier: {
//             select: {
//               id: true,
//               supplierName: true,
//               contactName: true,
//               email: true,
//               phone: true,
//             },
//           },
//           creator: {
//             select: {
//               id: true,
//               employeeCode: true,
//               fullName: true,
//             },
//           },
//           approver: {
//             select: {
//               id: true,
//               employeeCode: true,
//               fullName: true,
//             },
//           },
//         },
//       }),
//       prisma.debtReconciliation.count({ where }),
//     ]);

//     return {
//       data: reconciliations,
//       meta: {
//         total,
//         pageNumber,
//         limitNumber,
//         totalPages: Math.ceil(total / limit),
//       },
//     };
//   }

//   async getById(id: number) {
//     const reconciliation = await prisma.debtReconciliation.findUnique({
//       where: { id },
//       include: {
//         customer: {
//           select: {
//             id: true,
//             customerName: true,
//             contactPerson: true,
//             email: true,
//             phone: true,
//             address: true,
//           },
//         },
//         supplier: {
//           select: {
//             id: true,
//             supplierName: true,
//             contactName: true,
//             email: true,
//             phone: true,
//             address: true,
//           },
//         },
//         creator: {
//           select: {
//             id: true,
//             employeeCode: true,
//             fullName: true,
//           },
//         },
//         approver: {
//           select: {
//             id: true,
//             employeeCode: true,
//             fullName: true,
//           },
//         },
//       },
//     });

//     if (!reconciliation) {
//       throw new NotFoundError('Debt reconciliation not found');
//     }

//     return reconciliation;
//   }

//   private generateReconciliationCode(type: string, period: string): string {
//     const typePrefix = type === 'monthly' ? 'M' : type === 'quarterly' ? 'Q' : 'Y';
//     return `DCCT-${typePrefix}-${period}`;
//   }

//   private async calculateCustomerDebt(
//     customerId: number,
//     period: string,
//     reconciliationType: string
//   ) {
//     const { startDate, endDate } = this.parsePeriod(period, reconciliationType);

//     const openingBalanceResult = await prisma.$queryRaw<Array<{ debt: number }>>`
//       SELECT COALESCE(SUM(total_amount - paid_amount), 0) as debt
//       FROM invoices
//       WHERE customer_id = ${customerId}
//         AND order_date < ${startDate}
//         AND order_status != 'cancelled'
//     `;
//     const openingBalance = Number(openingBalanceResult[0]?.debt || 0);

//     const transactionsResult = await prisma.$queryRaw<Array<{ amount: number }>>`
//       SELECT COALESCE(SUM(total_amount), 0) as amount
//       FROM invoices
//       WHERE customer_id = ${customerId}
//         AND order_date >= ${startDate}
//         AND order_date <= ${endDate}
//         AND order_status != 'cancelled'
//     `;
//     const transactionsAmount = Number(transactionsResult[0]?.amount || 0);

//     const paymentResult = await prisma.$queryRaw<Array<{ amount: number }>>`
//       SELECT COALESCE(SUM(amount), 0) as amount
//       FROM payment_receipts
//       WHERE customer_id = ${customerId}
//         AND receipt_date >= ${startDate}
//         AND receipt_date <= ${endDate}
//         AND receipt_type = 'debt_payment'
//         AND is_posted = true
//     `;
//     const paymentAmount = Number(paymentResult[0]?.amount || 0);

//     const closingBalance = openingBalance + transactionsAmount - paymentAmount;

//     return {
//       openingBalance,
//       transactionsAmount,
//       paymentAmount,
//       closingBalance,
//     };
//   }

//   private async calculateSupplierDebt(
//     supplierId: number,
//     period: string,
//     reconciliationType: string
//   ) {
//     const { startDate, endDate } = this.parsePeriod(period, reconciliationType);

//     const openingBalanceResult = await prisma.$queryRaw<Array<{ debt: number }>>`
//       SELECT COALESCE(SUM(total_amount - paid_amount), 0) as debt
//       FROM purchase_orders
//       WHERE supplier_id = ${supplierId}
//         AND order_date < ${startDate}
//         AND order_status != 'cancelled'
//     `;
//     const openingBalance = Number(openingBalanceResult[0]?.debt || 0);

//     const transactionsResult = await prisma.$queryRaw<Array<{ amount: number }>>`
//       SELECT COALESCE(SUM(total_amount), 0) as amount
//       FROM purchase_orders
//       WHERE supplier_id = ${supplierId}
//         AND order_date >= ${startDate}
//         AND order_date <= ${endDate}
//         AND order_status != 'cancelled'
//     `;
//     const transactionsAmount = Number(transactionsResult[0]?.amount || 0);

//     const paymentResult = await prisma.$queryRaw<Array<{ amount: number }>>`
//       SELECT COALESCE(SUM(amount), 0) as amount
//       FROM payment_vouchers
//       WHERE supplier_id = ${supplierId}
//         AND receipt_date >= ${startDate}
//         AND receipt_date <= ${endDate}
//         AND voucher_type = 'supplier_payment'
//         AND is_posted = true
//     `;
//     const paymentAmount = Number(paymentResult[0]?.amount || 0);

//     const closingBalance = openingBalance + transactionsAmount - paymentAmount;

//     return {
//       openingBalance,
//       transactionsAmount,
//       paymentAmount,
//       closingBalance,
//     };
//   }

//   private parsePeriod(period: string, reconciliationType: string) {
//     let startDate: Date;
//     let endDate: Date;

//     if (reconciliationType === 'monthly') {
//       const year = parseInt(period.substring(0, 4));
//       const month = parseInt(period.substring(4, 6)) - 1;
//       startDate = new Date(year, month, 1);
//       endDate = new Date(year, month + 1, 0);
//     } else if (reconciliationType === 'quarterly') {
//       const year = parseInt(period.substring(0, 4));
//       const quarter = parseInt(period.substring(5, 6));
//       const startMonth = (quarter - 1) * 3;
//       startDate = new Date(year, startMonth, 1);
//       endDate = new Date(year, startMonth + 3, 0);
//     } else {
//       const year = parseInt(period);
//       startDate = new Date(year, 0, 1);
//       endDate = new Date(year, 11, 31);
//     }

//     return { startDate, endDate };
//   }

//   async create(data: CreateReconciliationData, userId: number) {
//     if (!data.customerId && !data.supplierId) {
//       throw new ValidationError('Either customerId or supplierId must be provided');
//     }

//     if (data.customerId && data.supplierId) {
//       throw new ValidationError('Cannot provide both customerId and supplierId');
//     }

//     if (data.customerId) {
//       const customer = await prisma.customer.findUnique({
//         where: { id: data.customerId },
//       });
//       if (!customer) {
//         throw new NotFoundError('Customer not found');
//       }
//       if (customer.status !== 'active') {
//         throw new ValidationError('Customer is not active');
//       }
//     }

//     if (data.supplierId) {
//       const supplier = await prisma.supplier.findUnique({
//         where: { id: data.supplierId },
//       });
//       if (!supplier) {
//         throw new NotFoundError('Supplier not found');
//       }
//       if (supplier.status !== 'active') {
//         throw new ValidationError('Supplier is not active');
//       }
//     }

//     const reconciliationCode = this.generateReconciliationCode(
//       data.reconciliationType,
//       data.period
//     );

//     const existing = await prisma.debtReconciliation.findFirst({
//       where: {
//         reconciliationType: data.reconciliationType,
//         period: data.period,
//         ...(data.customerId ? { customerId: data.customerId } : {}),
//         ...(data.supplierId ? { supplierId: data.supplierId } : {}),
//       },
//     });

//     if (existing) {
//       throw new ConflictError(
//         `Reconciliation already exists for this ${data.reconciliationType} period`
//       );
//     }

//     const debtData = data.customerId
//       ? await this.calculateCustomerDebt(data.customerId, data.period, data.reconciliationType)
//       : await this.calculateSupplierDebt(data.supplierId!, data.period, data.reconciliationType);

//     return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
//       const reconciliation = await tx.debtReconciliation.create({
//         data: {
//           reconciliationCode,
//           reconciliationType: data.reconciliationType,
//           period: data.period,
//           customerId: data.customerId,
//           supplierId: data.supplierId,
//           openingBalance: debtData.openingBalance,
//           transactionsAmount: debtData.transactionsAmount,
//           paymentAmount: debtData.paymentAmount,
//           closingBalance: debtData.closingBalance,
//           discrepancyAmount: 0,
//           status: 'pending',
//           reconciliationDate: new Date(data.reconciliationDate),
//           notes: data.notes,
//           createdBy: userId,
//         },
//         include: {
//           customer: true,
//           supplier: true,
//           creator: {
//             select: {
//               id: true,
//               employeeCode: true,
//               fullName: true,
//             },
//           },
//         },
//       });

//       logActivity(
//         'CREATE',
//         userId,
//         'DebtReconciliation',
//         `Created ${data.reconciliationType} reconciliation ${reconciliationCode}`
//       );

//       return reconciliation;
//     });
//   }

//   async confirm(id: number, data: ConfirmReconciliationData, userId: number) {
//     const reconciliation = await prisma.debtReconciliation.findUnique({
//       where: { id },
//     });

//     if (!reconciliation) {
//       throw new NotFoundError('Debt reconciliation not found');
//     }

//     if (reconciliation.status === 'confirmed') {
//       throw new ValidationError('Reconciliation is already confirmed');
//     }

//     return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
//       const updated = await tx.debtReconciliation.update({
//         where: { id },
//         data: {
//           confirmedByName: data.confirmedByName,
//           confirmedByEmail: data.confirmedByEmail,
//           confirmedAt: new Date(),
//           status: 'confirmed',
//           discrepancyReason: data.discrepancyReason,
//           notes: data.notes || reconciliation.notes,
//           approvedBy: userId,
//           approvedAt: new Date(),
//         },
//         include: {
//           customer: true,
//           supplier: true,
//           creator: {
//             select: {
//               id: true,
//               employeeCode: true,
//               fullName: true,
//             },
//           },
//           approver: {
//             select: {
//               id: true,
//               employeeCode: true,
//               fullName: true,
//             },
//           },
//         },
//       });

//       logActivity(
//         'UPDATE',
//         userId,
//         'DebtReconciliation',
//         `Confirmed reconciliation ${reconciliation.reconciliationCode}`
//       );

//       return updated;
//     });
//   }

//   async dispute(id: number, reason: string, userId: number) {
//     const reconciliation = await prisma.debtReconciliation.findUnique({
//       where: { id },
//     });

//     if (!reconciliation) {
//       throw new NotFoundError('Debt reconciliation not found');
//     }

//     if (reconciliation.status === 'confirmed') {
//       throw new ValidationError('Cannot dispute a confirmed reconciliation');
//     }

//     return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
//       const updated = await tx.debtReconciliation.update({
//         where: { id },
//         data: {
//           status: 'disputed',
//           discrepancyReason: reason,
//           approvedBy: userId,
//           approvedAt: new Date(),
//         },
//         include: {
//           customer: true,
//           supplier: true,
//           creator: {
//             select: {
//               id: true,
//               employeeCode: true,
//               fullName: true,
//             },
//           },
//         },
//       });

//       logActivity(
//         'UPDATE',
//         userId,
//         'DebtReconciliation',
//         `Disputed reconciliation ${reconciliation.reconciliationCode}: ${reason}`
//       );

//       return updated;
//     });
//   }

//   async getByCustomer(customerId: number) {
//     const customer = await prisma.customer.findUnique({
//       where: { id: customerId },
//     });

//     if (!customer) {
//       throw new NotFoundError('Customer not found');
//     }

//     const reconciliations = await prisma.debtReconciliation.findMany({
//       where: { customerId },
//       orderBy: { reconciliationDate: 'desc' },
//       include: {
//         customer: {
//           select: {
//             id: true,
//             customerName: true,
//             contactPerson: true,
//             email: true,
//           },
//         },
//         creator: {
//           select: {
//             id: true,
//             employeeCode: true,
//             fullName: true,
//           },
//         },
//       },
//     });

//     return reconciliations;
//   }

//   async getBySupplier(supplierId: number) {
//     const supplier = await prisma.supplier.findUnique({
//       where: { id: supplierId },
//     });

//     if (!supplier) {
//       throw new NotFoundError('Supplier not found');
//     }

//     const reconciliations = await prisma.debtReconciliation.findMany({
//       where: { supplierId },
//       orderBy: { reconciliationDate: 'desc' },
//       include: {
//         supplier: {
//           select: {
//             id: true,
//             supplierName: true,
//             contactName: true,
//             email: true,
//           },
//         },
//         creator: {
//           select: {
//             id: true,
//             employeeCode: true,
//             fullName: true,
//           },
//         },
//       },
//     });

//     return reconciliations;
//   }

//   async sendEmail(id: number, emailData: SendEmailData, userId: number) {
//     const reconciliation = await this.getById(id);

//     // TODO: Implement actual email sending with nodemailer
//     // This is a placeholder that logs the activity

//     logActivity(
//       'EMAIL',
//       userId,
//       'DebtReconciliation',
//       `Sent reconciliation ${reconciliation.reconciliationCode} to ${emailData.recipientEmail}`
//     );

//     return {
//       message: 'Email sent successfully',
//       recipient: emailData.recipientEmail,
//       reconciliationCode: reconciliation.reconciliationCode,
//     };
//   }

//   async getSummary(fromDate?: string, toDate?: string) {
//     const where: Prisma.DebtReconciliationWhereInput = {};

//     if (fromDate || toDate) {
//       where.reconciliationDate = {};
//       if (fromDate) {
//         where.reconciliationDate.gte = new Date(fromDate);
//       }
//       if (toDate) {
//         where.reconciliationDate.lte = new Date(toDate);
//       }
//     }

//     const [total, pending, confirmed, disputed] = await Promise.all([
//       prisma.debtReconciliation.count({ where }),
//       prisma.debtReconciliation.count({ where: { ...where, status: 'pending' } }),
//       prisma.debtReconciliation.count({ where: { ...where, status: 'confirmed' } }),
//       prisma.debtReconciliation.count({ where: { ...where, status: 'disputed' } }),
//     ]);

//     const totalDiscrepancy = await prisma.debtReconciliation.aggregate({
//       where: { ...where, status: 'disputed' },
//       _sum: {
//         discrepancyAmount: true,
//       },
//     });

//     return {
//       totalReconciliations: total,
//       byStatus: {
//         pending,
//         confirmed,
//         disputed,
//       },
//       totalDiscrepancy: totalDiscrepancy._sum.discrepancyAmount || 0,
//     };
//   }
// }

// export default new DebtReconciliationService();
