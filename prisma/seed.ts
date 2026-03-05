import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // =====================================================
  // 0. CLEAN DATABASE (Delete existing data)
  // =====================================================
  console.log('🗑️  Cleaning database...\n');

  try {
    // Delete in correct order to respect foreign key constraints
    await prisma.customerAccount.deleteMany({});
    console.log('   ✓ Deleted CustomerAccounts');

    await prisma.activityLog.deleteMany({});
    console.log('   ✓ Deleted ActivityLogs');

    await prisma.verificationCode.deleteMany({});
    console.log('   ✓ Deleted VerificationCodes');

    await prisma.rolePermission.deleteMany({});
    console.log('   ✓ Deleted RolePermissions');

    // Need to remove relations from warehouse & customers to user first if any strict FKs exist
    // Prisma deleteMany will fail if other tables reference User. Let's delete dependent tables first
    await prisma.stockTransferDetail.deleteMany({});
    await prisma.stockTransfer.deleteMany({});
    await prisma.stockTransactionDetail.deleteMany({});
    await prisma.stockTransaction.deleteMany({});
    await prisma.productionOrderMaterial.deleteMany({});
    await prisma.productionOrder.deleteMany({});
    await prisma.bomMaterial.deleteMany({});
    await prisma.bom.deleteMany({});
    await prisma.salesOrderDetail.deleteMany({});
    await prisma.salesOrder.deleteMany({});
    await prisma.purchaseOrderDetail.deleteMany({});
    await prisma.purchaseOrder.deleteMany({});
    await prisma.paymentVoucher.deleteMany({});
    await prisma.paymentReceipt.deleteMany({});

    await prisma.crmTask.deleteMany({});
    await prisma.ticket.deleteMany({});

    await prisma.customer.deleteMany({});
    console.log('   ✓ Deleted Customers');

    await prisma.supplier.deleteMany({});
    console.log('   ✓ Deleted Suppliers');

    await prisma.promotionProduct.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVideo.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.product.deleteMany({});
    console.log('   ✓ Deleted Products');

    await prisma.warehouse.deleteMany({});
    console.log('   ✓ Deleted Warehouses');

    await prisma.newsTagRelation.deleteMany({});
    await prisma.newsTag.deleteMany({});
    await prisma.news.deleteMany({});
    await prisma.newsCategory.deleteMany({});
    await prisma.attendanceQRLog.deleteMany({});
    await prisma.attendanceQRCode.deleteMany({});
    await prisma.loginHistory.deleteMany({});
    await prisma.userPermission.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.overtimeEntry.deleteMany({});
    await prisma.overtimeSession.deleteMany({});
    await prisma.salary.deleteMany({});
    await prisma.attendance.deleteMany({});
    await prisma.attendanceMonth.deleteMany({});
    await prisma.promotion.deleteMany({});
    await prisma.cashFund.deleteMany({});
    await prisma.delivery.deleteMany({});
    await prisma.generalSetting.deleteMany({});

    await prisma.user.deleteMany({});
    console.log('   ✓ Deleted Users');

    await prisma.category.deleteMany({});
    console.log('   ✓ Deleted Categories');

    await prisma.permission.deleteMany({});
    console.log('   ✓ Deleted Permissions');

    await prisma.role.deleteMany({});
    console.log('   ✓ Deleted Roles');

    // Reset AUTO_INCREMENT về 1 cho các bảng chính
    await prisma.$executeRaw`ALTER TABLE permissions AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE roles AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE users AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE categories AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE suppliers AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE products AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE warehouses AUTO_INCREMENT = 1`;

    console.log('\n✅ Database cleaned successfully!\n');

  } catch (error) {
    console.error('⚠️  Error cleaning database:', error);
    console.log('   Continuing with seed process...\n');
  }

  // =====================================================
  // 1. SEED ROLES
  // =====================================================
  console.log('📝 Seeding roles...');

  const roles = await Promise.all([
    prisma.role.upsert({
      where: { roleKey: 'admin' },
      update: {},
      create: {
        roleKey: 'admin',
        roleName: 'Quản trị viên hệ thống',
        description: 'Có toàn quyền truy cập và quản lý hệ thống',
        status: 'active',
      },
    }),
    prisma.role.upsert({
      where: { roleKey: 'accountant' },
      update: {},
      create: {
        roleKey: 'accountant',
        roleName: 'Kế toán',
        description: 'Quản lý thu chi, công nợ, báo cáo tài chính',
        status: 'active',
      },
    }),
    prisma.role.upsert({
      where: { roleKey: 'warehouse_manager' },
      update: {},
      create: {
        roleKey: 'warehouse_manager',
        roleName: 'Quản lý kho chính',
        description: 'Giám sát tồn kho tổng thể, điều phối chuyển kho',
        status: 'active',
      },
    }),
    prisma.role.upsert({
      where: { roleKey: 'warehouse_staff' },
      update: {},
      create: {
        roleKey: 'warehouse_staff',
        roleName: 'Nhân viên kho',
        description: 'Quản lý nhập xuất tồn kho theo kho được phân công',
        status: 'active',
      },
    }),
    prisma.role.upsert({
      where: { roleKey: 'production_manager' },
      update: {},
      create: {
        roleKey: 'production_manager',
        roleName: 'Quản lý sản xuất',
        description: 'Quản lý công thức sản xuất, lệnh sản xuất',
        status: 'active',
      },
    }),
    prisma.role.upsert({
      where: { roleKey: 'sales_staff' },
      update: {},
      create: {
        roleKey: 'sales_staff',
        roleName: 'Nhân viên bán hàng',
        description: 'Quản lý khách hàng, tạo đơn hàng, theo dõi công nợ',
        status: 'active',
      },
    }),
    prisma.role.upsert({
      where: { roleKey: 'delivery_staff' },
      update: {},
      create: {
        roleKey: 'delivery_staff',
        roleName: 'Nhân viên giao hàng',
        description: 'Nhận và giao hàng, thu tiền COD',
        status: 'active',
      },
    }),
  ]);

  console.log(`✅ Created ${roles.length} roles\n`);

  // =====================================================
  // 2. SEED PERMISSIONS
  // =====================================================
  console.log('📝 Seeding permissions...');

  const permissionsData = [
    // Quản lý nhân sự
    { key: "GET_USER", name: "Xem", module: "user", moduleLabel: "Nhân sự" },
    { key: "CREATE_USER", name: "Thêm", module: "user", moduleLabel: "Nhân sự" },
    { key: "UPDATE_USER", name: "Sửa", module: "user", moduleLabel: "Nhân sự" },
    { key: "DELETE_USER", name: "Xóa", module: "user", moduleLabel: "Nhân sự" },

    // Quản lý vai trò
    { key: "GET_ROLE", name: "Xem", module: "role", moduleLabel: "Vai trò" },
    { key: "CREATE_ROLE", name: "Thêm", module: "role", moduleLabel: "Vai trò" },
    { key: "UPDATE_ROLE", name: "Sửa", module: "role", moduleLabel: "Vai trò" },
    { key: "DELETE_ROLE", name: "Xóa", module: "role", moduleLabel: "Vai trò" },

    // Quản lý danh mục
    { key: "GET_CATEGORY", name: "Xem", module: "category", moduleLabel: "Danh mục" },
    { key: "CREATE_CATEGORY", name: "Thêm", module: "category", moduleLabel: "Danh mục" },
    { key: "UPDATE_CATEGORY", name: "Sửa", module: "category", moduleLabel: "Danh mục" },
    { key: "DELETE_CATEGORY", name: "Xóa", module: "category", moduleLabel: "Danh mục" },

    // Quản lý đơn vị
    { key: "GET_UNIT", name: "Xem", module: "unit", moduleLabel: "Đơn vị" },
    { key: "CREATE_UNIT", name: "Thêm", module: "unit", moduleLabel: "Đơn vị" },
    { key: "UPDATE_UNIT", name: "Sửa", module: "unit", moduleLabel: "Đơn vị" },
    { key: "DELETE_UNIT", name: "Xóa", module: "unit", moduleLabel: "Đơn vị" },

    // Quản lý thuộc tính
    { key: "GET_ATTRIBUTE", name: "Xem", module: "attribute", moduleLabel: "Thuộc tính" },
    { key: "CREATE_ATTRIBUTE", name: "Thêm", module: "attribute", moduleLabel: "Thuộc tính" },
    { key: "UPDATE_ATTRIBUTE", name: "Sửa", module: "attribute", moduleLabel: "Thuộc tính" },
    { key: "DELETE_ATTRIBUTE", name: "Xóa", module: "attribute", moduleLabel: "Thuộc tính" },

    // Quản lý nhà cung cấp
    { key: "GET_SUPPLIER", name: "Xem", module: "supplier", moduleLabel: "Nhà cung cấp" },
    { key: "CREATE_SUPPLIER", name: "Thêm", module: "supplier", moduleLabel: "Nhà cung cấp" },
    { key: "UPDATE_SUPPLIER", name: "Sửa", module: "supplier", moduleLabel: "Nhà cung cấp" },
    { key: "DELETE_SUPPLIER", name: "Xóa", module: "supplier", moduleLabel: "Nhà cung cấp" },

    // Quản lý sản phẩm
    { key: "GET_PRODUCT", name: "Xem", module: "product", moduleLabel: "Sản phẩm" },
    { key: "CREATE_PRODUCT", name: "Thêm", module: "product", moduleLabel: "Sản phẩm" },
    { key: "UPDATE_PRODUCT", name: "Sửa", module: "product", moduleLabel: "Sản phẩm" },
    { key: "DELETE_PRODUCT", name: "Xóa", module: "product", moduleLabel: "Sản phẩm" },

    // Quản lý khuyến mãi
    { key: "GET_PROMOTION", name: "Xem", module: "promotion", moduleLabel: "Khuyến mãi" },
    { key: "CREATE_PROMOTION", name: "Thêm", module: "promotion", moduleLabel: "Khuyến mãi" },
    { key: "UPDATE_PROMOTION", name: "Sửa", module: "promotion", moduleLabel: "Khuyến mãi" },
    { key: "DELETE_PROMOTION", name: "Xóa", module: "promotion", moduleLabel: "Khuyến mãi" },

    // Quản lý khách hàng
    { key: "GET_CUSTOMER", name: "Xem", module: "customer", moduleLabel: "Khách hàng" },
    { key: "CREATE_CUSTOMER", name: "Thêm", module: "customer", moduleLabel: "Khách hàng" },
    { key: "UPDATE_CUSTOMER", name: "Sửa", module: "customer", moduleLabel: "Khách hàng" },
    { key: "DELETE_CUSTOMER", name: "Xóa", module: "customer", moduleLabel: "Khách hàng" },

    // Chăm sóc khách hàng & Nhiệm vụ
    { key: "GET_CUSTOMER_CARE", name: "Xem", module: "crm", moduleLabel: "CSKH & CRM" },
    { key: "CREATE_CUSTOMER_CARE", name: "Thêm", module: "crm", moduleLabel: "CSKH & CRM" },
    { key: "UPDATE_CUSTOMER_CARE", name: "Sửa", module: "crm", moduleLabel: "CSKH & CRM" },
    { key: "DELETE_CUSTOMER_CARE", name: "Xóa", module: "crm", moduleLabel: "CSKH & CRM" },

    { key: "GET_TASK", name: "Xem", module: "task", moduleLabel: "Nhiệm vụ" },
    { key: "CREATE_TASK", name: "Thêm", module: "task", moduleLabel: "Nhiệm vụ" },
    { key: "UPDATE_TASK", name: "Sửa", module: "task", moduleLabel: "Nhiệm vụ" },
    { key: "DELETE_TASK", name: "Xóa", module: "task", moduleLabel: "Nhiệm vụ" },

    // Quản lý hóa đơn / Bán hàng
    { key: "GET_INVOICE", name: "Xem", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "GET_INVOICE_USER", name: "Xem của tôi", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "CREATE_INVOICE", name: "Thêm", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "UPDATE_INVOICE", name: "Sửa", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "DELETE_INVOICE", name: "Xóa", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "APPROVE_INVOICE", name: "Duyệt", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "REJECT_INVOICE", name: "Từ chối", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "CANCEL_INVOICE", name: "Hủy", module: "invoice", moduleLabel: "Đơn bán" },
    { key: "REVERT_INVOICE", name: "Hoàn tác", module: "invoice", moduleLabel: "Đơn bán" },

    // Đơn mua hàng
    { key: "GET_PURCHASE_ORDER", name: "Xem", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "GET_PURCHASE_ORDER_USER", name: "Xem của tôi", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "CREATE_PURCHASE_ORDER", name: "Thêm", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "UPDATE_PURCHASE_ORDER", name: "Sửa", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "DELETE_PURCHASE_ORDER", name: "Xóa", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "APPROVE_PURCHASE_ORDER", name: "Duyệt", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "REJECT_PURCHASE_ORDER", name: "Từ chối", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "CANCEL_PURCHASE_ORDER", name: "Hủy", module: "purchase_order", moduleLabel: "Đơn mua hàng" },
    { key: "REVERT_PURCHASE_ORDER", name: "Hoàn tác", module: "purchase_order", moduleLabel: "Đơn mua hàng" },

    // Phiếu thu
    { key: "GET_RECEIPT", name: "Xem", module: "receipt", moduleLabel: "Phiếu thu" },
    { key: "GET_RECEIPT_USER", name: "Xem của tôi", module: "receipt", moduleLabel: "Phiếu thu" },
    { key: "CREATE_RECEIPT", name: "Thêm", module: "receipt", moduleLabel: "Phiếu thu" },
    { key: "UPDATE_RECEIPT", name: "Sửa", module: "receipt", moduleLabel: "Phiếu thu" },
    { key: "DELETE_RECEIPT", name: "Xóa", module: "receipt", moduleLabel: "Phiếu thu" },
    { key: "POSTED_RECEIPT", name: "Ghi sổ", module: "receipt", moduleLabel: "Phiếu thu" },
    { key: "CANCEL_RECEIPT", name: "Hủy", module: "receipt", moduleLabel: "Phiếu thu" },

    // Phiếu chi (Payment Voucher)
    { key: "GET_PAYMENT", name: "Xem", module: "payment", moduleLabel: "Phiếu chi" },
    { key: "CREATE_PAYMENT", name: "Thêm", module: "payment", moduleLabel: "Phiếu chi" },
    { key: "UPDATE_PAYMENT", name: "Sửa", module: "payment", moduleLabel: "Phiếu chi" },
    { key: "DELETE_PAYMENT", name: "Xóa", module: "payment", moduleLabel: "Phiếu chi" },
    { key: "POSTED_PAYMENT", name: "Ghi sổ", module: "payment", moduleLabel: "Phiếu chi" },
    { key: "CANCEL_PAYMENT", name: "Hủy", module: "payment", moduleLabel: "Phiếu chi" },

    // Thuế
    { key: "GET_TAX", name: "Xem", module: "tax", moduleLabel: "Thuế" },
    { key: "CREATE_TAX", name: "Thêm", module: "tax", moduleLabel: "Thuế" },
    { key: "UPDATE_TAX", name: "Sửa", module: "tax", moduleLabel: "Thuế" },
    { key: "DELETE_TAX", name: "Xóa", module: "tax", moduleLabel: "Thuế" },

    // Sau bán hàng / Bảo hành / Hạn sử dụng
    { key: "GET_WARRANTY", name: "Xem", module: "warranty", moduleLabel: "Bảo hành" },
    { key: "CREATE_WARRANTY", name: "Thêm", module: "warranty", moduleLabel: "Bảo hành" },
    { key: "UPDATE_WARRANTY", name: "Cập nhật", module: "warranty", moduleLabel: "Bảo hành" },
    { key: "DELETE_WARRANTY", name: "Xóa", module: "warranty", moduleLabel: "Bảo hành" },
    { key: "REMIND_WARRANTY", name: "Nhắc nhở", module: "warranty", moduleLabel: "Bảo hành" },

    { key: "GET_EXPIRY", name: "Xem", module: "expiry", moduleLabel: "Hạn sử dụng" },
    { key: "CREATE_EXPIRY", name: "Thêm", module: "expiry", moduleLabel: "Hạn sử dụng" },
    { key: "UPDATE_EXPIRY", name: "Sửa", module: "expiry", moduleLabel: "Hạn sử dụng" },
    { key: "DELETE_EXPIRY", name: "Xóa", module: "expiry", moduleLabel: "Hạn sử dụng" },

    // Công nợ
    { key: "GET_DEBT", name: "Xem", module: "debt", moduleLabel: "Công nợ" },
    { key: "CREATE_DEBT", name: "Thêm", module: "debt", moduleLabel: "Công nợ" },
    { key: "UPDATE_DEBT", name: "Sửa", module: "debt", moduleLabel: "Công nợ" },
    { key: "DELETE_DEBT", name: "Xóa", module: "debt", moduleLabel: "Công nợ" },

    // Nhập kho
    { key: "GET_WAREHOUSE_IMPORT", name: "Xem", module: "warehouse_in", moduleLabel: "Nhập kho" },
    { key: "CREATE_WAREHOUSE_IMPORT", name: "Thêm", module: "warehouse_in", moduleLabel: "Nhập kho" },
    { key: "UPDATE_WAREHOUSE_IMPORT", name: "Cập nhật", module: "warehouse_in", moduleLabel: "Nhập kho" },
    { key: "DELETE_WAREHOUSE_IMPORT", name: "Xóa", module: "warehouse_in", moduleLabel: "Nhập kho" },
    { key: "POSTED_WAREHOUSE_IMPORT", name: "Ghi sổ", module: "warehouse_in", moduleLabel: "Nhập kho" },
    { key: "CANCEL_WAREHOUSE_IMPORT", name: "Hủy", module: "warehouse_in", moduleLabel: "Nhập kho" },

    // Xuất kho
    { key: "GET_WAREHOUSE_EXPORT", name: "Xem", module: "warehouse_out", moduleLabel: "Xuất kho" },
    { key: "CREATE_WAREHOUSE_EXPORT", name: "Thêm", module: "warehouse_out", moduleLabel: "Xuất kho" },
    { key: "UPDATE_WAREHOUSE_EXPORT", name: "Cập nhật", module: "warehouse_out", moduleLabel: "Xuất kho" },
    { key: "DELETE_WAREHOUSE_EXPORT", name: "Xóa", module: "warehouse_out", moduleLabel: "Xuất kho" },
    { key: "POSTED_WAREHOUSE_EXPORT", name: "Ghi sổ", module: "warehouse_out", moduleLabel: "Xuất kho" },
    { key: "CANCEL_WAREHOUSE_EXPORT", name: "Hủy", module: "warehouse_out", moduleLabel: "Xuất kho" },

    // Cài đặt
    { key: "GET_SETTING", name: "Xem cài đặt", module: "setting", moduleLabel: "Cài đặt" },
    { key: "GENERAL_SETTING", name: "Cài đặt chung", module: "setting", moduleLabel: "Cài đặt" },
    { key: "NOTIFICATION_SETTING", name: "Cài đặt thông báo", module: "setting", moduleLabel: "Cài đặt" },
    { key: "SYSTEM_SETTING", name: "Cài đặt hệ thống", module: "setting", moduleLabel: "Cài đặt" },
    { key: "GET_STORAGE_SIZE_SETTING", name: "Xem dung lượng lưu trữ", module: "setting", moduleLabel: "Cài đặt" },

    // Báo cáo
    { key: "GET_REVENUE_REPORT", name: "Xem doanh thu", module: "report", moduleLabel: "Báo cáo" },
    { key: "GET_INVENTORY_REPORT", name: "Xem tồn kho", module: "report", moduleLabel: "Báo cáo" },
    { key: "GET_SALES_REPORT", name: "Xem bán hàng", module: "report", moduleLabel: "Báo cáo" },
    { key: "GET_FINANCIAL_REPORT", name: "Xem tài chính", module: "report", moduleLabel: "Báo cáo" },

    // Khác
    { key: "GET_PERMISSION", name: "Xem quyền", module: "permission", moduleLabel: "Quyền hạn" },
    { key: "GET_AUDIT_LOG", name: "Xem nhật ký hệ thống", module: "audit_log", moduleLabel: "Nhật ký hệ thống" }
  ];


  const permissions = [];
  for (const p of permissionsData) {
    const permission = await prisma.permission.upsert({
      where: { permissionKey: p.key },
      update: { moduleLabel: p.moduleLabel },
      create: {
        permissionKey: p.key,
        permissionName: p.name,
        module: p.module,
        moduleLabel: p.moduleLabel,
      },
    });
    permissions.push(permission);
  }

  console.log(`✅ Created ${permissions.length} permissions\n`);

  // =====================================================
  // 3. SEED WAREHOUSES
  // =====================================================
  console.log('📝 Seeding warehouses...');

  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KNL-001' },
      update: {},
      create: {
        warehouseCode: 'KNL-001',
        warehouseName: 'Kho nguyên liệu trung tâm',
        warehouseType: 'raw_material',
        address: '123 Đường ABC, Quận 1',
        city: 'Hồ Chí Minh',
        region: 'Miền Nam',
        capacity: 1000,
        status: 'active',
      },
    }),
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KBB-001' },
      update: {},
      create: {
        warehouseCode: 'KBB-001',
        warehouseName: 'Kho bao bì trung tâm',
        warehouseType: 'packaging',
        address: '456 Đường DEF, Quận 2',
        city: 'Hồ Chí Minh',
        region: 'Miền Nam',
        capacity: 500,
        status: 'active',
      },
    }),
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KTP-001' },
      update: {},
      create: {
        warehouseCode: 'KTP-001',
        warehouseName: 'Kho thành phẩm trung tâm',
        warehouseType: 'finished_product',
        address: '789 Đường GHI, Quận 3',
        city: 'Hồ Chí Minh',
        region: 'Miền Nam',
        capacity: 800,
        status: 'active',
      },
    }),
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHH-001' },
      update: {},
      create: {
        warehouseCode: 'KHH-001',
        warehouseName: 'Kho hàng hóa trung tâm',
        warehouseType: 'goods',
        address: '101 Đường JKL, Quận 4',
        city: 'Hồ Chí Minh',
        region: 'Miền Nam',
        capacity: 600,
        status: 'active',
      },
    }),
  ]);

  console.log(`✅ Created ${warehouses.length} warehouses\n`);

  // =====================================================
  // 4. SEED ADMIN USER
  // =====================================================
  console.log('📝 Seeding admin user...');

  const adminRole = roles.find((r) => r.roleKey === 'admin');
  const hashedPassword = await bcrypt.hash('admin123', 10);

  let adminUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: 'leeminhkang@gmail.com' }, { employeeCode: 'NV-00010' }],
    },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        employeeCode: 'NV-00010',
        email: 'leeminhkang@gmail.com',
        passwordHash: hashedPassword,
        fullName: 'Quản trị viên hệ thống',
        phone: '0123456789',
        gender: 'male',
        roleId: adminRole!.id,
        status: 'active',
      },
    });
    console.log(`✅ Created admin user: ${adminUser.email} (password: admin123)\n`);
  } else {
    console.log(`✅ Admin user already exists: ${adminUser.email} / ${adminUser.employeeCode}\n`);
  }

  // =====================================================
  // 5. SEED ADDITIONAL USERS
  // =====================================================
  console.log('📝 Seeding additional users...');

  const warehouseManagerRole = roles.find((r) => r.roleKey === 'warehouse_manager');
  const warehouseStaffRole = roles.find((r) => r.roleKey === 'warehouse_staff');
  const salesStaffRole = roles.find((r) => r.roleKey === 'sales_staff');
  const accountantRole = roles.find((r) => r.roleKey === 'accountant');
  const productionManagerRole = roles.find((r) => r.roleKey === 'production_manager');

  const defaultPassword = await bcrypt.hash('admin123', 10);

  const additionalUsers = await Promise.all([
    // Warehouse Managers
    prisma.user.upsert({
      where: { email: 'hanhlanganime@gmail.com' },
      update: {},
      create: {
        employeeCode: 'NV-0002',
        email: 'hanhlanganime@gmail.com',
        passwordHash: hashedPassword,
        fullName: 'Nguyễn Văn Quản',
        phone: '0901234567',
        gender: 'male',
        roleId: warehouseManagerRole!.id,
        warehouseId: warehouses[0].id, // KNL-001
        status: 'active',
        createdBy: adminUser.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'momota19102003@gmail.com' },
      update: {},
      create: {
        employeeCode: 'NV-0003',
        email: 'momota19102003@gmail.com',
        passwordHash: hashedPassword,
        fullName: 'Trần Thị Lan',
        phone: '0902345678',
        gender: 'female',
        roleId: warehouseManagerRole!.id,
        warehouseId: warehouses[2].id, // KTP-001
        status: 'active',
        createdBy: adminUser.id,
      },
    }),

    // Warehouse Staff
    prisma.user.upsert({
      where: { email: 'staff1@company.com' },
      update: {},
      create: {
        employeeCode: 'NV-0004',
        email: 'staff1@company.com',
        passwordHash: hashedPassword,
        fullName: 'Lê Văn Tài',
        phone: '0903456789',
        gender: 'male',
        roleId: warehouseStaffRole!.id,
        warehouseId: warehouses[1].id, // KBB-001
        status: 'active',
        createdBy: adminUser.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'staff2@company.com' },
      update: {},
      create: {
        employeeCode: 'NV-0005',
        email: 'staff2@company.com',
        passwordHash: hashedPassword,
        fullName: 'Phạm Thị Hoa',
        phone: '0904567890',
        gender: 'female',
        roleId: warehouseStaffRole!.id,
        warehouseId: warehouses[3].id, // KHH-001
        status: 'active',
        createdBy: adminUser.id,
      },
    }),

    // Sales Staff
    prisma.user.upsert({
      where: { email: 'sales@company.com' },
      update: {},
      create: {
        employeeCode: 'NV-0006',
        email: 'sales@company.com',
        passwordHash: hashedPassword,
        fullName: 'Hoàng Văn Đạt',
        phone: '0905678901',
        gender: 'male',
        roleId: salesStaffRole!.id,
        status: 'active',
        createdBy: adminUser.id,
      },
    }),

    // Accountant
    prisma.user.upsert({
      where: { email: 'accountant@company.com' },
      update: {},
      create: {
        employeeCode: 'NV-0007',
        email: 'accountant@company.com',
        passwordHash: hashedPassword,
        fullName: 'Vũ Thị Mai',
        phone: '0906789012',
        gender: 'female',
        roleId: accountantRole!.id,
        status: 'active',
        createdBy: adminUser.id,
      },
    }),

    // Production Manager
    prisma.user.upsert({
      where: { email: 'production@company.com' },
      update: {},
      create: {
        employeeCode: 'NV-0008',
        email: 'production@company.com',
        passwordHash: defaultPassword,
        fullName: 'Đỗ Văn Cường',
        phone: '0907890123',
        gender: 'male',
        roleId: productionManagerRole!.id,
        status: 'active',
        createdBy: adminUser.id,
      },
    }),
  ]);

  console.log(`✅ Created ${additionalUsers.length} additional users (password: 123456)\n`);

  // Update warehouse managers
  console.log('📝 Updating warehouse managers...');

  await Promise.all([
    prisma.warehouse.update({
      where: { id: warehouses[0].id },
      data: { managerId: additionalUsers[0].id }, // Nguyễn Văn Quản
    }),
    prisma.warehouse.update({
      where: { id: warehouses[2].id },
      data: { managerId: additionalUsers[1].id }, // Trần Thị Lan
    }),
  ]);

  console.log('✅ Updated warehouse managers\n');

  // =====================================================
  // 6. ASSIGN ALL PERMISSIONS TO ADMIN
  // =====================================================
  console.log('📝 Assigning permissions to admin role...');

  const rolePermissions = await Promise.all(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole!.id,
            permissionId: p.id,
          },
        },
        update: {},
        create: {
          roleId: adminRole!.id,
          permissionId: p.id,
          assignedBy: adminUser.id,
        },
      })
    )
  );

  console.log(`✅ Assigned ${rolePermissions.length} permissions to admin role\n`);

  // =====================================================
  // 7. SEED CATEGORIES
  // =====================================================
  console.log('📝 Seeding categories...');

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { categoryCode: 'CAT-001' },
      update: {},
      create: {
        categoryCode: 'CAT-001',
        categoryName: 'Nước giải khát',
        slug: 'nuoc-giai-khat',
        status: 'active',
      },
    }),
    prisma.category.upsert({
      where: { categoryCode: 'CAT-002' },
      update: {},
      create: {
        categoryCode: 'CAT-002',
        categoryName: 'Nguyên liệu',
        slug: 'nguyen-lieu',
        status: 'active',
      },
    }),
    prisma.category.upsert({
      where: { categoryCode: 'CAT-003' },
      update: {},
      create: {
        categoryCode: 'CAT-003',
        categoryName: 'Bao bì',
        slug: 'bao-bi',
        status: 'active',
      },
    }),
  ]);

  console.log(`✅ Created ${categories.length} categories\n`);

  // =====================================================
  // 8. SEED SUPPLIERS
  // =====================================================
  console.log('📝 Seeding suppliers...');

  const suppliers = await Promise.all([
    prisma.supplier.upsert({
      where: { supplierCode: 'NCC-001' },
      update: {},
      create: {
        supplierCode: 'NCC-001',
        supplierName: 'Công ty TNHH Nguyên liệu ABC',
        supplierType: 'local',
        contactName: 'Nguyễn Văn A',
        phone: '0987654321',
        email: 'contact@abc.com',
        address: '123 Đường XYZ, Quận 5, TP.HCM',
        taxCode: '0123456789',
        status: 'active',
        createdBy: adminUser.id,
      },
    }),
    prisma.supplier.upsert({
      where: { supplierCode: 'NCC-002' },
      update: {},
      create: {
        supplierCode: 'NCC-002',
        supplierName: 'Công ty CP Bao bì Việt Nam',
        supplierType: 'local',
        contactName: 'Trần Thị B',
        phone: '0912345678',
        email: 'info@baobivn.com',
        address: '456 Đường DEF, Quận 6, TP.HCM',
        taxCode: '0987654321',
        status: 'active',
        createdBy: adminUser.id,
      },
    }),
  ]);

  console.log(`✅ Created ${suppliers.length} suppliers\n`);

  console.log('✅ Database seed completed successfully! 🎉\n');
  console.log('📌 Login Credentials:\n');
  console.log('👤 Admin:');
  console.log('   Email: leeminhkang@gmail.com');
  console.log('   Password: admin123\n');
  console.log('👥 Other Users (password: 123456):');
  console.log('   - manager1@company.com (Nguyễn Văn Quản - Warehouse Manager)');
  console.log('   - manager2@company.com (Trần Thị Lan - Warehouse Manager)');
  console.log('   - staff1@company.com (Lê Văn Tài - Warehouse Staff)');
  console.log('   - staff2@company.com (Phạm Thị Hoa - Warehouse Staff)');
  console.log('   - sales@company.com (Hoàng Văn Đạt - Sales Staff)');
  console.log('   - accountant@company.com (Vũ Thị Mai - Accountant)');
  console.log('   - production@company.com (Đỗ Văn Cường - Production Manager)\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
