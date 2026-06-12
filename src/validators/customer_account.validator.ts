import { z } from 'zod';

// --- PHONE LOGIN FLOW ---

// 1. CHECK PHONE (Dùng cho: Đăng ký - Bước 1, Quên mật khẩu - Bước 1)
export const checkPhoneSchema = z.object({
    body: z.object({
        phone: z.string()
            .min(9, 'Phone number must be at least 9 digits')
            .max(15, 'Phone number must be no more than 15 digits')
            .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
    }),
});

// 2. VERIFY OTP (Dùng cho: Đăng ký - Bước 2, Quên mật khẩu - Bước 2)
export const verifyOtpSchema = z.object({
    body: z.object({
        phone: z.string()
            .min(9, 'Phone number must be at least 9 digits')
            .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
        otp: z.string()
            .length(6, 'OTP must be 6 digits') 
            .regex(/^[0-9]+$/, 'OTP must contain only digits'),
        uid: z.string().min(1, 'UID is required').optional(), 
    }),
});

// 3. SET PASSWORD (Dùng cho: Đăng ký - Bước 3, Quên mật khẩu - Bước 3)
export const setPasswordSchema = z.object({
    body: z.object({
        phone: z.string()
            .min(9, 'Phone number is required')
            .regex(/^[0-9]+$/, 'Phone number must contain only digits'), 
        password: z.string()
            .min(6, 'Password must be at least 6 characters')
            .max(50, 'Password must be no more than 50 characters'),
        uid: z.string().min(1, 'Supabase UID is required'), 
    }),
});

// 4. LOGIN PASSWORD (Đăng nhập thông thường bằng SĐT + Mật khẩu)
export const loginPasswordSchema = z.object({
    body: z.object({
        phone: z.string()
            .min(9, 'Phone number is required')
            .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
        password: z.string().min(1, 'Password is required'), 
    }),
});

// --- SOCIAL LOGIN FLOW ---

// 5. SOCIAL LOGIN/REGISTER
export const socialLoginSchema = z.object({
    body: z.object({
        uid: z.string().min(1, 'Supabase UID is required'),
        email: z.string().email('Invalid email format').optional(), 
        name: z.string().optional(),
        avatar: z.string().url('Invalid URL format').optional(),
        provider: z.enum(['GOOGLE', 'FACEBOOK'], { 
            message: 'Invalid social provider. Must be GOOGLE or FACEBOOK.',
        }),
    }).strict(),
});

export const googleLoginSchema = z.object({
    body: z.object({
        idToken: z.string().min(1, 'Google ID Token là bắt buộc'),
    }),
});

// --- TOKEN FLOW ---

// 6. REFRESH TOKEN
export const refreshTokenSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
    }),
});

// 7. SYNC PHONE ACCOUNT
export const syncPhoneAccountSchema = z.object({
    body: z.object({
        phone: z.string()
            .min(9, 'Phone number must be at least 9 digits')
            .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
        // Yêu cầu UID từ Supabase, đã được verify qua OTP
        uid: z.string().min(1, 'Supabase UID is required'),
    }),
});



// --- TYPES ---
export type CheckPhoneInput = z.infer<typeof checkPhoneSchema>['body'];
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>['body'];
export type SetPasswordInput = z.infer<typeof setPasswordSchema>['body'];
export type LoginPasswordInput = z.infer<typeof loginPasswordSchema>['body'];
export type SocialLoginInput = z.infer<typeof socialLoginSchema>['body'];
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>['body'];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body'];
export type SyncPhoneAccountInput = z.infer<typeof syncPhoneAccountSchema>['body'];
