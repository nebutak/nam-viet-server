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
    { key: "USER_MANAGEMENT", name: "Quản lý nhân sự", module: "user" },
    { key: "GET_USER", name: "Xem nhân sự", module: "user" },
    { key: "CREATE_USER", name: "Thêm nhân sự", module: "user" },
    { key: "UPDATE_USER", name: "Sửa nhân sự", module: "user" },
    { key: "DELETE_USER", name: "Xóa nhân sự", module: "user" },

    // Quản lý vai trò
    { key: "ROLE_MANAGEMENT", name: "Quản lý vai trò", module: "role" },
    { key: "GET_ROLE", name: "Xem vai trò", module: "role" },
    { key: "CREATE_ROLE", name: "Thêm vai trò", module: "role" },
    { key: "UPDATE_ROLE", name: "Sửa vai trò", module: "role" },
    { key: "DELETE_ROLE", name: "Xóa vai trò", module: "role" },

    // Quản lý vị trí
    { key: "POSITION_MANAGEMENT", name: "Quản lý vị trí", module: "position" },
    { key: "GET_POSITION", name: "Xem vị trí", module: "position" },
    { key: "CREATE_POSITION", name: "Thêm vị trí", module: "position" },
    { key: "UPDATE_POSITION", name: "Sửa vị trí", module: "position" },
    { key: "DELETE_POSITION", name: "Xóa vị trí", module: "position" },

    // Quản lý danh mục
    { key: "CATEGORY_MANAGEMENT", name: "Quản lý danh mục", module: "category" },
    { key: "GET_CATEGORY", name: "Xem danh mục", module: "category" },
    { key: "CREATE_CATEGORY", name: "Thêm danh mục", module: "category" },
    { key: "UPDATE_CATEGORY", name: "Sửa danh mục", module: "category" },
    { key: "DELETE_CATEGORY", name: "Xóa danh mục", module: "category" },

    // Quản lý đơn vị
    { key: "UNIT_MANAGEMENT", name: "Quản lý đơn vị", module: "unit" },
    { key: "GET_UNIT", name: "Xem đơn vị", module: "unit" },
    { key: "CREATE_UNIT", name: "Thêm đơn vị", module: "unit" },
    { key: "UPDATE_UNIT", name: "Sửa đơn vị", module: "unit" },
    { key: "DELETE_UNIT", name: "Xóa đơn vị", module: "unit" },

    // Quản lý thuộc tính
    { key: "GET_ATTRIBUTE", name: "Xem thuộc tính", module: "attribute" },
    { key: "CREATE_ATTRIBUTE", name: "Thêm thuộc tính", module: "attribute" },
    { key: "UPDATE_ATTRIBUTE", name: "Sửa thuộc tính", module: "attribute" },
    { key: "DELETE_ATTRIBUTE", name: "Xóa thuộc tính", module: "attribute" },

    // Quản lý nhà cung cấp
    { key: "SUPPLIER_MANAGEMENT", name: "Quản lý nhà cung cấp", module: "supplier" },
    { key: "GET_SUPPLIER", name: "Xem nhà cung cấp", module: "supplier" },
    { key: "CREATE_SUPPLIER", name: "Thêm nhà cung cấp", module: "supplier" },
    { key: "UPDATE_SUPPLIER", name: "Sửa nhà cung cấp", module: "supplier" },
    { key: "DELETE_SUPPLIER", name: "Xóa nhà cung cấp", module: "supplier" },

    // Quản lý sản phẩm
    { key: "PRODUCT_MANAGEMENT", name: "Quản lý sản phẩm", module: "product" },
    { key: "GET_PRODUCT", name: "Xem sản phẩm", module: "product" },
    { key: "CREATE_PRODUCT", name: "Thêm sản phẩm", module: "product" },
    { key: "UPDATE_PRODUCT", name: "Sửa sản phẩm", module: "product" },
    { key: "DELETE_PRODUCT", name: "Xóa sản phẩm", module: "product" },

    // Quản lý khách hàng
    { key: "CUSTOMER_MANAGEMENT", name: "Quản lý khách hàng", module: "customer" },
    { key: "GET_CUSTOMER", name: "Xem khách hàng", module: "customer" },
    { key: "GET_CUSTOMER_USER", name: "Xem khách hàng của tôi", module: "customer" },
    { key: "CREATE_CUSTOMER", name: "Thêm khách hàng", module: "customer" },
    { key: "UPDATE_CUSTOMER", name: "Sửa khách hàng", module: "customer" },
    { key: "DELETE_CUSTOMER", name: "Xóa khách hàng", module: "customer" },

    // Chăm sóc khách hàng & Nhiệm vụ
    { key: "CUSTOMER_CARE_MANAGEMENT", name: "Quản lý CSKH", module: "crm" },
    { key: "GET_CUSTOMER_CARE", name: "Xem CSKH", module: "crm" },
    { key: "CREATE_CUSTOMER_CARE", name: "Thêm CSKH", module: "crm" },
    { key: "UPDATE_CUSTOMER_CARE", name: "Sửa CSKH", module: "crm" },
    { key: "DELETE_CUSTOMER_CARE", name: "Xóa CSKH", module: "crm" },
    { key: "UPDATE_CUSTOMER_CARE_STATUS", name: "Sửa trạng thái CSKH", module: "crm" },
    { key: "CRM_MANAGEMENT", name: "Quản lý CRM", module: "crm" },
    
    { key: "TASK_MANAGEMENT", name: "Quản lý nhiệm vụ", module: "task" },
    { key: "GET_TASK", name: "Xem nhiệm vụ", module: "task" },
    { key: "CREATE_TASK", name: "Thêm nhiệm vụ", module: "task" },
    { key: "UPDATE_TASK", name: "Sửa nhiệm vụ", module: "task" },
    { key: "DELETE_TASK", name: "Xóa nhiệm vụ", module: "task" },
    { key: "UPDATE_TASK_STATUS", name: "Sửa trạng thái nhiệm vụ", module: "task" },

    // Quản lý hóa đơn / Bán hàng
    { key: "SALES_MANAGEMENT", name: "Quản lý bán hàng", module: "sales" },
    { key: "INVOICE_MANAGEMENT", name: "Quản lý hóa đơn", module: "invoice" },
    { key: "GET_INVOICE", name: "Xem hóa đơn", module: "invoice" },
    { key: "GET_INVOICE_USER", name: "Xem hóa đơn của tôi", module: "invoice" },
    { key: "CREATE_INVOICE", name: "Thêm hóa đơn", module: "invoice" },
    { key: "UPDATE_INVOICE", name: "Sửa hóa đơn", module: "invoice" },
    { key: "DELETE_INVOICE", name: "Xóa hóa đơn", module: "invoice" },
    { key: "DELETE_INVOICE_USER", name: "Xóa hóa đơn của tôi", module: "invoice" },
    { key: "APPROVE_INVOICE", name: "Duyệt hóa đơn", module: "invoice" },
    { key: "REJECT_INVOICE", name: "Từ chối hóa đơn", module: "invoice" },
    { key: "REVERT_INVOICE", name: "Hoàn tác hóa đơn", module: "invoice" },
    { key: "ISSUE_INVOICE", name: "Xuất hóa đơn", module: "invoice" },
    { key: "PREVIEW_INVOICE", name: "Xem trước hóa đơn", module: "invoice" },
    { key: "DOWNLOAD_INVOICE", name: "Tải hóa đơn", module: "invoice" },

    // Hợp đồng bán hàng
    { key: "SALES_CONTRACT_MANAGEMENT", name: "Quản lý HĐ bán", module: "sales_contract" },
    { key: "GET_SALES_CONTRACT", name: "Xem HĐ bán", module: "sales_contract" },
    { key: "SALES_CONTRACT_VIEW_ALL", name: "Xem tất cả HĐ bán", module: "sales_contract" },
    { key: "CREATE_SALES_CONTRACT", name: "Thêm HĐ bán", module: "sales_contract" },
    { key: "SALES_CONTRACT_CREATE", name: "Tạo HĐ bán", module: "sales_contract" },
    { key: "UPDATE_SALES_CONTRACT", name: "Sửa HĐ bán", module: "sales_contract" },
    { key: "SALES_CONTRACT_UPDATE", name: "Cập nhật HĐ bán", module: "sales_contract" },
    { key: "DELETE_SALES_CONTRACT", name: "Xóa HĐ bán", module: "sales_contract" },
    { key: "SALES_CONTRACT_DELETE", name: "Xóa HĐ bán", module: "sales_contract" },
    { key: "CONFIRM_SALES_CONTRACT", name: "Xác nhận HĐ bán", module: "sales_contract" },
    { key: "SALES_CONTRACT_APPROVE", name: "Duyệt HĐ bán", module: "sales_contract" },
    { key: "SALES_CONTRACT_CANCEL", name: "Hủy HĐ bán", module: "sales_contract" },
    { key: "SALES_CONTRACT_LIQUIDATE", name: "Thanh lý HĐ bán", module: "sales_contract" },

    // Đơn mua hàng
    { key: "PURCHASING_MANAGEMENT", name: "Quản lý mua hàng", module: "purchase" },
    { key: "PURCHASE_ORDER_MANAGEMENT", name: "Quản lý đơn mua", module: "purchase_order" },
    { key: "GET_PURCHASE_ORDER", name: "Xem đơn mua", module: "purchase_order" },
    { key: "GET_PURCHASE_ORDER_USER", name: "Xem đơn mua của tôi", module: "purchase_order" },
    { key: "PURCHASE_ORDER_VIEW_ALL", name: "Xem tất cả đơn mua", module: "purchase_order" },
    { key: "CREATE_PURCHASE_ORDER", name: "Thêm đơn mua", module: "purchase_order" },
    { key: "PURCHASE_ORDER_CREATE", name: "Tạo đơn mua", module: "purchase_order" },
    { key: "UPDATE_PURCHASE_ORDER", name: "Sửa đơn mua", module: "purchase_order" },
    { key: "PURCHASE_ORDER_UPDATE", name: "Cập nhật đơn mua", module: "purchase_order" },
    { key: "DELETE_PURCHASE_ORDER", name: "Xóa đơn mua", module: "purchase_order" },
    { key: "PURCHASE_ORDER_DELETE", name: "Xóa đơn mua", module: "purchase_order" },
    { key: "CONFIRM_PURCHASE_ORDER", name: "Xác nhận đơn mua", module: "purchase_order" },
    { key: "PURCHASE_ORDER_APPROVE", name: "Duyệt đơn mua", module: "purchase_order" },
    { key: "CANCEL_PURCHASE_ORDER", name: "Hủy đơn mua", module: "purchase_order" },
    { key: "PURCHASE_ORDER_CANCEL", name: "Hủy đơn mua", module: "purchase_order" },
    { key: "PURCHASE_ORDER_REVERT", name: "Hoàn tác đơn mua", module: "purchase_order" },

    // Hợp đồng mua hàng
    { key: "SALES_PURCHASE_MANAGEMENT", name: "Quản lý HĐ mua", module: "purchase_contract" },
    { key: "GET_PURCHASE_CONTRACT", name: "Xem HĐ mua", module: "purchase_contract" },
    { key: "PURCHASE_CONTRACT_VIEW_ALL", name: "Xem tất cả HĐ mua", module: "purchase_contract" },
    { key: "CREATE_PURCHASE_CONTRACT", name: "Thêm HĐ mua", module: "purchase_contract" },
    { key: "PURCHASE_CONTRACT_CREATE", name: "Tạo HĐ mua", module: "purchase_contract" },
    { key: "UPDATE_PURCHASE_CONTRACT", name: "Sửa HĐ mua", module: "purchase_contract" },
    { key: "PURCHASE_CONTRACT_UPDATE", name: "Cập nhật HĐ mua", module: "purchase_contract" },
    { key: "DELETE_PURCHASE_CONTRACT", name: "Xóa HĐ mua", module: "purchase_contract" },
    { key: "PURCHASE_CONTRACT_DELETE", name: "Xóa HĐ mua", module: "purchase_contract" },
    { key: "CONFIRM_PURCHASE_CONTRACT", name: "Xác nhận HĐ mua", module: "purchase_contract" },
    { key: "PURCHASE_CONTRACT_LIQUIDATE", name: "Thanh lý HĐ mua", module: "purchase_contract" },

    // Phiếu thu
    { key: "RECEIPT_MANAGEMENT", name: "Quản lý phiếu thu", module: "receipt" },
    { key: "GET_RECEIPT", name: "Xem phiếu thu", module: "receipt" },
    { key: "RECEIPT_VIEW_ALL", name: "Xem tất cả phiếu thu", module: "receipt" },
    { key: "GET_RECEIPT_USER", name: "Xem phiếu thu của tôi", module: "receipt" },
    { key: "RECEIPT_VIEW_OWN", name: "Xem phiếu thu của tôi", module: "receipt" },
    { key: "CREATE_RECEIPT", name: "Thêm phiếu thu", module: "receipt" },
    { key: "RECEIPT_CREATE", name: "Tạo phiếu thu", module: "receipt" },
    { key: "UPDATE_RECEIPT", name: "Sửa phiếu thu", module: "receipt" },
    { key: "RECEIPT_UPDATE", name: "Cập nhật phiếu thu", module: "receipt" },
    { key: "DELETE_RECEIPT", name: "Xóa phiếu thu", module: "receipt" },
    { key: "RECEIPT_DELETE", name: "Xóa phiếu thu", module: "receipt" },
    { key: "DELETE_RECEIPT_USER", name: "Xóa phiếu thu của tôi", module: "receipt" },
    { key: "RECEIPT_APPROVE", name: "Duyệt phiếu thu", module: "receipt" },
    { key: "RECEIPT_CANCEL", name: "Hủy phiếu thu", module: "receipt" },

    // Phiếu chi (Payment Voucher)
    { key: "PAYMENT_VOUCHER_MANAGEMENT", name: "Quản lý phiếu chi", module: "payment" },
    { key: "GET_PAYMENT_VOUCHER", name: "Xem phiếu chi", module: "payment" },
    { key: "CREATE_PAYMENT_VOUCHER", name: "Thêm phiếu chi", module: "payment" },
    { key: "UPDATE_PAYMENT_VOUCHER", name: "Sửa phiếu chi", module: "payment" },
    { key: "DELETE_PAYMENT_VOUCHER", name: "Xóa phiếu chi", module: "payment" },
    { key: "COMPLETE_PAYMENT_VOUCHER", name: "Hoàn thành phiếu chi", module: "payment" },
    
    // Payment
    { key: "PAYMENT_VIEW_ALL", name: "Xem tất cả phiếu chi", module: "payment" },
    { key: "PAYMENT_VIEW_OWN", name: "Xem phiếu chi của tôi", module: "payment" },
    { key: "CREATE_PAYMENT", name: "Tạo phiếu chi", module: "payment" },
    { key: "PAYMENT_CREATE", name: "Tạo phiếu chi", module: "payment" },
    { key: "UPDATE_PAYMENT", name: "Cập nhật phiếu chi", module: "payment" },
    { key: "PAYMENT_UPDATE", name: "Cập nhật phiếu chi", module: "payment" },
    { key: "DELETE_PAYMENT", name: "Xóa phiếu chi", module: "payment" },
    { key: "PAYMENT_DELETE", name: "Xóa phiếu chi", module: "payment" },
    { key: "PAYMENT_APPROVE", name: "Duyệt phiếu chi", module: "payment" },
    { key: "PAYMENT_CANCEL", name: "Hủy phiếu chi", module: "payment" },

    // Thuế
    { key: "TAX_MANAGEMENT", name: "Quản lý thuế", module: "tax" },
    { key: "GET_TAX", name: "Xem thuế", module: "tax" },
    { key: "CREATE_TAX", name: "Thêm thuế", module: "tax" },
    { key: "UPDATE_TAX", name: "Sửa thuế", module: "tax" },
    { key: "DELETE_TAX", name: "Xóa thuế", module: "tax" },

    // Sau bán hàng / Bảo hành / Hạn sử dụng
    { key: "AFTER_SALES_MANAGEMENT", name: "Quản lý sau bán hàng", module: "after_sales" },
    { key: "WARRANTY_MANAGEMENT", name: "Quản lý bảo hành", module: "warranty" },
    { key: "GET_WARRANTY", name: "Xem bảo hành", module: "warranty" },
    { key: "UPDATE_WARRANTY", name: "Cập nhật bảo hành", module: "warranty" },
    { key: "DELETE_WARRANTY", name: "Xóa bảo hành", module: "warranty" },
    { key: "REMIND_WARRANTY", name: "Nhắc nhở bảo hành", module: "warranty" },
    { key: "UPDATE_WARRANTY_STATUS", name: "Sửa trạng thái bảo hành", module: "warranty" },
    
    { key: "EXPIRY_MANAGEMENT", name: "Quản lý HSD", module: "expiry" },
    { key: "GET_EXPIRY", name: "Xem HSD", module: "expiry" },
    { key: "GET_EXPIRY_USER", name: "Xem HSD của tôi", module: "expiry" },
    { key: "CREATE_EXPIRY", name: "Thêm HSD", module: "expiry" },
    { key: "UPDATE_EXPIRY", name: "Sửa HSD", module: "expiry" },
    { key: "DELETE_EXPIRY", name: "Xóa HSD", module: "expiry" },

    // Kho
    { key: "WAREHOUSE_MANAGEMENT", name: "Quản lý kho", module: "warehouse" },
    { key: "STOCK_MANAGEMENT", name: "Quản lý tồn kho", module: "stock" },
    { key: "GET_STOCK", name: "Xem tồn kho", module: "stock" },
    { key: "CREATE_STOCK", name: "Thêm tồn kho", module: "stock" },
    { key: "UPDATE_STOCK", name: "Sửa tồn kho", module: "stock" },
    { key: "DELETE_STOCK", name: "Xóa tồn kho", module: "stock" },
    { key: "LOT_MANAGEMENT", name: "Quản lý lô", module: "lot" },
    { key: "GET_LOT", name: "Xem lô", module: "lot" },
    { key: "CREATE_LOT", name: "Thêm lô", module: "lot" },
    { key: "UPDATE_LOT", name: "Sửa lô", module: "lot" },
    { key: "DELETE_LOT", name: "Xóa lô", module: "lot" },

    // Nhập xuất kho
    { key: "WAREHOUSE_RECEIPT_MANAGEMENT", name: "Quản lý phiếu nhập kho", module: "warehouse_in" },
    { key: "IMPORT_RECEIPT_MANAGEMENT", name: "Quản lý phiếu nhập", module: "warehouse_in" },
    { key: "GET_WAREHOUSE_RECEIPT", name: "Xem phiếu nhập kho", module: "warehouse_in" },
    { key: "CREATE_WAREHOUSE_RECEIPT", name: "Thêm phiếu nhập kho", module: "warehouse_in" },
    { key: "UPDATE_WAREHOUSE_RECEIPT", name: "Sửa phiếu nhập kho", module: "warehouse_in" },
    { key: "DELETE_WAREHOUSE_RECEIPT", name: "Xóa phiếu nhập kho", module: "warehouse_in" },
    { key: "POST_WAREHOUSE_RECEIPT", name: "Ghi sổ phiếu nhập kho", module: "warehouse_in" },
    { key: "GET_IMPORT_RECEIPT", name: "Xem phiếu nhập", module: "warehouse_in" },
    { key: "CREATE_IMPORT_RECEIPT", name: "Thêm phiếu nhập", module: "warehouse_in" },
    { key: "UPDATE_IMPORT_RECEIPT", name: "Sửa phiếu nhập", module: "warehouse_in" },
    { key: "DELETE_IMPORT_RECEIPT", name: "Xóa phiếu nhập", module: "warehouse_in" },

    { key: "WAREHOUSE_IMPORT_VIEW_ALL", name: "Xem tất cả phiếu nhập", module: "warehouse_in" },
    { key: "WAREHOUSE_IMPORT_CREATE", name: "Tạo phiếu nhập", module: "warehouse_in" },
    { key: "WAREHOUSE_IMPORT_UPDATE", name: "Cập nhật phiếu nhập", module: "warehouse_in" },
    { key: "WAREHOUSE_IMPORT_DELETE", name: "Xóa phiếu nhập", module: "warehouse_in" },
    { key: "WAREHOUSE_IMPORT_CONFIRM", name: "Xác nhận phiếu nhập", module: "warehouse_in" },
    { key: "WAREHOUSE_IMPORT_POST", name: "Ghi sổ phiếu nhập", module: "warehouse_in" },
    { key: "WAREHOUSE_IMPORT_CANCEL", name: "Hủy phiếu nhập", module: "warehouse_in" },

    { key: "WAREHOUSE_EXPORT_VIEW_ALL", name: "Xem tất cả phiếu xuất", module: "warehouse_out" },
    { key: "WAREHOUSE_EXPORT_CREATE", name: "Tạo phiếu xuất", module: "warehouse_out" },
    { key: "WAREHOUSE_EXPORT_UPDATE", name: "Cập nhật phiếu xuất", module: "warehouse_out" },
    { key: "WAREHOUSE_EXPORT_DELETE", name: "Xóa phiếu xuất", module: "warehouse_out" },
    { key: "WAREHOUSE_EXPORT_CONFIRM", name: "Xác nhận phiếu xuất", module: "warehouse_out" },
    { key: "WAREHOUSE_EXPORT_POST", name: "Ghi sổ phiếu xuất", module: "warehouse_out" },
    { key: "WAREHOUSE_EXPORT_CANCEL", name: "Hủy phiếu xuất", module: "warehouse_out" },

    // Báo cáo tồn kho
    { key: "INVENTORY_MANAGEMENT", name: "Quản lý báo cáo tồn kho", module: "inventory" },
    { key: "GET_INVENTORY", name: "Xem tồn kho", module: "inventory" },
    { key: "GET_INVENTORY_BALANCE", name: "Xem số dư tồn kho", module: "inventory" },
    { key: "INVENTORY_BALANCE_VIEW", name: "Xem số dư tồn kho", module: "inventory" },
    { key: "INVENTORY_SUMMARY_VIEW", name: "Xem tổng hợp tồn kho", module: "inventory" },
    { key: "GET_INVENTORY_LEDGER", name: "Xem sổ chi tiết vật tư", module: "inventory" },
    { key: "INVENTORY_LEDGER_VIEW", name: "Xem sổ chi tiết vật tư", module: "inventory" },
    { key: "INVENTORY_NXT_VIEW", name: "Xem báo cáo XNT", module: "inventory" },
    { key: "INVENTORY_VALUE_VIEW", name: "Xem giá trị tồn kho", module: "inventory" },
    { key: "INVENTORY_PRODUCT_VIEW", name: "Xem tồn kho theo sản phẩm", module: "inventory" },
    { key: "EXPORT_INVENTORY_REPORT", name: "Xuất báo cáo tồn kho", module: "inventory" },

    // Credit Note
    { key: "CREDIT_NOTE_MANAGEMENT", name: "Quản lý giấy báo có", module: "credit_note" },
    { key: "GET_CREDIT_NOTE", name: "Xem giấy báo có", module: "credit_note" },
    { key: "CREATE_CREDIT_NOTE", name: "Thêm giấy báo có", module: "credit_note" },
    { key: "UPDATE_CREDIT_NOTE", name: "Sửa giấy báo có", module: "credit_note" },
    { key: "DELETE_CREDIT_NOTE", name: "Xóa giấy báo có", module: "credit_note" },

    // Báo cáo
    { key: "OVERVIEW_MANAGEMENT", name: "Quản lý tổng quan", module: "report" },
    { key: "REPORT_MANAGEMENT", name: "Quản lý báo cáo", module: "report" },
    { key: "REPORTS_MANAGEMENT", name: "Quản lý báo cáo", module: "report" },
    { key: "GET_REPORT", name: "Xem báo cáo", module: "report" },
    { key: "EXPORT_REPORT", name: "Xuất báo cáo", module: "report" },
    { key: "REPORT_PURCHASE_VIEW", name: "Xem báo cáo mua hàng", module: "report" },
    { key: "REPORT_UNDELIVERED_VIEW", name: "Xem báo cáo chưa giao", module: "report" },
    { key: "REPORT_UNRECEIVED_VIEW", name: "Xem báo cáo chưa nhận", module: "report" },

    // Cài đặt
    { key: "SETTING_MANAGEMENT", name: "Quản lý cài đặt", module: "setting" },
    { key: "SETTINGS_MANAGEMENT", name: "Quản lý cài đặt", module: "setting" },
    { key: "GET_SETTING", name: "Xem cài đặt", module: "setting" },
    { key: "GENERAL_SETTING", name: "Cài đặt chung", module: "setting" },
    { key: "SHARING_RATIO_SETTING", name: "Cài đặt tỷ lệ", module: "setting" },
    { key: "NOTIFICATION_SETTING", name: "Cài đặt thông báo", module: "setting" },
    { key: "SYSTEM_SETTING", name: "Cài đặt hệ thống", module: "setting" },
    { key: "SESSION_SETTING", name: "Cài đặt phiên bản", module: "setting" },
    { key: "GET_STORAGE_SIZE_SETTING", name: "Xem dung lượng lưu trữ", module: "setting" },
    
    // Khác
    { key: "PRODUCTS_MANAGEMENT", name: "Quản lý sản phẩm", module: "product" },
    { key: "GET_PERMISSION", name: "Xem quyền", module: "permission" },
    { key: "GET_AUDIT_LOG", name: "Xem nhật ký hệ thống", module: "audit_log" }
  ];


  const permissions = await Promise.all(
    permissionsData.map((p) =>
      prisma.permission.upsert({
        where: { permissionKey: p.key },
        update: {},
        create: {
          permissionKey: p.key,
          permissionName: p.name,
          module: p.module,
        },
      })
    )
  );

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
      OR: [{ email: 'hovtoi@gmail.com' }, { employeeCode: 'NV-00010' }],
    },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        employeeCode: 'NV-00010',
        email: 'hovtoi@gmail.com',
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
