/**
 * Seed data for Financial Report testing
 * Run: npx tsx prisma/seeds/financial-report.seed.ts
 */

import { PrismaClient, ReceiptType, FinancePaymentMethod, VoucherType, VoucherPaymentMethod } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📝 Seeding financial report test data...\n');

  // Get existing data
  const users = await prisma.user.findMany({ where: { status: 'active' } });
  if (users.length === 0) {
    console.log('❌ No users found. Please run main seed first.');
    return;
  }

  const customers = await prisma.customer.findMany({ take: 3 });
  if (customers.length === 0) {
    console.log('❌ No customers found. Please run main seed first.');
    return;
  }

  const suppliers = await prisma.supplier.findMany({ take: 3 });
  if (suppliers.length === 0) {
    console.log('❌ No suppliers found. Please run main seed first.');
    return;
  }

  const user = users[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  // Create payment receipts (THU TIỀN) for current month
  console.log('💰 Creating payment receipts...');
  
  const receipts = [
    {
      receiptCode: 'PT-2026-0001',
      receiptType: 'sales' as ReceiptType,
      customerId: customers[0]?.id || 1,
      amount: 50000000, // 50 triệu
      paymentMethod: 'transfer' as FinancePaymentMethod,
      bankName: 'Vietcombank',
      receiptDate: new Date(currentYear, currentMonth, 5),
      createdBy: user.id,
    },
    {
      receiptCode: 'PT-2026-0002',
      receiptType: 'debt_collection' as ReceiptType,
      customerId: customers[1]?.id || 2,
      amount: 25000000, // 25 triệu
      paymentMethod: 'cash' as FinancePaymentMethod,
      receiptDate: new Date(currentYear, currentMonth, 10),
      createdBy: user.id,
    },
    {
      receiptCode: 'PT-2026-0003',
      receiptType: 'sales' as ReceiptType,
      customerId: customers[2]?.id || 3,
      amount: 35000000, // 35 triệu
      paymentMethod: 'transfer' as FinancePaymentMethod,
      bankName: 'Agribank',
      receiptDate: new Date(currentYear, currentMonth, 15),
      createdBy: user.id,
    },
    {
      receiptCode: 'PT-2026-0004',
      receiptType: 'sales' as ReceiptType,
      customerId: customers[0]?.id || 1,
      amount: 18000000, // 18 triệu
      paymentMethod: 'card' as FinancePaymentMethod,
      receiptDate: new Date(currentYear, currentMonth, 20),
      createdBy: user.id,
    },
    {
      receiptCode: 'PT-2026-0005',
      receiptType: 'debt_collection' as ReceiptType,
      customerId: customers[1]?.id || 2,
      amount: 12000000, // 12 triệu
      paymentMethod: 'transfer' as FinancePaymentMethod,
      bankName: 'Techcombank',
      receiptDate: new Date(currentYear, currentMonth, 25),
      createdBy: user.id,
    },
  ];

  for (const receipt of receipts) {
    await prisma.paymentReceipt.upsert({
      where: { receiptCode: receipt.receiptCode },
      update: {},
      create: receipt,
    });
    console.log(`  ✅ Created receipt: ${receipt.receiptCode} - ${receipt.amount.toLocaleString('vi-VN')} VNĐ`);
  }

  // Create payment vouchers (CHI TIỀN) for current month
  console.log('💸 Creating payment vouchers...');

  const vouchers = [
    {
      voucherCode: 'PC-2026-0001',
      voucherType: 'supplier_payment' as VoucherType,
      supplierId: suppliers[0]?.id || 1,
      expenseAccount: 'Mua hàng',
      amount: 40000000, // 40 triệu
      paymentMethod: 'transfer' as VoucherPaymentMethod,
      bankName: 'Vietcombank',
      paymentDate: new Date(currentYear, currentMonth, 3),
      createdBy: user.id,
    },
    {
      voucherCode: 'PC-2026-0002',
      voucherType: 'salary' as VoucherType,
      supplierId: null,
      expenseAccount: 'Lương nhân viên',
      amount: 25000000, // 25 triệu
      paymentMethod: 'transfer' as VoucherPaymentMethod,
      bankName: 'Vietinbank',
      paymentDate: new Date(currentYear, currentMonth, 8),
      createdBy: user.id,
    },
    {
      voucherCode: 'PC-2026-0003',
      voucherType: 'operating_cost' as VoucherType,
      supplierId: null,
      expenseAccount: 'Chi phí vận hành',
      amount: 8000000, // 8 triệu
      paymentMethod: 'cash' as VoucherPaymentMethod,
      paymentDate: new Date(currentYear, currentMonth, 12),
      createdBy: user.id,
    },
    {
      voucherCode: 'PC-2026-0004',
      voucherType: 'supplier_payment' as VoucherType,
      supplierId: suppliers[1]?.id || 2,
      expenseAccount: 'Mua hàng',
      amount: 15000000, // 15 triệu
      paymentMethod: 'transfer' as VoucherPaymentMethod,
      bankName: 'Agribank',
      paymentDate: new Date(currentYear, currentMonth, 18),
      createdBy: user.id,
    },
    {
      voucherCode: 'PC-2026-0005',
      voucherType: 'operating_cost' as VoucherType,
      supplierId: null,
      expenseAccount: 'Chi phí điện nước',
      amount: 3500000, // 3.5 triệu
      paymentMethod: 'transfer' as VoucherPaymentMethod,
      bankName: 'EVN',
      paymentDate: new Date(currentYear, currentMonth, 22),
      createdBy: user.id,
    },
    {
      voucherCode: 'PC-2026-0006',
      voucherType: 'other' as VoucherType,
      supplierId: null,
      expenseAccount: 'Chi phí khác',
      amount: 2000000, // 2 triệu
      paymentMethod: 'cash' as VoucherPaymentMethod,
      paymentDate: new Date(currentYear, currentMonth, 28),
      createdBy: user.id,
    },
  ];

  for (const voucher of vouchers) {
    await prisma.paymentVoucher.upsert({
      where: { voucherCode: voucher.voucherCode },
      update: {},
      create: voucher,
    });
    console.log(`  ✅ Created voucher: ${voucher.voucherCode} - ${voucher.amount.toLocaleString('vi-VN')} VNĐ`);
  }

  // Tạo CashFund theo ngày để biểu đồ "Dòng tiền" có dữ liệu
  console.log('📒 Creating cash fund (sổ quỹ) entries...');
  const dateMap = new Map<string, { receipts: number; payments: number }>();

  for (const r of receipts) {
    const d = (r.receiptDate as Date).toISOString().split('T')[0];
    const cur = dateMap.get(d) || { receipts: 0, payments: 0 };
    cur.receipts += r.amount;
    dateMap.set(d, cur);
  }
  for (const v of vouchers) {
    const d = (v.paymentDate as Date).toISOString().split('T')[0];
    const cur = dateMap.get(d) || { receipts: 0, payments: 0 };
    cur.payments += v.amount;
    dateMap.set(d, cur);
  }

  let runningBalance = 0;
  const sortedDates = Array.from(dateMap.keys()).sort();
  for (const dateStr of sortedDates) {
    const { receipts: dayReceipts, payments: dayPayments } = dateMap.get(dateStr)!;
    const fundDate = new Date(dateStr + 'T00:00:00.000Z');
    const openingBalance = runningBalance;
    runningBalance += dayReceipts - dayPayments;
    await prisma.cashFund.upsert({
      where: { fundDate },
      update: {
        openingBalance,
        totalReceipts: dayReceipts,
        totalPayments: dayPayments,
        closingBalance: runningBalance,
      },
      create: {
        fundDate,
        openingBalance,
        totalReceipts: dayReceipts,
        totalPayments: dayPayments,
        closingBalance: runningBalance,
      },
    });
    console.log(`  ✅ CashFund ${dateStr}: Thu ${(dayReceipts / 1e6).toFixed(0)}M, Chi ${(dayPayments / 1e6).toFixed(0)}M`);
  }

  // Summary
  const totalReceipts = receipts.reduce((sum, r) => sum + r.amount, 0);
  const totalPayments = vouchers.reduce((sum, v) => sum + v.amount, 0);
  const netCashFlow = totalReceipts - totalPayments;

  console.log('\n📊 Financial Summary for current month:');
  console.log(`   Tổng thu: ${totalReceipts.toLocaleString('vi-VN')} VNĐ`);
  console.log(`   Tổng chi: ${totalPayments.toLocaleString('vi-VN')} VNĐ`);
  console.log(`   Lợi nhuận: ${netCashFlow.toLocaleString('vi-VN')} VNĐ`);
  console.log('\n✅ Financial report seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
