import { PrismaClient } from '@prisma/client';

export async function seedInvoices(prisma: PrismaClient, adminId: number) {
  const customers = await prisma.customer.findMany({ take: 30 });
  const products = await prisma.product.findMany({ take: 10 });
  
  const staff = await prisma.user.findFirst({ where: { role: { roleKey: 'sales_staff' } } });
  const staffId = staff?.id || adminId;

  for (let i = 1; i <= 30; i++) {
    const randomCustomer = customers[Math.floor(Math.random() * customers.length)];
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    
    // Đảm bảo có dữ liệu tham chiếu
    if (!randomCustomer || !randomProduct) break;

    // Sử dụng basePrice thay vì price (theo Schema của Product)
    const price = Number(randomProduct.basePrice || randomProduct.price || 100000);
    const quantity = 1;
    const subTotal = price * quantity; 
    const taxAmount = subTotal * 0.1; // VAT 10%
    const totalAmount = subTotal + taxAmount;

    await prisma.invoice.create({
      data: {
        orderCode: `DH-2024-${i.toString().padStart(4, '0')}`,
        customerId: randomCustomer.id,
        orderDate: new Date(2024, 2, (i % 28) + 1), // Rải rác trong tháng 3/2024
        // Kiểm tra enum OrderStatus: pending, preparing, delivering, completed, cancelled
        orderStatus: i % 5 === 0 ? 'completed' : 'pending',
        totalAmount: totalAmount,
        amount: subTotal,
        taxAmount: taxAmount,
        // Kiểm tra enum PaymentStatus: unpaid, partial, paid
        paymentStatus: i % 3 === 0 ? 'paid' : 'unpaid',
        createdBy: staffId,
        // Tạo luôn chi tiết đơn hàng (InvoiceDetail)
        details: {
          create: [
            {
              productId: randomProduct.id,
              quantity: quantity,
              price: price,
              total: subTotal,
              taxAmount: taxAmount
            }
          ]
        }
      }
    });
  }
  console.log('✅ Đã seed 30 hóa đơn (Invoice/Sales Order) kèm chi tiết.');
}
