import request from 'supertest';
import express, { Application } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@utils/password';

// Import routes
import authRoutes from '@routes/auth.routes';
import productRoutes from '@routes/product.routes';
import warehouseRoutes from '@routes/warehouse.routes';
import categoryRoutes from '@routes/category.routes';
import inventoryRoutes from '@routes/inventory.routes';
import invoiceRoutes from '@routes/invoice.routes';
import customerRoutes from '@routes/customer.routes';
import { errorHandler } from '@middlewares/errorHandler';

const prisma = new PrismaClient();

const createTestApp = (): Application => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/warehouses', warehouseRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/customers', customerRoutes);
  app.use(errorHandler);
  return app;
};

describe('E2E: Complete Sales Order Flow', () => {
  let app: Application;
  let accessToken: string;
  let adminRole: any;
  let adminUser: any;
  let warehouse: any;
  let category: any;
  let product: any;
  let customer: any;
  let invoice: any;

  beforeAll(async () => {
    app = createTestApp();

    // 1. Create admin role
    adminRole = await prisma.role.upsert({
      where: { roleKey: 'admin' },
      update: {},
      create: {
        roleKey: 'admin',
        roleName: 'Administrator',
        description: 'System administrator',
        status: 'active',
      },
    });

    // 2. Create admin user
    const hashedPassword = await hashPassword('Admin@123456');
    adminUser = await prisma.user.upsert({
      where: { email: 'admin@e2etest.com' },
      update: {},
      create: {
        employeeCode: 'ADMIN-E2E',
        email: 'admin@e2etest.com',
        passwordHash: hashedPassword,
        fullName: 'Admin E2E Test',
        roleId: adminRole.id,
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse order
    if (invoice) {
      await prisma.invoiceDetail.deleteMany({ where: { orderId: invoice.id } });
      await prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => {});
    }
    if (customer) {
      await prisma.customer.delete({ where: { id: customer.id } }).catch(() => {});
    }
    if (product) {
      await prisma.inventory.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
    }
    if (category) {
      await prisma.category.delete({ where: { id: category.id } }).catch(() => {});
    }
    if (warehouse) {
      await prisma.warehouse.delete({ where: { id: warehouse.id } }).catch(() => {});
    }
    if (adminUser) {
      await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    }
    await prisma.role.delete({ where: { roleKey: 'admin' } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('should complete full sales order flow', async () => {
    // Step 1: Login as admin
    console.log('Step 1: Login...');
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: 'admin@e2etest.com',
      password: 'Admin@123456',
    });

    expect(loginResponse.status).toBe(200);
    accessToken = loginResponse.body.data.tokens.accessToken;
    console.log('✓ Login successful');

    // Step 2: Create warehouse
    console.log('Step 2: Creating warehouse...');
    const warehouseResponse = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        warehouseCode: 'WH-E2E-001',
        warehouseName: 'E2E Test Warehouse',
        warehouseType: 'finished_product',
        status: 'active',
      });

    expect(warehouseResponse.status).toBe(201);
    warehouse = warehouseResponse.body.data;
    console.log('✓ Warehouse created:', warehouse.warehouseCode);

    // Step 3: Create category
    console.log('Step 3: Creating category...');
    const categoryResponse = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryCode: 'CAT-E2E-001',
        categoryName: 'E2E Test Category',
        slug: 'e2e-test-category',
        status: 'active',
      });

    expect(categoryResponse.status).toBe(201);
    category = categoryResponse.body.data;
    console.log('✓ Category created:', category.categoryCode);

    // Step 4: Create product
    console.log('Step 4: Creating product...');
    const productResponse = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sku: 'PROD-E2E-001',
        slug: 'e2e-test-product',
        productName: 'E2E Test Product',
        productType: 'finished_product',
        categoryId: category.id,
        unit: 'pcs',
        purchasePrice: 100,
        sellingPriceRetail: 150,
        sellingPriceWholesale: 130,
        sellingPriceVip: 120,
        minStockLevel: 10,
        status: 'active',
      });

    expect(productResponse.status).toBe(201);
    product = productResponse.body.data;
    console.log('✓ Product created:', product.sku);

    // Step 5: Add inventory
    console.log('Step 5: Adding inventory...');
    await prisma.inventory.create({
      data: {
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: 1000,
        reservedQuantity: 0,
      },
    });
    console.log('✓ Inventory added: 1000 units');

    // Step 6: Create customer
    console.log('Step 6: Creating customer...');
    const customerResponse = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCode: 'CUST-E2E-001',
        customerName: 'E2E Test Customer',
        customerType: 'individual',
        classification: 'retail',
        phone: '0123456789',
        email: 'customer@e2etest.com',
        creditLimit: 10000000,
        status: 'active',
      });

    expect(customerResponse.status).toBe(201);
    customer = customerResponse.body.data;
    console.log('✓ Customer created:', customer.customerCode);

    // Step 7: Check inventory before order
    console.log('Step 7: Checking inventory availability...');
    const checkResponse = await request(app)
      .post('/api/inventory/check')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        warehouseId: warehouse.id,
        items: [
          {
            productId: product.id,
            quantity: 100,
          },
        ],
      });

    expect(checkResponse.status).toBe(200);
    expect(checkResponse.body.data.available).toBe(true);
    console.log('✓ Inventory check passed');

    // Step 8: Create sales order
    console.log('Step 8: Creating sales order...');
    const orderResponse = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: customer.id,
        warehouseId: warehouse.id,
        orderDate: new Date().toISOString().split('T')[0],
        salesChannel: 'retail',
        paymentMethod: 'cash',
        details: [
          {
            productId: product.id,
            quantity: 100,
            unitPrice: 150,
            discountPercent: 0,
            taxRate: 10,
          },
        ],
        shippingFee: 50000,
        notes: 'E2E Test Order',
      });

    expect(orderResponse.status).toBe(201);
    invoice = orderResponse.body.data;
    console.log('✓ Sales order created:', invoice.orderCode);

    // Verify order details
    expect(invoice.customerId).toBe(customer.id);
    expect(invoice.warehouseId).toBe(warehouse.id);
    expect(invoice.details).toHaveLength(1);
    expect(invoice.details[0].quantity).toBe(100);

    // Step 9: Verify inventory was reserved
    console.log('Step 9: Verifying inventory reservation...');
    const inventoryCheck = await prisma.inventory.findFirst({
      where: {
        warehouseId: warehouse.id,
        productId: product.id,
      },
    });

    expect(inventoryCheck).toBeDefined();
    expect(Number(inventoryCheck!.reservedQuantity)).toBeGreaterThan(0);
    console.log('✓ Inventory reserved:', inventoryCheck!.reservedQuantity);

    // Step 10: Approve order
    console.log('Step 10: Approving order...');
    const approveResponse = await request(app)
      .put(`/api/invoices/${invoice.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        notes: 'Approved for E2E test',
      });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.data.orderStatus).toBe('preparing');
    console.log('✓ Order approved');

    // Step 11: Verify inventory was decreased
    console.log('Step 11: Verifying inventory decrease...');
    const finalInventory = await prisma.inventory.findFirst({
      where: {
        warehouseId: warehouse.id,
        productId: product.id,
      },
    });

    expect(finalInventory).toBeDefined();
    expect(Number(finalInventory!.quantity)).toBeLessThan(1000);
    console.log('✓ Inventory decreased to:', finalInventory!.quantity);

    // Step 12: Complete order
    console.log('Step 12: Completing order...');
    const completeResponse = await request(app)
      .put(`/api/invoices/${invoice.id}/complete`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.data.orderStatus).toBe('completed');
    console.log('✓ Order completed');

    console.log('\n✅ Full E2E flow completed successfully!');
  });
});
