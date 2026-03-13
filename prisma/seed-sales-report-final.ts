import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * ═══════════════════════════════════════════════════════════════
 * SEED DATA FOR SALES REPORT TESTING - FINAL VERSION
 * ═══════════════════════════════════════════════════════════════
 * 
 * Tạo dữ liệu test có thể tính toán chính xác để verify Sales Report
 * 
 * QUAN TRỌNG: Ghi nhớ tất cả số liệu để verify sau!
 */

async function main() {
  console.log('🌱 Seeding Sales Report Test Data (Final Version)...\n');

  try {
    // =====================================================
    // 0. LẤY USER CÓ SẴN TỪ DATABASE
    // =====================================================
    console.log('👥 Getting existing users from database...');
    
    const adminUser = await prisma.user.findFirst({
      where: { email: 'leeminhkang@gmail.com' }
    });

    const salesStaff1 = await prisma.user.findFirst({
      where: { email: 'sales@company.com' }
    });

    const salesStaff2 = await prisma.user.findFirst({
      where: { email: 'hanhlanganime@gmail.com' }
    });

    if (!adminUser || !salesStaff1 || !salesStaff2) {
      throw new Error('❌ Không tìm thấy user cần thiết trong database. Vui lòng chạy seed chính thức trước!');
    }

    console.log(`✅ Found admin: ${adminUser.email}`);
    console.log(`✅ Found sales staff 1: ${salesStaff1.email}`);
    console.log(`✅ Found sales staff 2: ${salesStaff2.email}\n`);

    // =====================================================
    // 1. LẤY WAREHOUSE CÓ SẴN
    // =====================================================
    console.log('🏪 Getting existing warehouses...');
    
    const warehouse1 = await prisma.warehouse.findFirst({
      where: { status: 'active' }
    });

    if (!warehouse1) {
      throw new Error('❌ Không tìm thấy warehouse. Vui lòng chạy seed chính thức trước!');
    }

    console.log(`✅ Using warehouse: ${warehouse1.warehouseName}\n`);

    // =====================================================
    // 2. XÓA DỮ LIỆU TEST CŨ (NẾU CÓ)
    // =====================================================
    console.log('🧹 Cleaning old test data...');
    
    // Xóa invoices test cũ (theo orderCode pattern)
    await prisma.invoiceDetail.deleteMany({
      where: {
        order: {
          orderCode: {
            startsWith: 'TEST-2026-'
          }
        }
      }
    });

    await prisma.invoice.deleteMany({
      where: {
        orderCode: {
          startsWith: 'TEST-2026-'
        }
      }
    });

    // Xóa customers test cũ
    await prisma.customer.deleteMany({
      where: {
        customerCode: {
          in: ['TEST-KH001', 'TEST-KH002', 'TEST-KH003']
        }
      }
    });

    // Xóa products test cũ
    await prisma.inventory.deleteMany({
      where: {
        product: {
          code: {
            in: ['TEST-LAPTOP-001', 'TEST-MOUSE-001', 'TEST-KEYBOARD-001']
          }
        }
      }
    });

    await prisma.product.deleteMany({
      where: {
        code: {
          in: ['TEST-LAPTOP-001', 'TEST-MOUSE-001', 'TEST-KEYBOARD-001']
        }
      }
    });

    console.log('✅ Cleaned old test data\n');

    // =====================================================
    // 3. LẤY CATEGORY CÓ SẴN
    // =====================================================
    console.log('📦 Getting existing category...');
    
    let category = await prisma.category.findFirst({
      where: { status: 'active' }
    });

    if (!category) {
      // Tạo category mới nếu chưa có
      category = await prisma.category.create({
        data: {
          categoryCode: 'TEST-ELEC',
          categoryName: 'Điện tử (Test)',
          status: 'active',
        }
      });
      console.log('✅ Created test category');
    } else {
      console.log(`✅ Using category: ${category.categoryName}`);
    }
    console.log('');

    // =====================================================
    // 4. TẠO PRODUCTS (3 sản phẩm với giá rõ ràng)
    // =====================================================
    console.log('📦 Creating test products...');
    
    const product1 = await prisma.product.create({
      data: {
        code: 'TEST-LAPTOP-001',
        productName: 'Laptop Dell Inspiron (Test)',
        categoryId: category.id,
        basePrice: 15000000, // Cost: 15M
        price: 20000000,     // Sell: 20M → Profit: 5M/unit
        minStockLevel: 10,
        status: 'active',
        createdBy: adminUser.id,
      }
    });

    const product2 = await prisma.product.create({
      data: {
        code: 'TEST-MOUSE-001',
        productName: 'Chuột Logitech MX (Test)',
        categoryId: category.id,
        basePrice: 800000,   // Cost: 800K
        price: 1200000,      // Sell: 1.2M → Profit: 400K/unit
        minStockLevel: 50,
        status: 'active',
        createdBy: adminUser.id,
      }
    });

    const product3 = await prisma.product.create({
      data: {
        code: 'TEST-KEYBOARD-001',
        productName: 'Bàn phím Mechanical (Test)',
        categoryId: category.id,
        basePrice: 1500000,  // Cost: 1.5M
        price: 2000000,      // Sell: 2M → Profit: 500K/unit
        minStockLevel: 30,
        status: 'active',
        createdBy: adminUser.id,
      }
    });

    console.log('✅ Created 3 test products');
    console.log(`   - ${product1.productName}: Cost ${product1.basePrice.toLocaleString()} → Sell ${product1.price.toLocaleString()}`);
    console.log(`   - ${product2.productName}: Cost ${product2.basePrice.toLocaleString()} → Sell ${product2.price.toLocaleString()}`);
    console.log(`   - ${product3.productName}: Cost ${product3.basePrice.toLocaleString()} → Sell ${product3.price.toLocaleString()}\n`);

    // =====================================================
    // 5. TẠO INVENTORY
    // =====================================================
    console.log('📊 Creating inventory...');
    
    await Promise.all([
      prisma.inventory.create({
        data: { 
          warehouseId: warehouse1.id, 
          productId: product1.id, 
          quantity: 100,
          reservedQuantity: 0,
          updatedBy: adminUser.id,
        }
      }),
      prisma.inventory.create({
        data: { 
          warehouseId: warehouse1.id, 
          productId: product2.id, 
          quantity: 200,
          reservedQuantity: 0,
          updatedBy: adminUser.id,
        }
      }),
      prisma.inventory.create({
        data: { 
          warehouseId: warehouse1.id, 
          productId: product3.id, 
          quantity: 150,
          reservedQuantity: 0,
          updatedBy: adminUser.id,
        }
      }),
    ]);

    console.log('✅ Created inventory records\n');

    // =====================================================
    // 6. TẠO CUSTOMERS (3 khách hàng)
    // =====================================================
    console.log('👤 Creating test customers...');
    
    const customer1 = await prisma.customer.create({
      data: {
        customerCode: 'TEST-KH001',
        customerName: 'Công ty TNHH ABC (Test)',
        customerType: 'company',
        classification: 'wholesale',
        phone: '0281234567',
        email: 'abc.test@company.com',
        address: '789 Lê Lợi, Q1, TP.HCM',
        creditLimit: 100000000,
        currentDebt: 0,
        status: 'active',
        createdBy: adminUser.id,
      }
    });

    const customer2 = await prisma.customer.create({
      data: {
        customerCode: 'TEST-KH002',
        customerName: 'Nguyễn Văn X (Test)',
        customerType: 'individual',
        classification: 'retail',
        phone: '0901111111',
        address: '321 Trần Hưng Đạo, Q5, TP.HCM',
        creditLimit: 10000000,
        currentDebt: 2000000, // Nợ cũ: 2M
        status: 'active',
        createdBy: adminUser.id,
      }
    });

    const customer3 = await prisma.customer.create({
      data: {
        customerCode: 'TEST-KH003',
        customerName: 'Trần Thị Y (Test)',
        customerType: 'individual',
        classification: 'vip',
        phone: '0902222222',
        address: '654 Nguyễn Thái Học, Ba Đình, Hà Nội',
        creditLimit: 50000000,
        currentDebt: 5000000, // Nợ cũ: 5M
        status: 'active',
        createdBy: adminUser.id,
      }
    });

    console.log('✅ Created 3 test customers');
    console.log(`   - ${customer1.customerName}: Debt 0`);
    console.log(`   - ${customer2.customerName}: Debt 2M`);
    console.log(`   - ${customer3.customerName}: Debt 5M\n`);

    // =====================================================
    // 7. TẠO INVOICES (5 đơn hàng tháng 1/2026)
    // =====================================================
    console.log('🧾 Creating test invoices for January 2026...\n');

    // ─────────────────────────────────────────────────────
    // INVOICE 1: Completed - Full Payment - High Profit
    // ─────────────────────────────────────────────────────
    console.log('📝 Invoice 1: Completed, Full Payment');
    const invoice1 = await prisma.invoice.create({
      data: {
        orderCode: 'TEST-2026-001',
        customerId: customer1.id,
        orderDate: new Date('2026-01-05T10:00:00Z'),
        completedAt: new Date('2026-01-05T16:00:00Z'),
        isPickupOrder: false, // Delivery
        totalAmount: 46000000, // 2*20M + 5*1.2M = 46M
        amount: 46000000,
        subTotal: 46000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 46000000, // Full payment
        paymentStatus: 'paid',
        orderStatus: 'completed',
        createdBy: salesStaff1.id, // Hoàng Văn Đạt
        warehouseId: warehouse1.id,
        deliveryAddress: customer1.address,
        notes: 'Test Invoice 1 - Completed, Full Payment',
        details: {
          create: [
            {
              productId: product1.id, // Laptop
              quantity: 2,
              baseQuantity: 2,
              price: 20000000,
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 40000000,
              total: 40000000,
              warehouseId: warehouse1.id,
            },
            {
              productId: product2.id, // Mouse
              quantity: 5,
              baseQuantity: 5,
              price: 1200000,
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 6000000,
              total: 6000000,
              warehouseId: warehouse1.id,
            }
          ]
        }
      }
    });
    console.log(`   ✅ ${invoice1.orderCode}: 46M (Paid: 46M, Profit: 12M)`);

    // ─────────────────────────────────────────────────────
    // INVOICE 2: Completed - Partial Payment - With Discount
    // ─────────────────────────────────────────────────────
    console.log('📝 Invoice 2: Completed, Partial Payment, 10% Discount');
    const invoice2 = await prisma.invoice.create({
      data: {
        orderCode: 'TEST-2026-002',
        customerId: customer2.id,
        orderDate: new Date('2026-01-10T14:00:00Z'),
        completedAt: new Date('2026-01-10T18:00:00Z'),
        isPickupOrder: true, // Pickup
        totalAmount: 5040000, // After 10% discount
        amount: 5040000,
        subTotal: 5600000,   // Before discount
        discountAmount: 560000, // 10% discount
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 3000000, // Partial payment
        paymentStatus: 'partial',
        orderStatus: 'completed',
        createdBy: salesStaff2.id, // Nguyễn Văn Quản
        warehouseId: warehouse1.id,
        notes: 'Test Invoice 2 - Completed, Partial Payment, 10% Discount',
        details: {
          create: [
            {
              productId: product3.id, // Keyboard
              quantity: 1,
              baseQuantity: 1,
              price: 2000000,
              discountAmount: 200000, // 10%
              taxAmount: 0,
              subTotal: 2000000,
              total: 1800000,
              warehouseId: warehouse1.id,
            },
            {
              productId: product2.id, // Mouse
              quantity: 3,
              baseQuantity: 3,
              price: 1200000,
              discountAmount: 360000, // 10%
              taxAmount: 0,
              subTotal: 3600000,
              total: 3240000,
              warehouseId: warehouse1.id,
            }
          ]
        }
      }
    });
    console.log(`   ✅ ${invoice2.orderCode}: 5.04M (Paid: 3M, Debt: 2.04M, Profit: 420K)`);

    // ─────────────────────────────────────────────────────
    // INVOICE 3: Completed - Full Payment
    // ─────────────────────────────────────────────────────
    console.log('📝 Invoice 3: Completed, Full Payment');
    const invoice3 = await prisma.invoice.create({
      data: {
        orderCode: 'TEST-2026-003',
        customerId: customer3.id,
        orderDate: new Date('2026-01-15T09:00:00Z'),
        completedAt: new Date('2026-01-15T15:00:00Z'),
        isPickupOrder: false, // Delivery
        totalAmount: 24000000, // 1*20M + 2*2M = 24M
        amount: 24000000,
        subTotal: 24000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 24000000, // Full payment
        paymentStatus: 'paid',
        orderStatus: 'completed',
        createdBy: salesStaff1.id, // Hoàng Văn Đạt
        warehouseId: warehouse1.id,
        deliveryAddress: customer3.address,
        notes: 'Test Invoice 3 - Completed, Full Payment',
        details: {
          create: [
            {
              productId: product1.id, // Laptop
              quantity: 1,
              baseQuantity: 1,
              price: 20000000,
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 20000000,
              total: 20000000,
              warehouseId: warehouse1.id,
            },
            {
              productId: product3.id, // Keyboard
              quantity: 2,
              baseQuantity: 2,
              price: 2000000,
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 4000000,
              total: 4000000,
              warehouseId: warehouse1.id,
            }
          ]
        }
      }
    });
    console.log(`   ✅ ${invoice3.orderCode}: 24M (Paid: 24M, Profit: 6M)`);

    // ─────────────────────────────────────────────────────
    // INVOICE 4: Pending (KHÔNG TÍNH VÀO REVENUE)
    // ─────────────────────────────────────────────────────
    console.log('📝 Invoice 4: Pending (not counted in revenue)');
    const invoice4 = await prisma.invoice.create({
      data: {
        orderCode: 'TEST-2026-004',
        customerId: customer1.id,
        orderDate: new Date('2026-01-20T11:00:00Z'),
        isPickupOrder: true,
        totalAmount: 12000000,
        amount: 12000000,
        subTotal: 12000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        orderStatus: 'pending', // Not completed
        createdBy: salesStaff2.id,
        warehouseId: warehouse1.id,
        notes: 'Test Invoice 4 - Pending (not counted)',
        details: {
          create: [
            {
              productId: product2.id,
              quantity: 10,
              baseQuantity: 10,
              price: 1200000,
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 12000000,
              total: 12000000,
              warehouseId: warehouse1.id,
            }
          ]
        }
      }
    });
    console.log(`   ✅ ${invoice4.orderCode}: 12M (Pending - not counted)`);

    // ─────────────────────────────────────────────────────
    // INVOICE 5: Cancelled (KHÔNG TÍNH VÀO REVENUE)
    // ─────────────────────────────────────────────────────
    console.log('📝 Invoice 5: Cancelled (not counted in revenue)');
    const invoice5 = await prisma.invoice.create({
      data: {
        orderCode: 'TEST-2026-005',
        customerId: customer2.id,
        orderDate: new Date('2026-01-25T13:00:00Z'),
        isPickupOrder: false,
        totalAmount: 8000000,
        amount: 8000000,
        subTotal: 8000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        orderStatus: 'cancelled', // Cancelled
        createdBy: salesStaff1.id,
        cancelledBy: adminUser.id,
        cancelledAt: new Date('2026-01-25T14:00:00Z'),
        warehouseId: warehouse1.id,
        notes: 'Test Invoice 5 - Cancelled (not counted)',
        details: {
          create: [
            {
              productId: product3.id,
              quantity: 4,
              baseQuantity: 4,
              price: 2000000,
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 8000000,
              total: 8000000,
              warehouseId: warehouse1.id,
            }
          ]
        }
      }
    });
    console.log(`   ✅ ${invoice5.orderCode}: 8M (Cancelled - not counted)\n`);

    // =====================================================
    // 8. TỔNG KẾT KẾT QUẢ MONG ĐỢI
    // =====================================================
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 EXPECTED CALCULATION RESULTS (FOR VERIFICATION)');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('🎯 OVERALL SUMMARY (Only completed orders):');
    console.log('   - Total Orders: 5 (3 completed, 1 pending, 1 cancelled)');
    console.log('   - Completed Orders: 3');
    console.log('   - Cancelled Orders: 1');
    console.log('   - Pending Orders: 1\n');
    
    console.log('💰 REVENUE CALCULATION:');
    console.log('   - Invoice 1: 46,000,000 VND (paid: 46,000,000)');
    console.log('   - Invoice 2: 5,040,000 VND (paid: 3,000,000)');
    console.log('   - Invoice 3: 24,000,000 VND (paid: 24,000,000)');
    console.log('   ─────────────────────────────────────────────');
    console.log('   - Total Net Revenue: 75,040,000 VND');
    console.log('   - Total Paid: 73,000,000 VND');
    console.log('   - New Debt: 2,040,000 VND\n');
    
    console.log('📈 PROFIT CALCULATION:');
    console.log('   - Invoice 1 Profit:');
    console.log('     • 2 Laptop: 2 × (20M - 15M) = 10,000,000 VND');
    console.log('     • 5 Mouse: 5 × (1.2M - 800K) = 2,000,000 VND');
    console.log('     • Total: 12,000,000 VND');
    console.log('   - Invoice 2 Profit:');
    console.log('     • 1 Keyboard: (1.8M - 1.5M) = 300,000 VND');
    console.log('     • 3 Mouse: 3 × (1.08M - 800K) = 840,000 VND');
    console.log('     • Total: 1,140,000 VND');
    console.log('   - Invoice 3 Profit:');
    console.log('     • 1 Laptop: (20M - 15M) = 5,000,000 VND');
    console.log('     • 2 Keyboard: 2 × (2M - 1.5M) = 1,000,000 VND');
    console.log('     • Total: 6,000,000 VND');
    console.log('   ─────────────────────────────────────────────');
    console.log('   - Total Estimated Profit: 19,140,000 VND');
    console.log('   - Profit Margin: 19,140,000 / 75,040,000 = 25.51%\n');
    
    console.log('👥 STAFF PERFORMANCE:');
    console.log('   - Hoàng Văn Đạt (sales@company.com):');
    console.log('     • Orders: 3 (2 completed + 1 cancelled)');
    console.log('     • Revenue: 70,000,000 VND');
    console.log('     • Completion Rate: 2/3 = 66.67%');
    console.log('   - Nguyễn Văn Quản (hanhlanganime@gmail.com):');
    console.log('     • Orders: 2 (1 completed + 1 pending)');
    console.log('     • Revenue: 5,040,000 VND');
    console.log('     • Completion Rate: 1/2 = 50%\n');
    
    console.log('🏪 BY CHANNEL:');
    console.log('   - Pickup: 1 order, 5,040,000 VND');
    console.log('   - Delivery: 2 orders, 70,000,000 VND\n');
    
    console.log('🏆 TOP PRODUCTS (by revenue):');
    console.log('   1. Laptop: 3 units, 60,000,000 VND');
    console.log('   2. Mouse: 8 units, 9,600,000 VND');
    console.log('   3. Keyboard: 3 units, 5,440,000 VND\n');
    
    console.log('👤 TOP CUSTOMERS (by revenue):');
    console.log('   1. Công ty TNHH ABC: 46,000,000 VND');
    console.log('   2. Trần Thị Y: 24,000,000 VND');
    console.log('   3. Nguyễn Văn X: 5,040,000 VND\n');
    
    console.log('💳 DEBT STATUS:');
    console.log('   - Existing Debt: 7,000,000 VND (KH002: 2M + KH003: 5M)');
    console.log('   - New Debt from Orders: 2,040,000 VND');
    console.log('   - Total Current Debt: 9,040,000 VND\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Seed data created successfully!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('🧪 TESTING INSTRUCTIONS:');
    console.log('1. Go to: http://localhost:5173/sales-report');
    console.log('2. Set date filter: January 1-31, 2026');
    console.log('3. Verify the numbers match the expected results above');
    console.log('4. Test filters: warehouse, channel, customer, staff\n');
    
    console.log('📅 Test Period: January 1-31, 2026');
    console.log('🔑 Order Codes: TEST-2026-001 to TEST-2026-005\n');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
