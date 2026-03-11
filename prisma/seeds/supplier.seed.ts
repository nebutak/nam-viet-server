import { PrismaClient } from '@prisma/client';

export async function seedSuppliers(prisma: PrismaClient, adminUserId: number) {
  console.log('📝 Seeding suppliers for agricultural supplies...');

  const suppliers = await Promise.all([
    prisma.supplier.upsert({
      where: { supplierCode: 'NCC-PB-001' },
      update: {},
      create: {
        supplierCode: 'NCC-PB-001',
        supplierName: 'Công ty Cổ phần Phân bón Bình Điền',
        supplierType: 'local',
        contactName: 'Lê Văn Khuyến',
        phone: '0901234567',
        email: 'contact@binhdien.com',
        address: 'KCN Hiệp Phước, Huyện Nhà Bè, TP.HCM',
        taxCode: '0300581765',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.supplier.upsert({
      where: { supplierCode: 'NCC-PB-002' },
      update: {},
      create: {
        supplierCode: 'NCC-PB-002',
        supplierName: 'Tập đoàn Hóa chất Đức Giang (DGC)',
        supplierType: 'local',
        contactName: 'Nguyễn Đăng Quang',
        phone: '0912345678',
        email: 'info@ducgiangchem.com',
        address: 'Số 18, Ngõ 23 Lâm Du, Long Biên, Hà Nội',
        taxCode: '0101426759',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.supplier.upsert({
      where: { supplierCode: 'NCC-TBVTV-001' },
      update: {},
      create: {
        supplierCode: 'NCC-TBVTV-001',
        supplierName: 'Công ty Cổ phần Nông dược HAI',
        supplierType: 'local',
        contactName: 'Trần Quyết Chiến',
        phone: '0934567890',
        email: 'lienhe@nongduochai.com',
        address: '28 Mạc Đĩnh Chi, Đa Kao, Quận 1, TP.HCM',
        taxCode: '0300482436',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.supplier.upsert({
      where: { supplierCode: 'NCC-TBVTV-002' },
      update: {},
      create: {
        supplierCode: 'NCC-TBVTV-002',
        supplierName: 'Tập đoàn Lộc Trời',
        supplierType: 'local',
        contactName: 'Huỳnh Văn Thòn',
        phone: '0987123456',
        email: 'info@loctroi.vn',
        address: '23 Hà Hoàng Hổ, Mỹ Xuyên, Long Xuyên, An Giang',
        taxCode: '1600125860',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.supplier.upsert({
      where: { supplierCode: 'NCC-VT-001' },
      update: {},
      create: {
        supplierCode: 'NCC-VT-001',
        supplierName: 'Công ty SX Nhựa Nông Nghiệp Đạt Hòa',
        supplierType: 'local',
        contactName: 'Võ Minh Nhật',
        phone: '0978564321',
        email: 'sales@dathoa.com',
        address: 'KCN Tân Tạo, Bình Tân, TP.HCM',
        taxCode: '0302484768',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
  ]);

  console.log(`✅ Created ${suppliers.length} agricultural suppliers\n`);
  return suppliers;
}
