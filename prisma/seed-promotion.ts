import { PrismaClient, PromotionType, ApplicableTo, PromotionStatus } from '@prisma/client';
import { addDays, startOfDay, endOfDay } from 'date-fns';

const prisma = new PrismaClient();

export async function main() {
  console.log('🌱 Bắt đầu seed dữ liệu Promotions...');

  await prisma.promotionProduct.deleteMany({});
  await prisma.promotion.deleteMany({});

  // Lấy dữ liệu cần thiết
  const users = await prisma.user.findMany({ take: 5 });
  const products = await prisma.product.findMany({ take: 20 });

  let adminUser = users.find((u) => u.roleId === 1) || users[0];

  if (!adminUser) {
    console.warn('⚠️  Không tìm thấy users, tạo admin tạm thời...');
    let role = await prisma.role.findFirst({ where: { roleKey: 'ADMIN' } });
    if (!role) {
      // Find any role if ADMIN is not found
      role = await prisma.role.findFirst() || await prisma.role.create({
        data: {
          roleKey: 'ADMIN',
          roleName: 'Quản trị viên',
        }
      });
    }

    adminUser = await prisma.user.create({
      data: {
        employeeCode: 'ADMIN_' + Date.now(),
        email: 'admin_' + Date.now() + '@example.com',
        passwordHash: 'dummy',
        fullName: 'Admin Seed',
        roleId: role.id,
      }
    });
  }
  if (!products.length) {
    console.warn('⚠️  Không tìm thấy products, hãy chạy seed products trước');
    return;
  }

  const now = new Date();

  // ================================================================
  // CHIẾN DỊCH 1: GIẢM % - KHUYẾN MÃI ĐẦU THÁNG
  // ================================================================
  const promo1 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-DAUTTHANG-2026',
      promotionName: 'Khuyến mãi đầu tháng - Giảm 15% toàn bộ sản phẩm',
      promotionType: PromotionType.percent_discount,
      discountValue: 15,
      maxDiscountValue: 500000,
      startDate: startOfDay(now),
      endDate: endOfDay(addDays(now, 7)),
      isRecurring: true,
      applicableTo: ApplicableTo.all,
      minOrderValue: 500000,
      minQuantity: 1,
      conditions: {
        applicable_customer_types: ['retail', 'wholesale'],
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
      },
      quantityLimit: 1000,
      usageCount: 145,
      status: PromotionStatus.active,
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: addDays(now, -10),
    },
  });

  console.log(`✅ Tạo promotion: ${promo1.promotionCode} (Active)`);

  // ================================================================
  // CHIẾN DỊCH 2: MUA X TẶNG Y - CHƯƠNG TRÌNH HỘTRO BÓNG LọC
  // ================================================================
  const promo2 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-MUATANG-2026',
      promotionName: 'Mua 3 chai amino lãi 1 chai - Chương trình ưu đãi',
      promotionType: PromotionType.buy_x_get_y,
      discountValue: 0,
      startDate: startOfDay(addDays(now, -5)),
      endDate: endOfDay(addDays(now, 25)),
      isRecurring: false,
      applicableTo: ApplicableTo.specific_product,
      minOrderValue: 0,
      minQuantity: 3,
      conditions: {
        buy_quantity: 3,
        get_quantity: 1,
        get_same_product: false,
      },
      quantityLimit: 500,
      usageCount: 87,
      status: PromotionStatus.active,
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: addDays(now, -4),
      products: {
        create: [
          {
            productId: products[0].id,
            minQuantity: 3,
            giftProductId: products[1].id,
            giftQuantity: 1,
            note: 'Mua 3 chai Siêu đậu trái được tặng 1 chai Navi Amino',
          },
        ],
      },
    },
    include: {
      products: true,
    },
  });

  console.log(`✅ Tạo promotion: ${promo2.promotionCode} (Active)`);

  // ================================================================
  // CHIẾN DỊCH 3: GIẢM CỐ ĐỊNH - FLASH SALE CUỐI TUẦN
  // ================================================================
  const promo3 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-FLASH-CUOITUAN-2026',
      promotionName: 'Flash Sale Cuối tuần - Giảm 200k cho đơn 2 triệu',
      promotionType: PromotionType.fixed_discount,
      discountValue: 200000,
      maxDiscountValue: 200000,
      startDate: startOfDay(addDays(now, 3)),
      endDate: endOfDay(addDays(now, 5)),
      isRecurring: false,
      applicableTo: ApplicableTo.category,
      minOrderValue: 2000000,
      minQuantity: 1,
      conditions: {
        days_of_week: [5, 6], // Saturday, Sunday
        time_slots: ['18:00-23:59'],
      },
      quantityLimit: 200,
      usageCount: 42,
      status: PromotionStatus.active,
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: addDays(now, -3),
    },
  });

  console.log(`✅ Tạo promotion: ${promo3.promotionCode} (Active)`);

  // ================================================================
  // CHIẾN DỊCH 4: TẶNG QUÀ - KHUYẾN MÃI TẾT
  // ================================================================
  const promo4 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-TET-2026',
      promotionName: 'Chương trình Tết - Mua hàng tặng quà',
      promotionType: PromotionType.gift,
      startDate: startOfDay(addDays(now, 45)),
      endDate: endOfDay(addDays(now, 60)),
      isRecurring: false,
      applicableTo: ApplicableTo.all,
      minOrderValue: 1500000,
      minQuantity: 1,
      conditions: {
        applicable_customer_types: ['retail', 'wholesale', 'vip'],
      },
      quantityLimit: 300,
      usageCount: 0,
      status: PromotionStatus.pending,
      createdBy: adminUser.id,
    },
    include: {
      products: true,
    },
  });

  console.log(`✅ Tạo promotion: ${promo4.promotionCode} (Pending)`);

  // ================================================================
  // CHIẾN DỊCH 5: KHUYẾN MÃI VIP - ƯU ĐÃI ĐẠI LÝ
  // ================================================================
  const promo5 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-VIP-DAIKHATTHANG-2026',
      promotionName: 'Ưu đãi đại lý VIP - Giảm 25% hàng tháng',
      promotionType: PromotionType.percent_discount,
      discountValue: 25,
      maxDiscountValue: 1000000,
      startDate: startOfDay(addDays(now, -15)),
      endDate: endOfDay(addDays(now, 45)),
      isRecurring: true,
      applicableTo: ApplicableTo.all,
      minOrderValue: 5000000,
      minQuantity: 1,
      conditions: {
        applicable_customer_types: ['vip', 'distributor'],
      },
      quantityLimit: 50,
      usageCount: 23,
      status: PromotionStatus.active,
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: addDays(now, -14),
    },
  });

  console.log(`✅ Tạo promotion: ${promo5.promotionCode} (Active)`);

  // ================================================================
  // CHIẾN DỊCH 6: SẮP HẾT HẠN - KHUYẾN MÃI THANH LÝ
  // ================================================================
  const promo6 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-THANHLYCUOI-2026',
      promotionName: 'Khuyến mãi thanh lý - Hàng sắp hết hạn giảm 40%',
      promotionType: PromotionType.percent_discount,
      discountValue: 40,
      startDate: startOfDay(addDays(now, 2)),
      endDate: endOfDay(addDays(now, 4)),
      isRecurring: false,
      applicableTo: ApplicableTo.specific_product,
      minOrderValue: 0,
      minQuantity: 1,
      conditions: {
        applicable_customer_types: ['retail', 'wholesale'],
      },
      quantityLimit: 150,
      usageCount: 0,
      status: PromotionStatus.active,
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: addDays(now, 1),
    },
  });

  console.log(`✅ Tạo promotion: ${promo6.promotionCode} (Active - Sắp hết hạn)`);

  // ================================================================
  // CHIẾN DỊCH 7: CHỜ DUYỆT - KHUYẾN MÃI HÈ
  // ================================================================
  const promo7 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-HE-2026',
      promotionName: 'Chương trình hè - Giảm 20% cho quý đại lý',
      promotionType: PromotionType.percent_discount,
      discountValue: 20,
      maxDiscountValue: 800000,
      startDate: startOfDay(addDays(now, 60)),
      endDate: endOfDay(addDays(now, 90)),
      isRecurring: true,
      applicableTo: ApplicableTo.all,
      minOrderValue: 3000000,
      minQuantity: 1,
      conditions: {
        applicable_customer_types: ['wholesale', 'vip', 'distributor'],
      },
      quantityLimit: 500,
      usageCount: 0,
      status: PromotionStatus.pending,
      createdBy: adminUser.id,
    },
  });

  console.log(`✅ Tạo promotion: ${promo7.promotionCode} (Pending)`);

  // ================================================================
  // CHIẾN DỊCH 8: ĐÃ HẾT HẠN - KHUYẾN MÃI QUỐC TẾ TRỊ
  // ================================================================
  const promo8 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-QUOCTE-2025',
      promotionName: 'Chương trình Quốc tế Phụ nữ - Giảm 10%',
      promotionType: PromotionType.percent_discount,
      discountValue: 10,
      startDate: startOfDay(addDays(now, -80)),
      endDate: endOfDay(addDays(now, -10)),
      isRecurring: false,
      applicableTo: ApplicableTo.all,
      minOrderValue: 500000,
      minQuantity: 1,
      conditions: {
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
      },
      quantityLimit: 1000,
      usageCount: 523,
      status: PromotionStatus.expired,
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: addDays(now, -75),
    },
  });

  console.log(`✅ Tạo promotion: ${promo8.promotionCode} (Expired)`);

  // ================================================================
  // CHIẾN DỊCH 9: MỰC ĐÍCH CAO - KHUYẾN MÃI KHÁCH HÀNG MỚI
  // ================================================================
  const promo9 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-KHNEW-2026',
      promotionName: 'Welcome - Khách hàng mới giảm 30%',
      promotionType: PromotionType.percent_discount,
      discountValue: 30,
      maxDiscountValue: 600000,
      startDate: startOfDay(now),
      endDate: endOfDay(addDays(now, 90)),
      isRecurring: false,
      applicableTo: ApplicableTo.all,
      minOrderValue: 1000000,
      minQuantity: 1,
      conditions: {
        applicable_customer_types: ['retail'],
      },
      quantityLimit: 100,
      usageCount: 12,
      status: PromotionStatus.active,
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: addDays(now, -2),
    },
  });

  console.log(`✅ Tạo promotion: ${promo9.promotionCode} (Active)`);

  // ================================================================
  // CHIẾN DỊCH 10: HOÀN THÀNH TẤT CẢ - KHUYẾN MÃI CLEARANCE
  // ================================================================
  const promo10 = await prisma.promotion.create({
    data: {
      promotionCode: 'KM-CLEARANCE-2026',
      promotionName: 'Clearance Sale - Thanh lý tồn kho cuối năm',
      promotionType: PromotionType.fixed_discount,
      discountValue: 500000,
      startDate: startOfDay(addDays(now, 100)),
      endDate: endOfDay(addDays(now, 120)),
      isRecurring: false,
      applicableTo: ApplicableTo.all,
      minOrderValue: 2500000,
      minQuantity: 1,
      conditions: {
        applicable_customer_types: ['retail', 'wholesale'],
      },
      quantityLimit: 250,
      usageCount: 0,
      status: PromotionStatus.pending,
      createdBy: adminUser.id,
    },
  });

  console.log(`✅ Tạo promotion: ${promo10.promotionCode} (Pending)`);

  // ================================================================
  // THỐNG KÊ
  // ================================================================
  const totalPromotions = await prisma.promotion.count();
  const activeCount = await prisma.promotion.count({ where: { status: PromotionStatus.active } });
  const pendingCount = await prisma.promotion.count({ where: { status: PromotionStatus.pending } });
  const expiredCount = await prisma.promotion.count({ where: { status: PromotionStatus.expired } });

  console.log('\n📊 THỐNG KÊ PROMOTION:');
  console.log(`   📌 Tổng chương trình: ${totalPromotions}`);
  console.log(`   ✅ Đang chạy: ${activeCount}`);
  console.log(`   ⏳ Chờ duyệt: ${pendingCount}`);
  console.log(`   ❌ Đã hết hạn: ${expiredCount}`);
  console.log(`   📈 Tổng lần sử dụng: ${1232}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\n✨ Seed promotions hoàn tất!');
  })
  .catch(async (e) => {
    console.error('❌ Lỗi seed promotions:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
