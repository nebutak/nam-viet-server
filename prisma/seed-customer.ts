import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function main() {
  console.log('👥 Bắt đầu seed dữ liệu Khách hàng (Customers)...');

  await prisma.customer.deleteMany({});

  const customers = [
    // ========== NHÓM 1: ĐẠI LÝ CẤP 1 (Distributor) ==========
    {
      customerCode: 'KH-DL-DONGTHAP-001',
      customerName: 'Đại lý Phân bón Tấn Phát',
      customerType: 'company',
      classification: 'distributor',
      contactPerson: 'Ông Nguyễn Văn Tấn',
      phone: '0918123456',
      email: 'tanphat.daily@gmail.com',
      address: '123 Quốc lộ 30, Phường 1, TP. Cao Lãnh, Đồng Tháp',
      taxCode: '1200567890',
      creditLimit: 500000000, // 500 triệu
      currentDebt: 125000000,
      status: 'active',
      notes: 'Đại lý chiến lược khu vực Đồng Tháp. Mua số lượng lớn, thanh toán đúng hạn.',
    },
    {
      customerCode: 'KH-DL-CANTHO-001',
      customerName: 'Cửa hàng Nông sản Cửu Long',
      customerType: 'company',
      classification: 'distributor',
      contactPerson: 'Bà Trần Thị Hồng',
      phone: '0907234567',
      email: 'cuulongnongsan@yahoo.com',
      address: '456 Đường 30/4, Phường Hưng Lợi, Quận Ninh Kiều, Cần Thơ',
      taxCode: '0309876543',
      creditLimit: 400000000,
      currentDebt: 180000000,
      status: 'active',
      notes: 'Đại lý lớn tại Cần Thơ. Chuyên phân phối cho các vườn trái cây ở ĐBSCL.',
    },
    {
      customerCode: 'KH-DL-ANGIANG-001',
      customerName: 'Công ty TNHH Nông nghiệp Bình Minh',
      customerType: 'company',
      classification: 'distributor',
      contactPerson: 'Ông Lê Văn Minh',
      phone: '0919345678',
      email: 'binhminhnongsan@gmail.com',
      address: 'Ấp Bình Hòa, Xã Long Hòa, Huyện Phú Tân, An Giang',
      taxCode: '0901234567',
      creditLimit: 350000000,
      currentDebt: 95000000,
      status: 'active',
      notes: 'Phân phối chính cho khu vực trồng lúa An Giang.',
    },
    {
      customerCode: 'KH-DL-VINHLONG-001',
      customerName: 'Đại lý Vật tư Nông nghiệp Thanh Bình',
      customerType: 'company',
      classification: 'distributor',
      contactPerson: 'Ông Võ Thanh Bình',
      phone: '0903456789',
      email: 'thanhbinh.daily@gmail.com',
      address: '789 Quốc lộ 1A, Phường 1, TP. Vĩnh Long, Vĩnh Long',
      taxCode: '1400123456',
      creditLimit: 300000000,
      currentDebt: 75000000,
      status: 'active',
      notes: 'Đại lý uy tín, thường xuyên tham gia các buổi hội thảo kỹ thuật.',
    },

    // ========== NHÓM 2: ĐẠI LÝ CẤP 2 / MUA SỈ (Wholesale) ==========
    {
      customerCode: 'KH-SI-DONGTHAP-002',
      customerName: 'Cửa hàng Phân bón Nông Lâm',
      customerType: 'company',
      classification: 'wholesale',
      contactPerson: 'Anh Nguyễn Hữu Lâm',
      phone: '0918777888',
      email: 'nonglam.ch@gmail.com',
      address: '234 QL 80, Phường Mỹ Phú, TP. Cao Lãnh, Đồng Tháp',
      taxCode: '1200678901',
      creditLimit: 150000000,
      currentDebt: 45000000,
      status: 'active',
      notes: 'Mua sỉ thường xuyên, phục vụ nông dân khu vực.',
    },
    {
      customerCode: 'KH-SI-CANTHO-002',
      customerName: 'CH Vật tư Nông nghiệp Tân Tiến',
      customerType: 'company',
      classification: 'wholesale',
      contactPerson: 'Chị Phạm Thị Tân',
      phone: '0906123789',
      email: 'tantien.vtnn@gmail.com',
      address: '567 Trần Phú, Phường Tân An, Quận Ninh Kiều, Cần Thơ',
      taxCode: '0309123456',
      creditLimit: 120000000,
      currentDebt: 38000000,
      status: 'active',
      notes: 'Chuyên cung cấp cho các vườn rau màu khu vực Cái Răng.',
    },
    {
      customerCode: 'KH-SI-HAUGIANG-001',
      customerName: 'Cửa hàng Phân bón Hậu Giang',
      customerType: 'company',
      classification: 'wholesale',
      contactPerson: 'Ông Trần Văn Hậu',
      phone: '0917888999',
      email: 'haugiang.pb@yahoo.com',
      address: '123 Trần Hưng Đạo, Phường V, TP. Vị Thanh, Hậu Giang',
      taxCode: '0951234567',
      creditLimit: 100000000,
      currentDebt: 25000000,
      status: 'active',
      notes: 'Khách hàng mới, tiềm năng phát triển tốt.',
    },

    // ========== NHÓM 3: KHÁCH HÀNG VIP (Trang trại/Hợp tác xã) ==========
    {
      customerCode: 'KH-VIP-CANTHO-001',
      customerName: 'HTX Nông nghiệp Hữu cơ Cái Răng',
      customerType: 'company',
      classification: 'vip',
      contactPerson: 'Ông Nguyễn Văn Hoàng',
      phone: '0909111222',
      email: 'htx.cairang@gmail.com',
      address: 'Ấp Mỹ Khánh, Xã Thới An Đông, Quận Cái Răng, Cần Thơ',
      taxCode: '0309987654',
      creditLimit: 200000000,
      currentDebt: 55000000,
      status: 'active',
      notes: 'HTX với 150 thành viên. Chuyên trồng rau màu hữu cơ. Cần tư vấn kỹ thuật thường xuyên.',
    },
    {
      customerCode: 'KH-VIP-DONGTHAP-002',
      customerName: 'Trang trại Trái cây Xuân Lộc',
      customerType: 'company',
      classification: 'vip',
      contactPerson: 'Ông Lê Xuân Lộc',
      phone: '0918333444',
      email: 'xuanloc.farm@gmail.com',
      address: 'Ấp 3, Xã Tân Thành, Huyện Tân Hồng, Đồng Tháp',
      taxCode: '1201111222',
      creditLimit: 180000000,
      currentDebt: 62000000,
      status: 'active',
      notes: 'Trang trại 20ha trồng xoài, nhãn. Khách VIP, luôn mua sản phẩm cao cấp.',
    },
    {
      customerCode: 'KH-VIP-VINHLONG-002',
      customerName: 'Vườn Chôm Chôm Thiên Phúc',
      customerType: 'individual',
      classification: 'vip',
      gender: 'male',
      contactPerson: 'Ông Nguyễn Thiên Phúc',
      phone: '0903555666',
      email: 'thienphuc.chomchom@gmail.com',
      address: 'Ấp Tân Lợi, Xã Tân An Hội, Huyện Bình Tân, Vĩnh Long',
      taxCode: null,
      creditLimit: 80000000,
      currentDebt: 15000000,
      status: 'active',
      notes: 'Vườn chôm chôm 5ha xuất khẩu. Hay tham dự hội thảo, giới thiệu khách mới.',
    },

    // ========== NHÓM 4: KHÁCH LẺ (Nông dân cá nhân) ==========
    {
      customerCode: 'KH-LE-CANTHO-001',
      customerName: 'Anh Nguyễn Văn Năm',
      customerType: 'individual',
      classification: 'retail',
      gender: 'male',
      phone: '0918666777',
      email: null,
      address: 'Ấp 2, Xã Phong Điền, Huyện Phong Điền, Cần Thơ',
      taxCode: null,
      creditLimit: 5000000,
      currentDebt: 1200000,
      status: 'active',
      notes: 'Trồng 2ha rau màu. Mua lẻ thường xuyên.',
    },
    {
      customerCode: 'KH-LE-DONGTHAP-003',
      customerName: 'Chị Trần Thị Sáu',
      customerType: 'individual',
      classification: 'retail',
      gender: 'female',
      phone: '0907888999',
      email: null,
      address: 'Ấp Bình An, Xã Mỹ An, Huyện Tháp Mười, Đồng Tháp',
      taxCode: null,
      creditLimit: 3000000,
      currentDebt: 850000,
      status: 'active',
      notes: 'Vườn nhãn 1.5ha. Khách hàng trung thành.',
    },
    {
      customerCode: 'KH-LE-ANGIANG-002',
      customerName: 'Ông Võ Văn Bảy',
      customerType: 'individual',
      classification: 'retail',
      gender: 'male',
      phone: '0919222333',
      email: null,
      address: 'Ấp 4, Xã Bình Phước, Huyện Châu Phú, An Giang',
      taxCode: null,
      creditLimit: 4000000,
      currentDebt: 0,
      status: 'active',
      notes: 'Trồng lúa 3ha. Thanh toán tiền mặt ngay.',
    },
    {
      customerCode: 'KH-LE-HAUGIANG-002',
      customerName: 'Anh Lê Văn Tám',
      customerType: 'individual',
      classification: 'retail',
      gender: 'male',
      phone: '0906444555',
      email: 'letam.farmer@gmail.com',
      address: 'Ấp Hòa Bình, Xã Long Mỹ, Huyện Phụng Hiệp, Hậu Giang',
      taxCode: null,
      creditLimit: 5000000,
      currentDebt: 1500000,
      status: 'active',
      notes: 'Trồng ớt 1ha. Thường hỏi tư vấn kỹ thuật qua điện thoại.',
    },
    {
      customerCode: 'KH-LE-VINHLONG-003',
      customerName: 'Chị Nguyễn Thị Chín',
      customerType: 'individual',
      classification: 'retail',
      gender: 'female',
      phone: '0917666888',
      email: null,
      address: 'Ấp 1, Xã Tân Hội, Huyện Vũng Liêm, Vĩnh Long',
      taxCode: null,
      creditLimit: 3000000,
      currentDebt: 500000,
      status: 'active',
      notes: 'Vườn rau sạch 0.5ha. Mua ít nhưng đều đặn.',
    },

    // ========== NHÓM 5: KHÁCH HÀNG ĐẶC BIỆT ==========
    {
      customerCode: 'KH-DL-TPHCM-001',
      customerName: 'Công ty CP Nông nghiệp Công nghệ cao Sài Gòn',
      customerType: 'company',
      classification: 'distributor',
      contactPerson: 'Mr. David Nguyễn',
      phone: '0908999888',
      email: 'david.nguyen@saigonagritech.com',
      address: '555 Điện Biên Phủ, Phường 25, Quận Bình Thạnh, TP. Hồ Chí Minh',
      taxCode: '0312345678',
      creditLimit: 800000000,
      currentDebt: 320000000,
      status: 'active',
      notes: 'Đại lý lớn nhất khu vực phía Nam. Có hệ thống nhà phân phối rộng khắp.',
    },
    {
      customerCode: 'KH-VIP-BENTRE-001',
      customerName: 'Vườn Dừa Xiêm Bến Tre',
      customerType: 'company',
      classification: 'vip',
      contactPerson: 'Ông Trần Văn Dừa',
      phone: '0919777888',
      email: 'duaxiem.bentre@gmail.com',
      address: 'Ấp Phú Lợi, Xã Phú Đức, Huyện Châu Thành, Bến Tre',
      taxCode: '0801234567',
      creditLimit: 150000000,
      currentDebt: 42000000,
      status: 'active',
      notes: 'Vườn dừa xiêm 30ha. Xuất khẩu sang Trung Quốc, Thái Lan.',
    },
    {
      customerCode: 'KH-SI-TRAVINH-001',
      customerName: 'Hợp tác xã Thanh Long Trà Vinh',
      customerType: 'company',
      classification: 'wholesale',
      contactPerson: 'Bà Huỳnh Thị Mai',
      phone: '0903222111',
      email: 'htx.thanhlong.tv@gmail.com',
      address: 'Ấp 3, Xã Thanh Sơn, Huyện Tiểu Cần, Trà Vinh',
      taxCode: '0851234567',
      creditLimit: 120000000,
      currentDebt: 28000000,
      status: 'active',
      notes: 'HTX thanh long 80 thành viên. Mua số lượng lớn mỗi đầu vụ.',
    },

    // ========== KHÁCH HÀNG INACTIVE/BLACKLIST (Ví dụ) ==========
    {
      customerCode: 'KH-LE-CANTHO-999',
      customerName: 'Anh Nguyễn Văn X',
      customerType: 'individual',
      classification: 'retail',
      gender: 'male',
      phone: '0918000111',
      email: null,
      address: 'Địa chỉ cũ không còn, Quận Ninh Kiều, Cần Thơ',
      taxCode: null,
      creditLimit: 0,
      currentDebt: 8500000,
      status: 'blacklisted',
      notes: 'CẢNH BÁO: Nợ quá hạn 6 tháng, không liên lạc được. Không bán nợ.',
    },
  ];

  for (const customer of customers) {
    const data = {
      ...customer,
      customerType: customer.customerType as 'individual' | 'company',
      classification: customer.classification as 'retail' | 'wholesale' | 'vip' | 'distributor',
      gender: customer.gender as 'male' | 'female' | 'other' | null,
      status: customer.status as 'active' | 'inactive' | 'blacklisted',
    };

    await prisma.customer.upsert({
      where: { customerCode: customer.customerCode },
      update: data,
      create: data,
    });
  }

  console.log(`✅ Đã seed xong ${customers.length} khách hàng!`);
  console.log(`
📊 Thống kê:
   - Đại lý phân phối (Distributor): ${customers.filter((c) => c.classification === 'distributor').length
    }
   - Khách sỉ (Wholesale): ${customers.filter((c) => c.classification === 'wholesale').length}
   - Khách VIP (Trang trại/HTX): ${customers.filter((c) => c.classification === 'vip').length}
   - Khách lẻ (Nông dân): ${customers.filter((c) => c.classification === 'retail').length}
   - Blacklist: ${customers.filter((c) => c.status === 'blacklisted').length}
  `);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed customers:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });