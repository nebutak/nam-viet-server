const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Mau Nhap Khach Hang');

  const headers = [
    'Loại khách hàng',  // 1
    'Khách hàng',       // 2
    'Số điện thoại',    // 3
    'Địa chỉ',          // 4
    'Địa chỉ email',    // 5
    'Tên công ty',      // 6
    'Mã số thuế',       // 7
    'CMND/CCCD',        // 8
    'Ngày cấp',         // 9
    'Nơi cấp',          // 10
    'Ghi chú',          // 11
    'Phân loại KH',     // 12
    'Giới tính',        // 13
    'Trạng thái',       // 14
    'Hạn mức nợ'        // 15
  ];

  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  worksheet.columns.forEach(column => {
    column.width = 20;
  });

  // Example data row
  worksheet.addRow([
    'individual',
    'Nguyễn Văn A',
    '0901234567',
    '123 Đường B, Quận C',
    'nguyenvana@example.com',
    'Công ty TNHH A',
    '0123456789',
    '012345678912',
    '2024-01-01',
    'Cục CS QLHC',
    'Khách hàng VIP',
    'retail',
    'Nam',
    'Hoạt động',
    5000000
  ]);

  const dir = path.join(__dirname, 'src', 'public', 'templates');
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, 'customer_import_template.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log(`Template saved to ${filePath}`);
}

generateTemplate().catch(console.error);
