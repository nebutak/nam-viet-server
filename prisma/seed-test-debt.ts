import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Bắt đầu tạo dữ liệu test Công Nợ Khách Hàng (Dựa trên qlbh.sql)...');

    // Lấy dữ liệu cơ sở CÓ SẴN từ DB
    const user = await prisma.user.findFirst({ where: { status: 'active' } });

    // Kiểm tra khách hàng
    const customer = await prisma.customer.findFirst({ where: { status: { in: ['active', 'inactive'] } } });
    // Lấy 1 kho ngẫu nhiên
    const warehouse = await prisma.warehouse.findFirst({ where: { status: 'active' } });
    // Lấy 1 sản phẩm ngẫu nhiên đang status active
    const product = await prisma.product.findFirst({ where: { status: 'active' } });

    if (!customer || !user || !product || !warehouse) {
        console.error('❌ Lỗi: Thiếu dữ liệu cơ sở (Khách hàng, User, Kho hoặc Sản phẩm). Vui lòng đảm bảo đã import qlbh.sql thành công.');
        return;
    }

    const warehouseId = warehouse.id;

    // Set thời gian (Năm hiện tại)
    const currentYear = new Date().getFullYear();
    const dateStrSO = `${currentYear}-05-15T10:00:00.000Z`;
    const dateStrPM = `${currentYear}-05-18T10:00:00.000Z`;

    // ==========================================
    // 1. TẠO ĐƠN MUA HÀNG (Tăng nợ)
    // Khách mua 10 sản phẩm, mỗi sản phẩm giá 1 M -> Tổng: 10 M
    // ==========================================
    console.log('📦 Đang tạo Đơn hàng (SalesOrder)...');
    const salesOrder = await prisma.salesOrder.create({
        data: {
            orderCode: `SO-TEST-${Date.now()}`,
            customerId: customer.id,
            warehouseId: warehouseId,
            orderDate: new Date(dateStrSO),
            salesChannel: 'retail',
            totalAmount: 10000000,
            paidAmount: 0,
            paymentMethod: 'cash',
            paymentStatus: 'unpaid',
            orderStatus: 'completed',
            createdBy: user.id,
            notes: 'Đơn hàng test công nợ tự động',
            details: {
                create: [
                    {
                        productId: product.id,
                        warehouseId: warehouseId,
                        quantity: 10,
                        unitPrice: 1000000,
                        discountPercent: 0,
                    }
                ]
            }
        }
    });

    // ==========================================
    // 2. TẠO PHIẾU THU TIỀN (Thanh toán - Giảm nợ)
    // Khách thanh toán 3.000.000
    // ==========================================
    console.log('💰 Đang tạo Phiếu thu (PaymentReceipt)...');
    await prisma.paymentReceipt.create({
        data: {
            receiptCode: `PT-TEST-${Date.now()}`,
            receiptType: 'debt_collection',
            customerId: customer.id,
            orderId: salesOrder.id,
            amount: 3000000,
            paymentMethod: 'cash',
            receiptDate: new Date(dateStrPM),
            isPosted: true,
            isVerified: true,
            notes: 'Thanh toán tiền mặt cho đơn hàng test tự động',
            createdBy: user.id,
        }
    });

    // ==========================================
    // 3. TẠO PHIẾU NHẬP KHO TRẢ HÀNG (Giảm nợ)
    // Khách trả lại 2 sản phẩm (Trị giá 2.000.000)
    // ==========================================
    console.log('↩️ Đang tạo Phiếu trả hàng (StockTransaction trả lại)...');
    await prisma.stockTransaction.create({
        data: {
            transactionCode: `NK-RET-${Date.now()}`,
            transactionType: 'import',
            warehouseId: warehouseId,
            referenceType: 'sale_refunds',
            referenceId: salesOrder.id, // Liên kết chặt với SO để hệ thống Client hiện đúng mã tham chiếu
            totalValue: 2000000,
            reason: 'Khách trả lại 2 sản phẩm do lỗi',
            status: 'completed',
            createdBy: user.id,
            details: {
                create: [
                    {
                        productId: product.id,
                        warehouseId: warehouseId,
                        quantity: 2,
                        unitPrice: 1000000,
                        notes: 'Hàng lỗi nhẹ test'
                    }
                ]
            }
        }
    });

    console.log('✅ Đã tạo thành công dữ liệu test:');
    console.log(` - Khách hàng: ${customer.customerName} (ID: ${customer.id})`);
    console.log(` - Mua hàng: 10.000.000 VNĐ`);
    console.log(` - Thanh toán: 3.000.000 VNĐ`);
    console.log(` - Trả hàng: 2.000.000 VNĐ`);
    console.log('👉 Vui lòng truy cập giao diện web, chọn khách hàng này và thực hiện "Tính lại toàn bộ" để kiểm tra tính năng công nợ.');
}

main()
    .catch((e) => {
        console.error('❌ Lỗi khi tạo dữ liệu test:', e);
        // process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
