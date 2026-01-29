import { PrismaClient, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '@utils/errors';
import RedisService, { CachePrefix } from '@services/redis.service';
import {
    UpdateCustomerInput,
    // Không cần import các Input dành cho Admin như CreateCustomerInput, CustomerQueryInput
} from '@validators/customer.validator';
import { calculateDebtMetrics } from '@utils/debt.util';


const prisma = new PrismaClient();
const redis = RedisService.getInstance();

const CUSTOMER_CACHE_TTL = 3600;

class CustomerService {

    // API: Xác nhận SĐT vẫn đang được sử dụng
    async confirmPhoneUsage(id: number) {
        return await prisma.customer.update({
            where: { id },
            data: {
                phoneVerifiedAt: new Date() // Cập nhật thời gian hiện tại
            }
        });
    }

    // Helper: Kiểm tra xem có cần xác thực lại SĐT không
    // Trả về true nếu: Là Acc Social + Có SĐT + (Chưa verify bao giờ HOẶC Đã verify quá 3 tháng)
    checkIfNeedPhoneVerification(customer: any, authProvider: string): boolean {
        // Chỉ áp dụng cho tài khoản Social (GG/FB)
        if (authProvider === 'PHONE') return false;

        // Nếu chưa có SĐT thì không cần check (vì sẽ bị bắt buộc nhập ở Profile rồi)
        if (!customer.phone || customer.phone.length < 8) return false;

        // Nếu chưa từng verify
        if (!customer.phoneVerifiedAt) return true;

        // Kiểm tra thời gian (3 tháng = 90 ngày)
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

        return new Date(customer.phoneVerifiedAt) < threeMonthsAgo;
    }

    // ========================================================
    // 1. GET PROFILE (Tái sử dụng logic getById của Admin)
    // Khách hàng sẽ lấy thông tin của chính họ qua ID từ Token
    // ========================================================
    async getById(id: number) {
        const cacheKey = `${CachePrefix.USER}customer:${id}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return cached;
        }

        const customer = await prisma.customer.findUnique({
            where: { id },
            include: {
                customerAccount: {
                    select: {
                        authProvider: true
                    },
                },
                salesOrders: {
                    select: {
                        id: true,
                        orderCode: true,
                        orderDate: true,
                        orderStatus: true,
                        paymentStatus: true,
                        totalAmount: true,
                        paidAmount: true,
                    },
                    orderBy: { orderDate: 'desc' },
                    take: 10, // Giới hạn số đơn hàng gần đây
                },
            },
        });

        if (!customer) {
            throw new NotFoundError('Customer not found');
        }
        // Lấy provider từ account đầu tiên
        const provider = customer.customerAccount?.authProvider || 'PHONE';

        // --- SỬ DỤNG HÀM TÍNH TOÁN ---
        const debtMetrics = calculateDebtMetrics(customer.currentDebt, customer.creditLimit);

        const customerWithDebtInfo = {
            ...customer,
            authProvider: provider,
            ...debtMetrics, // Spread các thuộc tính: debtPercentage, isOverLimit, v.v.
        };

        await redis.set(cacheKey, customerWithDebtInfo, CUSTOMER_CACHE_TTL);
        return customerWithDebtInfo;
    }

    // ========================================================
    // 2. UPDATE PROFILE (Đã bổ sung logic Email)
    // ========================================================
    async updateProfile(id: number, data: UpdateCustomerInput & { cccd?: string, email?: string }) {
        const customer = await prisma.customer.findUnique({
            where: { id },
            include: {
                customerAccount: {
                    select: {
                        authProvider: true
                    },
                },
            },
        });

        if (!customer) {
            throw new NotFoundError('Customer not found');
        }

        // 1. CHECK TRÙNG SĐT
        if (data.phone && data.phone !== customer.phone) {
            const existPhone = await prisma.customer.findFirst({
                where: { phone: data.phone, id: { not: id } }
            });
            if (existPhone) {
                throw new ConflictError('Số điện thoại này đã được sử dụng bởi tài khoản khác');
            }
        }

        // 2. CHECK TRÙNG CCCD
        if (data.cccd && data.cccd !== customer.cccd) {
            const existCCCD = await prisma.customer.findUnique({
                where: { cccd: data.cccd }
            });
            if (existCCCD && existCCCD.id !== id) {
                throw new ConflictError('Số Căn cước công dân này đã được sử dụng');
            }
        }

        // 3. CHECK EMAIL (Logic mới thêm) ✅
        if (data.email && data.email !== customer.email) {
            // A. Chặn tài khoản Google đổi email
            if (customer.customerAccount?.authProvider === 'GOOGLE') {
                throw new ValidationError('Tài khoản đăng nhập bằng Google không thể thay đổi Email');
            }

            // B. Check trùng Email
            const existEmail = await prisma.customer.findFirst({
                where: { email: data.email, id: { not: id } }
            });
            if (existEmail) {
                throw new ConflictError('Địa chỉ Email này đã được sử dụng bởi tài khoản khác');
            }
        }

        const safeData: Prisma.CustomerUpdateInput = {
            ...(data.customerName && { customerName: data.customerName }),
            ...(data.gender !== undefined && { gender: data.gender }),
            ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson }),
            ...(data.address !== undefined && { address: data.address }),
            ...(data.province !== undefined && { province: data.province }),
            ...(data.district !== undefined && { district: data.district }),

            // Cập nhật CCCD
            ...(data.cccd && { cccd: data.cccd }),

            // Cập nhật Phone
            ...(data.phone && {
                phone: data.phone,
                phoneVerifiedAt: new Date()
            }),

            // ✅ QUAN TRỌNG: Bổ sung dòng này để lưu Email vào DB
            ...(data.email && { email: data.email }),
        };

        if (Object.keys(safeData).length === 0) {
            throw new ValidationError('Không có dữ liệu hợp lệ để cập nhật');
        }

        const updatedCustomer = await prisma.customer.update({
            where: { id },
            data: {
                ...safeData,
                updatedAt: new Date(),
            },
        });

        // Xóa cache
        await redis.del(`${CachePrefix.USER}customer:${id}`);

        return updatedCustomer;
    }

    // ========================================================
    // 3. GET DEBT INFO (Lấy thông tin nợ của chính mình)
    // ========================================================
    async getDebtInfo(id: number) {
        // Tái sử dụng logic getDebtInfo của Admin, chỉ cần truyền ID từ token
        const customer = await prisma.customer.findUnique({
            where: { id },
            select: {
                id: true,
                customerCode: true,
                customerName: true,
                creditLimit: true,
                currentDebt: true,
                debtUpdatedAt: true,
                salesOrders: {
                    // Chỉ lấy các đơn hàng đang có nợ
                    where: {
                        orderStatus: {
                            in: ['pending', 'preparing', 'delivering', 'completed'],
                        },
                    },
                    select: {
                        id: true,
                        orderCode: true,
                        orderDate: true,
                        totalAmount: true,
                        paidAmount: true,
                        orderStatus: true,
                        paymentStatus: true,
                    },
                    orderBy: { orderDate: 'desc' },
                },
            },
        });

        if (!customer) {
            throw new NotFoundError('Customer not found');
        }

        const unpaidOrders = customer.salesOrders.map((order) => ({
            ...order,
            debtAmount: Number(order.totalAmount) - Number(order.paidAmount),
        }));


        // --- SỬ DỤNG HÀM TÍNH TOÁN ---
        const debtMetrics = calculateDebtMetrics(customer.currentDebt, customer.creditLimit);
        // -----------------------------

        return {
            customerId: customer.id,
            customerCode: customer.customerCode,
            customerName: customer.customerName,
            creditLimit: Number(customer.creditLimit),
            currentDebt: Number(customer.currentDebt),
            debtUpdatedAt: customer.debtUpdatedAt,
            unpaidOrders,
            totalUnpaidOrders: unpaidOrders.length,
            ...debtMetrics, // Spread kết quả tính toán vào đây
        };
    }

    // ========================================================
    // 4. GET ORDER HISTORY (Lấy lịch sử đơn hàng của chính mình)
    // ========================================================
    async getOrderHistory(id: number, page: number = 1, limit: number = 20) {
        // Tái sử dụng logic getOrderHistory của Admin
        const customer = await prisma.customer.findUnique({
            where: { id },
        });

        if (!customer) {
            throw new NotFoundError('Customer not found');
        }

        const offset = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            prisma.salesOrder.findMany({
                where: { customerId: id },
                select: {
                    id: true,
                    orderCode: true,
                    orderDate: true,
                    orderStatus: true,
                    paymentStatus: true,
                    totalAmount: true,
                    paidAmount: true,
                    salesChannel: true,
                    warehouse: {
                        select: {
                            id: true,
                            warehouseName: true,
                        },
                    },
                },
                skip: offset,
                take: limit,
                orderBy: { orderDate: 'desc' },
            }),
            prisma.salesOrder.count({ where: { customerId: id } }),
        ]);

        return {
            customer: {
                id: customer.id,
                customerCode: customer.customerCode,
                customerName: customer.customerName,
            },
            orders,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}

export default new CustomerService();