import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

export async function seedStaff(prisma: PrismaClient) {
  const password = await bcrypt.hash('123456', 10);
  const staffData = [
    { fullName: 'Nguyễn Minh Tuấn', email: 'tuan.nguyen@company.com', roleKey: 'warehouse_manager', employeeCode: 'NV-0100' },
    { fullName: 'Lê Thị Hồng Hạnh', email: 'hanh.le@company.com', roleKey: 'accountant', employeeCode: 'NV-0101' },
    { fullName: 'Trần Hoàng Nam', email: 'nam.tran@company.com', roleKey: 'sales_staff', employeeCode: 'NV-0102' },
    { fullName: 'Vũ Tuyết Mai', email: 'mai.vu@company.com', roleKey: 'warehouse_staff', employeeCode: 'NV-0103' },
    { fullName: 'Phạm Gia Bảo', email: 'bao.pham@company.com', roleKey: 'production_manager', employeeCode: 'NV-0104' },
    { fullName: 'Hoàng Anh Đức', email: 'duc.hoang@company.com', roleKey: 'warehouse_staff', employeeCode: 'NV-0105' },
    { fullName: 'Đỗ Thùy Chi', email: 'chi.do@company.com', roleKey: 'sales_staff', employeeCode: 'NV-0106' },
    { fullName: 'Ngô Minh Anh', email: 'anh.ngo@company.com', roleKey: 'accountant', employeeCode: 'NV-0107' },
    { fullName: 'Bùi Quang Huy', email: 'huy.bui@company.com', roleKey: 'delivery_staff', employeeCode: 'NV-0108' },
    { fullName: 'Lý Thanh Thảo', email: 'thao.ly@company.com', roleKey: 'sales_staff', employeeCode: 'NV-0109' },
  ];

  // Tạo thêm 20 nhân viên mẫu để đủ 30
  for (let i = 11; i <= 30; i++) {
    staffData.push({
      fullName: `Nhân viên FPT-${i}`,
      email: `staff${i}@company.com`,
      roleKey: i % 3 === 0 ? 'sales_staff' : (i % 2 === 0 ? 'delivery_staff' : 'warehouse_staff'),
      employeeCode: `NV-01${i.toString().padStart(2, '0')}`
    });
  }

  for (const staff of staffData) {
    const role = await prisma.role.findUnique({ where: { roleKey: staff.roleKey } });
    await prisma.user.upsert({
      where: { email: staff.email },
      update: {},
      create: {
        employeeCode: staff.employeeCode,
        email: staff.email,
        passwordHash: password,
        fullName: staff.fullName,
        roleId: role?.id || 1,
        status: 'active'
      }
    });
  }
  console.log('✅ Đã seed 30 nhân viên thực tế (Staff).');
}
