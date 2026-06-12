import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword } from '@utils/password';
import { generateAccessToken, generateRefreshToken } from '@utils/cs-jwt';
import { AuthenticationError, ValidationError } from '@utils/errors';

const prisma = new PrismaClient();

export const customerTokenBlacklist = new Set<string>();

class CustomerAuthService {
  // Register customer account
  async register(data: any) {
    const { customerName, phone, email, address, password } = data;

    // 1. Check if customer with this phone number already exists
    let customer = await prisma.customer.findUnique({
      where: { phone },
    });

    if (customer) {
      // Check if account already exists
      const existingAccount = await prisma.customerAccount.findUnique({
        where: { customerId: customer.id },
      });

      if (existingAccount) {
        throw new ValidationError('Số điện thoại này đã được đăng ký tài khoản');
      }
    } else {
      // 2. Create customer if not exists
      customer = await prisma.customer.create({
        data: {
          customerName,
          customerCode: `KH-${phone}`,
          customerType: 'individual',
          phone,
          email: email || null,
          address: address || null,
          status: 'active',
        },
      });
    }

    // 3. Hash password and create CustomerAccount
    const passwordHash = await hashPassword(password);
    await prisma.customerAccount.create({
      data: {
        customerId: customer.id,
        accountIdentifier: phone,
        passwordHash,
        authProvider: 'PHONE',
        isVerified: true,
        isActive: true,
      },
    });

    return {
      message: 'Đăng ký tài khoản thành công',
      customer: {
        id: customer.id,
        customerName: customer.customerName,
        phone: customer.phone,
        email: customer.email,
      },
    };
  }

  // Login customer account
  async login(data: any) {
    const { phone, password } = data;

    // 1. Find CustomerAccount
    const account = await prisma.customerAccount.findUnique({
      where: { accountIdentifier: phone },
      include: { customer: true },
    });

    if (!account) {
      throw new AuthenticationError('Số điện thoại hoặc mật khẩu không chính xác');
    }

    if (!account.isActive || account.customer.status !== 'active') {
      throw new AuthenticationError('Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động');
    }

    // 2. Compare password
    const isPasswordValid = await comparePassword(password, account.passwordHash || '');
    if (!isPasswordValid) {
      throw new AuthenticationError('Số điện thoại hoặc mật khẩu không chính xác');
    }

    // 3. Generate tokens
    const payload = {
      customerId: account.customerId,
      role: 'customer' as const,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Update last login
    await prisma.customerAccount.update({
      where: { id: account.id },
      data: { lastLogin: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      customer: {
        id: account.customer.id,
        customerName: account.customer.customerName,
        phone: account.customer.phone,
        email: account.customer.email,
        address: account.customer.address,
      },
    };
  }

  // Google OAuth Login
  async googleLogin(data: any) {
    const { idToken } = data;

    // 1. Verify token with Google's tokeninfo API
    let payload: any;
    try {
      const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      payload = response.data;
      
      // Basic verification: Check audience (client ID)
      const clientId = process.env.GOOGLE_CLIENT_ID || '646139704983-i8ch3krq01e151hvm1fvf2anckb07f0s.apps.googleusercontent.com';
      if (payload.aud !== clientId) {
        throw new AuthenticationError('Token không khớp với Client ID của ứng dụng');
      }
    } catch (error: any) {
      console.error('Google token verification failed:', error?.response?.data || error.message);
      throw new AuthenticationError('Xác thực Google thất bại hoặc token đã hết hạn');
    }

    const { sub, email, name, picture } = payload;

    // 2. Find if CustomerAccount already exists for GOOGLE provider
    let account = await prisma.customerAccount.findFirst({
      where: {
        authProvider: 'GOOGLE',
        accountIdentifier: sub,
      },
      include: { customer: true },
    });

    let customer: any;

    if (account) {
      customer = account.customer;
    } else {
      // Check if there is an existing customer with this email
      if (email) {
        customer = await prisma.customer.findFirst({
          where: { email, deletedAt: null },
        });
      }

      if (customer) {
        // Customer exists. We must check if they already have an associated CustomerAccount
        const existingAccount = await prisma.customerAccount.findUnique({
          where: { customerId: customer.id },
        });

        if (existingAccount) {
          // If they already have an account (e.g. PHONE), reject to avoid hijacking/overwrite
          if (existingAccount.authProvider === 'PHONE') {
            throw new ValidationError('Email này đã được sử dụng cho tài khoản đăng ký bằng Số điện thoại. Vui lòng đăng nhập bằng Số điện thoại.');
          } else {
            // Already has another type of account? Link it/use it
            throw new ValidationError(`Tài khoản đã được đăng ký bằng phương thức khác (${existingAccount.authProvider}).`);
          }
        }

        // Link Google account to this existing customer
        account = await prisma.customerAccount.create({
          data: {
            customerId: customer.id,
            accountIdentifier: sub,
            authProvider: 'GOOGLE',
            isVerified: true,
            isActive: true,
          },
          include: { customer: true },
        });
      } else {
        // Create a new Customer and CustomerAccount
        customer = await prisma.customer.create({
          data: {
            customerName: name || 'Khách hàng Google',
            customerCode: `KH-GG-${sub.slice(-8)}`,
            customerType: 'individual',
            email: email || null,
            avatarUrl: picture || null,
            status: 'active',
          },
        });

        account = await prisma.customerAccount.create({
          data: {
            customerId: customer.id,
            accountIdentifier: sub,
            authProvider: 'GOOGLE',
            isVerified: true,
            isActive: true,
          },
          include: { customer: true },
        });
      }
    }

    if (!account.isActive || account.customer.status !== 'active') {
      throw new AuthenticationError('Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động');
    }

    // Generate tokens
    const jwtPayload = {
      customerId: account.customerId,
      role: 'customer' as const,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    // Update last login
    await prisma.customerAccount.update({
      where: { id: account.id },
      data: { lastLogin: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      customer: {
        id: account.customer.id,
        customerName: account.customer.customerName,
        phone: account.customer.phone,
        email: account.customer.email,
        address: account.customer.address,
        avatarUrl: account.customer.avatarUrl,
      },
    };
  }

  // Logout customer account
  async logout(token: string) {
    if (token) {
      customerTokenBlacklist.add(token);
    }
    return { message: 'Đăng xuất thành công' };
  }
}

export default new CustomerAuthService();

