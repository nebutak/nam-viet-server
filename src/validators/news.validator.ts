import { z } from 'zod';

// Create News Schema
export const createNewsSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255),
    slug: z.string().min(1, 'Slug is required').max(255),
    excerpt: z.string().optional(),
    content: z.string().min(1, 'Content is required'),
    contentType: z.enum(['article', 'video']).default('article'),
    featuredImage: z.string().min(1, 'Ảnh đại diện là bắt buộc'),
    videoFile: z.string().optional(),
    videoThumbnail: z.string().optional(),
    videoDuration: z.number().int().positive().optional(),
    categoryId: z.number().int().positive('Category ID is required'),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    publishedAt: z.string().datetime().optional(),
    isFeatured: z.boolean().optional(),
    metaTitle: z.string().max(255).optional(),
    metaDescription: z.string().optional(),
    metaKeywords: z.string().max(255).optional(),
});

// Update News Schema
export const updateNewsSchema = createNewsSchema.partial();

// News Query Schema
export const newsQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    categoryId: z.string().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    isFeatured: z.string().optional(),
    contentType: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.enum(['createdAt', 'publishedAt', 'viewCount', 'title']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const newsLikeSchema = z.object({
    clientId: z.string().min(8).max(120),
});

export const createNewsCommentSchema = z.object({
    authorName: z.string().min(2, 'Tên là bắt buộc').max(120),
    authorEmail: z.string().email('Email không hợp lệ').max(120).optional().or(z.literal('')),
    content: z.string().min(2, 'Nội dung bình luận là bắt buộc').max(2000),
    parentId: z.number().int().positive().optional(),
});

export const newsCommentQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    newsId: z.string().optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    search: z.string().optional(),
});

export const updateNewsCommentStatusSchema = z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
});

export const trackNewsShareSchema = z.object({
    platform: z.enum(['facebook', 'copy_link', 'instagram', 'native']),
    clientId: z.string().min(8).max(120).optional(),
});

// Category Schema
export const createCategorySchema = z.object({
    categoryKey: z.string().min(2).max(50).optional(),
    categoryName: z.string().min(2).max(100),
    description: z.string().optional(),
    slug: z.string().min(2).max(100).optional(),
    displayOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

// Tag Schema
export const createTagSchema = z.object({
    tagName: z.string().min(2).max(50),
    slug: z.string().min(2).max(50),
});

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export type NewsQueryInput = z.infer<typeof newsQuerySchema>;
export type NewsLikeInput = z.infer<typeof newsLikeSchema>;
export type CreateNewsCommentInput = z.infer<typeof createNewsCommentSchema>;
export type NewsCommentQueryInput = z.infer<typeof newsCommentQuerySchema>;
export type UpdateNewsCommentStatusInput = z.infer<typeof updateNewsCommentStatusSchema>;
export type TrackNewsShareInput = z.infer<typeof trackNewsShareSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
