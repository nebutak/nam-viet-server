import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * SEED DATA FOR SALES REPORT TESTING
 * 
 * Tạo dữ liệu test có thể tính toán và verify được
 * Bao gồm: Customers, Products, Users, Warehouses, Invoices với logic rõ ràng
 */

async function main() {
  console.log('🌱 Seeding Sales Report Test Data...\n');

  try {
    // =====================================================
    // 1. CLEAN UP EXISTING DATA
    // =====================================================
    console.log('🧹 Cleaning up existing data...');
    await prisma.invoiceDetail.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.user.deleteMany({
      where: { 
        role: { roleKey: { in: ['sales_staff', 'admin'] } }
      }
    });
    await prisma.warehouse.deleteMany({});
    console.log('✅ Cleanup completed\n');

    // =====================================================
    // 2. CREATE WAREHOUSES
    // =====================================================
    console.log('🏪 Creating warehouses...');
    const warehouse1 = await prisma.warehouse.create({
      data: {
        warehouseCode: 'WH-HCM',
        warehouseName: 'Kho Hồ Chí Minh',
        warehouseType: 'product',
        address: '123 Nguyễn Văn Cừ, Q5, TP.HCM',
        city: 'Hồ Chí Minh',
        region: 'Miền Nam',
        status: 'active',
      }
    });

    const warehouse2 = await prisma.warehouse.create({
      data: {
        warehouseCode: 'WH-HN',
        warehouseName: 'Kho Hà Nội',
        warehouseType: 'product',
        address: '456 Giải Phóng, Hai Bà Trưng, Hà Nội',
        city: 'Hà Nội',
        region: 'Miền Bắc',
        status: 'active',
      }
    });
    console.log('✅ Created 2 warehouses\n');

    // =====================================================
    // 3. CREATE ROLES & USERS
    // =====================================================
    console.log('👥 Creating users...');
    
    // Get or create roles
    let adminRole = await prisma.role.findUnique({ where: { roleKey: 'admin' } });
    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: {
          roleKey: 'admin',
          roleName: 'Administrator',
          status: 'active',
        }
      });
    }

    let salesRole = await prisma.role.findUnique({ where: { roleKey: 'sales_staff' } });
    if (!salesRole) {
      salesRole = await prisma.role.create({
        data: {
          roleKey: 'sales_staff',
          roleName: 'Sales Staff',
          status: 'active',
        }
      });
    }

    // Create users
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const user1 = await prisma.user.create({
      data: {
        employeeCode: 'NV001',
        email: 'nguyen.van.a@test.com',
        passwordHash: hashedPassword,
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        roleId: salesRole.id,
        warehouseId: warehouse1.id,
        status: 'active',
      }
    });

    const user2 = await prisma.user.create({
      data: {
        employeeCode: 'NV002',
        email: 'tran.thi.b@test.com',
        passwordHash: hashedPassword,
        fullName: 'Trần Thị B',
        phone: '0901234568',
        roleId: salesRole.id,
        warehouseId: warehouse2.id,
        status: 'active',
      }
    });

    const admin = await prisma.user.create({
      data: {
        employeeCode: 'ADMIN',
        email: 'admin@test.com',
        passwordHash: hashedPassword,
        fullName: 'Admin User',
        phone: '0901234569',
        roleId: adminRole.id,
        status: 'active',
      }
    });
    console.log('✅ Created 3 users\n');

    // =====================================================
    // 4. CREATE CATEGORIES & PRODUCTS
    // =====================================================
    console.log('📦 Creating products...');
    
    // Create category
    const category = await prisma.category.create({
      data: {
        categoryCode: 'ELEC',
        categoryName: 'Điện tử',
        status: 'active',
      }
    });

    // Create products with clear pricing
    const product1 = await prisma.product.create({
      data: {
        code: 'LAPTOP-001',
        productName: 'Laptop Dell Inspiron',
        categoryId: category.id,
        basePrice: 15000000, // Cost: 15M
        price: 20000000,     // Selling: 20M → Profit: 5M per unit
        minStockLevel: 10,
        status: 'active',
      }
    });

    const product2 = await prisma.product.create({
      data: {
        code: 'MOUSE-001',
        productName: 'Chuột Logitech MX',
        categoryId: category.id,
        basePrice: 800000,   // Cost: 800K
        price: 1200000,      // Selling: 1.2M → Profit: 400K per unit
        minStockLevel: 50,
        status: 'active',
      }
    });

    const product3 = await prisma.product.create({
      data: {
        code: 'KEYBOARD-001',
        productName: 'Bàn phím Mechanical',
        categoryId: category.id,
        basePrice: 1500000,  // Cost: 1.5M
        price: 2000000,      // Selling: 2M → Profit: 500K per unit
        minStockLevel: 30,
        status: 'active',
      }
    });
    console.log('✅ Created 3 products\n');

    // =====================================================
    // 5. CREATE INVENTORY
    // =====================================================
    console.log('📊 Creating inventory...');
    await Promise.all([
      // Warehouse 1
      prisma.inventory.create({
        data: { warehouseId: warehouse1.id, productId: product1.id, quantity: 100 }
      }),
      prisma.inventory.create({
        data: { warehouseId: warehouse1.id, productId: product2.id, quantity: 200 }
      }),
      prisma.inventory.create({
        data: { warehouseId: warehouse1.id, productId: product3.id, quantity: 150 }
      }),
      // Warehouse 2
      prisma.inventory.create({
        data: { warehouseId: warehouse2.id, productId: product1.id, quantity: 80 }
      }),
      prisma.inventory.create({
        data: { warehouseId: warehouse2.id, productId: product2.id, quantity: 180 }
      }),
      prisma.inventory.create({
        data: { warehouseId: warehouse2.id, productId: product3.id, quantity: 120 }
      }),
    ]);
    console.log('✅ Created inventory records\n');

    // =====================================================
    // 6. CREATE CUSTOMERS
    // =====================================================
    console.log('👤 Creating customers...');
    const customer1 = await prisma.customer.create({
      data: {
        customerCode: 'KH001',
        customerName: 'Công ty TNHH ABC',
        customerType: 'company',
        classification: 'wholesale',
        phone: '0281234567',
        email: 'abc@company.com',
        address: '789 Lê Lợi, Q1, TP.HCM',
        creditLimit: 100000000, // 100M credit limit
        currentDebt: 0,
        status: 'active',
      }
    });

    const customer2 = await prisma.customer.create({
      data: {
        customerCode: 'KH002',
        customerName: 'Nguyễn Văn X',
        customerType: 'individual',
        classification: 'retail',
        phone: '0901111111',
        address: '321 Trần Hưng Đạo, Q5, TP.HCM',
        creditLimit: 10000000, // 10M credit limit
        currentDebt: 2000000,  // 2M existing debt
        status: 'active',
      }
    });

    const customer3 = await prisma.customer.create({
      data: {
        customerCode: 'KH003',
        customerName: 'Trần Thị Y',
        customerType: 'individual',
        classification: 'vip',
        phone: '0902222222',
        address: '654 Nguyễn Thái Học, Ba Đình, Hà Nội',
        creditLimit: 50000000, // 50M credit limit
        currentDebt: 5000000,  // 5M existing debt
        status: 'active',
      }
    });
    console.log('✅ Created 3 customers\n');

    // =====================================================
    // 7. CREATE TEST INVOICES - THÁNG 1/2026
    // =====================================================
    console.log('🧾 Creating test invoices for January 2026...');

    // INVOICE 1: Completed - Full Payment - High Profit
    // Date: 2026-01-05, Customer: ABC Company, Staff: Nguyễn Văn A
    // Products: 2 Laptops + 5 Mice
    // Expected: Revenue = 2*20M + 5*1.2M = 46M, Profit = 2*5M + 5*400K = 12M
    await prisma.invoice.create({
      data: {
        orderCode: 'DH-2026-001',
        customerId: customer1.id,
        orderDate: new Date('2026-01-05T10:00:00Z'),
        completedAt: new Date('2026-01-05T16:00:00Z'),
        isPickupOrder: false, // Delivery
        totalAmount: 46000000, // 46M (after all calculations)
        subTotal: 46000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 46000000, // Full payment
        paymentStatus: 'paid',
        orderStatus: 'completed',
        createdBy: user1.id,
        warehouseId: warehouse1.id,
        deliveryAddress: customer1.address,
        notes: 'Đơn hàng test 1 - Hoàn thành, thanh toán đủ',
        details: {
          create: [
            {
              productId: product1.id, // Laptop
              quantity: 2,
              price: 20000000, // 20M per unit
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 40000000, // 2 * 20M
              total: 40000000,
              warehouseId: warehouse1.id,
            },
            {
              productId: product2.id, // Mouse
              quantity: 5,
              price: 1200000, // 1.2M per unit
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 6000000, // 5 * 1.2M
              total: 6000000,
              warehouseId: warehouse1.id,
            }
          ]
        }
      }
    });

    // INVOICE 2: Completed - Partial Payment - With Discount
    // Date: 2026-01-10, Customer: Nguyễn Văn X, Staff: Trần Thị B
    // Products: 1 Keyboard + 3 Mice, 10% discount
    // Expected: Gross = 1*2M + 3*1.2M = 5.6M, Discount = 560K, Net = 5.04M, Paid = 3M, Debt = 2.04M
    await prisma.invoice.create({
      data: {
        orderCode: 'DH-2026-002',
        customerId: customer2.id,
        orderDate: new Date('2026-01-10T14:00:00Z'),
        completedAt: new Date('2026-01-10T18:00:00Z'),
        isPickupOrder: true, // Pickup
        totalAmount: 5040000, // 5.04M (after 10% discount)
        subTotal: 5600000,   // 5.6M (before discount)
        discountAmount: 560000, // 10% discount
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 3000000, // Partial payment 3M
        paymentStatus: 'partial',
        orderStatus: 'completed',
        createdBy: user2.id,
        warehouseId: warehouse2.id,
        notes: 'Đơn hàng test 2 - Hoàn thành, thanh toán một phần, có giảm giá',
        details: {
          create: [
            {
              productId: product3.id, // Keyboard
              quantity: 1,
              price: 2000000, // 2M per unit
              discountAmount: 200000, // 10% discount
              taxAmount: 0,
              subTotal: 2000000,
              total: 1800000, // After discount
              warehouseId: warehouse2.id,
            },
            {
              productId: product2.id, // Mouse
              quantity: 3,
              price: 1200000, // 1.2M per unit
              discountAmount: 360000, // 10% discount
              taxAmount: 0,
              subTotal: 3600000,
              total: 3240000, // After discount
              warehouseId: warehouse2.id,
            }
          ]
        }
      }
    });

    // INVOICE 3: Completed - Full Payment - Different Staff
    // Date: 2026-01-15, Customer: Trần Thị Y, Staff: Nguyễn Văn A
    // Products: 1 Laptop + 2 Keyboards
    // Expected: Revenue = 1*20M + 2*2M = 24M, Profit = 1*5M + 2*500K = 6M
    await prisma.invoice.create({
      data: {
        orderCode: 'DH-2026-003',
        customerId: customer3.id,
        orderDate: new Date('2026-01-15T09:00:00Z'),
        completedAt: new Date('2026-01-15T15:00:00Z'),
        isPickupOrder: false, // Delivery
        totalAmount: 24000000, // 24M
        subTotal: 24000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 24000000, // Full payment
        paymentStatus: 'paid',
        orderStatus: 'completed',
        createdBy: user1.id,
        warehouseId: warehouse1.id,
        deliveryAddress: customer3.address,
        notes: 'Đơn hàng test 3 - Hoàn thành, thanh toán đủ',
        details: {
          create: [
            {
              productId: product1.id, // Laptop
              quantity: 1,
              price: 20000000, // 20M per unit
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 20000000,
              total: 20000000,
              warehouseId: warehouse1.id,
            },
            {
              productId: product3.id, // Keyboard
              quantity: 2,
              price: 2000000, // 2M per unit
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

    // INVOICE 4: Pending - Not Completed (should not count in revenue)
    // Date: 2026-01-20, Customer: ABC Company, Staff: Trần Thị B
    await prisma.invoice.create({
      data: {
        orderCode: 'DH-2026-004',
        customerId: customer1.id,
        orderDate: new Date('2026-01-20T11:00:00Z'),
        isPickupOrder: true,
        totalAmount: 15000000,
        subTotal: 15000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        orderStatus: 'pending', // Not completed
        createdBy: user2.id,
        warehouseId: warehouse2.id,
        notes: 'Đơn hàng test 4 - Chưa hoàn thành (không tính vào doanh thu)',
        details: {
          create: [
            {
              productId: product2.id,
              quantity: 10,
              price: 1200000,
              discountAmount: 0,
              taxAmount: 0,
              subTotal: 12000000,
              total: 12000000,
              warehouseId: warehouse2.id,
            }
          ]
        }
      }
    });

    // INVOICE 5: Cancelled (should not count)
    // Date: 2026-01-25
    await prisma.invoice.create({
      data: {
        orderCode: 'DH-2026-005',
        customerId: customer2.id,
        orderDate: new Date('2026-01-25T13:00:00Z'),
        isPickupOrder: false,
        totalAmount: 8000000,
        subTotal: 8000000,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        orderStatus: 'cancelled', // Cancelled
        createdBy: user1.id,
        cancelledBy: admin.id,
        cancelledAt: new Date('2026-01-25T14:00:00Z'),
        warehouseId: warehouse1.id,
        notes: 'Đơn hàng test 5 - Đã hủy (không tính vào doanh thu)',
        details: {
          create: [
            {
              productId: product3.id,
              quantity: 4,
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

    console.log('✅ Created 5 test invoices\n');

    // =====================================================
    // 8. SUMMARY & EXPECTED RESULTS
    // =====================================================
    console.log('📊 EXPECTED CALCULATION RESULTS:');
    console.log('=====================================');
    
    console.log('\n🎯 OVERALL SUMMARY (Only completed orders):');
    console.log('- Total Orders: 3 (completed)');
    console.log('- Cancelled Orders: 1');
    console.log('- Pending Orders: 1');
    
    console.log('\n💰 REVENUE CALCULATION:');
    console.log('- Invoice 1: 46,000,000 VND (paid: 46,000,000)');
    console.log('- Invoice 2: 5,040,000 VND (paid: 3,000,000)');
    console.log('- Invoice 3: 24,000,000 VND (paid: 24,000,000)');
    console.log('- Total Net Revenue: 75,040,000 VND');
    console.log('- Total Paid: 73,000,000 VND');
    console.log('- New Debt: 2,040,000 VND');
    
    console.log('\n📈 PROFIT CALCULATION:');
    console.log('- Invoice 1 Profit: 2*5M + 5*400K = 12,000,000 VND');
    console.log('- Invoice 2 Profit: 1*(2M-1.5M-200K) + 3*(1.2M-800K-360K) = 300K + 120K = 420,000 VND');
    console.log('- Invoice 3 Profit: 1*5M + 2*500K = 6,000,000 VND');
    console.log('- Total Estimated Profit: 18,420,000 VND');
    console.log('- Profit Margin: 18,420,000 / 75,040,000 = 24.54%');
    
    console.log('\n👥 STAFF PERFORMANCE:');
    console.log('- Nguyễn Văn A: 2 orders, 70,000,000 VND revenue, 100% completion');
    console.log('- Trần Thị B: 1 completed + 1 pending = 50% completion');
    
    console.log('\n🏪 BY CHANNEL:');
    console.log('- Pickup: 1 order, 5,040,000 VND');
    console.log('- Delivery: 2 orders, 70,000,000 VND');
    
    console.log('\n🏆 TOP PRODUCTS:');
    console.log('- Laptop: 3 units, 60,000,000 VND');
    console.log('- Mouse: 8 units, 9,600,000 VND');
    console.log('- Keyboard: 3 units, 5,440,000 VND');
    
    console.log('\n👤 TOP CUSTOMERS:');
    console.log('- Công ty TNHH ABC: 46,000,000 VND');
    console.log('- Trần Thị Y: 24,000,000 VND');
    console.log('- Nguyễn Văn X: 5,040,000 VND');
    
    console.log('\n💳 DEBT STATUS:');
    console.log('- Total Existing Debt: 7,000,000 VND (KH002: 2M + KH003: 5M)');
    console.log('- New Debt from Orders: 2,040,000 VND');
    console.log('- Total Current Debt: 9,040,000 VND');
    
    console.log('\n=====================================');
    console.log('✅ Seed data created successfully!');
    console.log('🧪 Ready for testing at: http://localhost:5173/sales-report');
    console.log('📅 Test period: January 1-31, 2026');
    console.log('\n🔑 LOGIN CREDENTIALS:');
    console.log('📧 Email: admin@test.com');
    console.log('🔒 Password: admin123');
    console.log('\n📧 Alternative logins:');
    console.log('   - nguyen.van.a@test.com (password: admin123)');
    console.log('   - tran.thi.b@test.com (password: admin123)');
    console.log('=====================================\n');

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