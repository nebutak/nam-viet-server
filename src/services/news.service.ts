import { PrismaClient, Prisma } from '@prisma/client';
import {
    CreateNewsInput,
    UpdateNewsInput,
    NewsQueryInput,
    CreateNewsCommentInput,
    NewsCommentQueryInput,
    TrackNewsShareInput,
} from '../validators/news.validator';

const prisma = new PrismaClient();

export class NewsService {

    /**
     * Get all news with pagination and filters
     */
    static async getAllNews(query: NewsQueryInput, isPublic: boolean = true) {
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '10');
        const skip = (page - 1) * limit;

        // Build where clause
        const where: Prisma.NewsWhereInput = {
            deletedAt: null,
        };

        // Public users only see published news
        if (isPublic) {
            where.status = 'published';
        } else if (query.status) {
            where.status = query.status;
        }

        if (query.categoryId) {
            where.categoryId = parseInt(query.categoryId);
        }

        if (query.isFeatured) {
            where.isFeatured = query.isFeatured === 'true';
        }

        if (query.contentType) {
            where.contentType = query.contentType as any;
        }

        if (query.search) {
            where.OR = [
                { title: { contains: query.search } },
                { content: { contains: query.search } },
                { excerpt: { contains: query.search } },
            ];
        }

        // Build orderBy
        const orderBy: Prisma.NewsOrderByWithRelationInput = {};
        const sortBy = query.sortBy || 'createdAt';
        const sortOrder = query.sortOrder || 'desc';
        orderBy[sortBy] = sortOrder;

        // Execute query
        const [news, total] = await Promise.all([
            prisma.news.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    category: true,
                    author: {
                        select: {
                            id: true,
                            fullName: true,
                            avatarUrl: true,
                        },
                    },
                },
            }),
            prisma.news.count({ where }),
        ]);

        return {
            data: news,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get news by ID
     */
    static async getNewsById(id: number) {
        return prisma.news.findFirst({
            where: { id, deletedAt: null },
            include: {
                category: true,
                author: {
                    select: {
                        id: true,
                        fullName: true,
                        avatarUrl: true,
                    },
                },
            },
        });
    }

    /**
     * Get news by slug
     */
    static async getNewsBySlug(slug: string) {
        return prisma.news.findFirst({
            where: {
                slug,
                deletedAt: null,
                status: 'published',
            },
            include: {
                category: true,
                author: {
                    select: {
                        id: true,
                        fullName: true,
                        avatarUrl: true,
                    },
                },
            },
        });
    }

    /**
     * Create news
     */
    static async createNews(data: CreateNewsInput, userId: number) {
        const news = await prisma.news.create({
            data: {
                ...data,
                authorId: userId,
                createdBy: userId,
            },
            include: {
                category: true,
            },
        });

        return news;
    }

    /**
     * Update news
     */
    static async updateNews(id: number, data: UpdateNewsInput, userId: number) {
        const news = await prisma.news.update({
            where: { id },
            data: {
                ...data,
                updatedBy: userId,
            },
            include: {
                category: true,
            },
        });

        return news;
    }

    /**
     * Delete news (soft delete)
     */
    static async deleteNews(id: number) {
        return prisma.news.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    /**
     * Increment view count
     */
    static async incrementViewCount(id: number) {
        return prisma.news.update({
            where: { id },
            data: { viewCount: { increment: 1 } },
        });
    }

    static async getEngagement(newsId: number, clientId?: string) {
        const [news, liked] = await Promise.all([
            prisma.news.findUnique({
                where: { id: newsId },
                select: {
                    id: true,
                    viewCount: true,
                    likeCount: true,
                    commentCount: true,
                    shareCount: true,
                },
            }),
            clientId
                ? prisma.newsLike.findUnique({
                    where: { newsId_clientId: { newsId, clientId } },
                    select: { id: true },
                })
                : null,
        ]);

        if (!news) return null;

        return {
            ...news,
            liked: Boolean(liked),
        };
    }

    static async toggleLike(newsId: number, clientId: string, meta: { ipAddress?: string; userAgent?: string }) {
        return prisma.$transaction(async (tx) => {
            const existing = await tx.newsLike.findUnique({
                where: { newsId_clientId: { newsId, clientId } },
            });

            if (existing) {
                await tx.newsLike.delete({ where: { id: existing.id } });
                const news = await tx.news.update({
                    where: { id: newsId },
                    data: { likeCount: { decrement: 1 } },
                    select: { likeCount: true },
                });
                return { liked: false, likeCount: Math.max(news.likeCount, 0) };
            }

            await tx.newsLike.create({
                data: {
                    newsId,
                    clientId,
                    ipAddress: meta.ipAddress,
                    userAgent: meta.userAgent?.slice(0, 255),
                },
            });
            const news = await tx.news.update({
                where: { id: newsId },
                data: { likeCount: { increment: 1 } },
                select: { likeCount: true },
            });

            return { liked: true, likeCount: news.likeCount };
        });
    }

    static async getPublicComments(newsId: number) {
        return prisma.newsComment.findMany({
            where: {
                newsId,
                status: 'approved',
                deletedAt: null,
                parentId: null,
            },
            orderBy: { createdAt: 'desc' },
            include: {
                replies: {
                    where: { status: 'approved', deletedAt: null },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
    }

    static async createComment(newsId: number, data: CreateNewsCommentInput, meta: { ipAddress?: string; userAgent?: string }) {
        return prisma.$transaction(async (tx) => {
            const comment = await tx.newsComment.create({
                data: {
                    newsId,
                    parentId: data.parentId,
                    authorName: data.authorName.trim(),
                    authorEmail: data.authorEmail?.trim() || null,
                    content: data.content.trim(),
                    status: 'approved',
                    ipAddress: meta.ipAddress,
                    userAgent: meta.userAgent?.slice(0, 255),
                },
            });

            await tx.news.update({
                where: { id: newsId },
                data: { commentCount: { increment: 1 } },
            });

            return comment;
        });
    }

    static async getCommentsAdmin(query: NewsCommentQueryInput) {
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const skip = (page - 1) * limit;

        const where: Prisma.NewsCommentWhereInput = {
            deletedAt: null,
        };

        if (query.newsId) where.newsId = parseInt(query.newsId);
        if (query.status) where.status = query.status;
        if (query.search) {
            where.OR = [
                { authorName: { contains: query.search } },
                { authorEmail: { contains: query.search } },
                { content: { contains: query.search } },
                { news: { title: { contains: query.search } } },
            ];
        }

        const [comments, total] = await Promise.all([
            prisma.newsComment.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    news: {
                        select: { id: true, title: true, slug: true },
                    },
                },
            }),
            prisma.newsComment.count({ where }),
        ]);

        return {
            data: comments,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    static async updateCommentStatus(commentId: number, status: 'pending' | 'approved' | 'rejected') {
        return prisma.$transaction(async (tx) => {
            const current = await tx.newsComment.findUnique({
                where: { id: commentId },
                select: { id: true, newsId: true, status: true, deletedAt: true },
            });

            if (!current || current.deletedAt) {
                throw new Error('Comment not found');
            }

            const comment = await tx.newsComment.update({
                where: { id: commentId },
                data: { status },
                include: {
                    news: { select: { id: true, title: true, slug: true } },
                },
            });

            if (current.status !== status) {
                const wasApproved = current.status === 'approved';
                const isApproved = status === 'approved';
                if (wasApproved !== isApproved) {
                    await tx.news.update({
                        where: { id: current.newsId },
                        data: { commentCount: { increment: isApproved ? 1 : -1 } },
                    });
                }
            }

            return comment;
        });
    }

    static async deleteComment(commentId: number) {
        return prisma.$transaction(async (tx) => {
            const current = await tx.newsComment.findUnique({
                where: { id: commentId },
                select: { id: true, newsId: true, status: true, deletedAt: true },
            });

            if (!current || current.deletedAt) {
                throw new Error('Comment not found');
            }

            const comment = await tx.newsComment.update({
                where: { id: commentId },
                data: { deletedAt: new Date() },
            });

            if (current.status === 'approved') {
                await tx.news.update({
                    where: { id: current.newsId },
                    data: { commentCount: { decrement: 1 } },
                });
            }

            return comment;
        });
    }

    static async trackShare(newsId: number, data: TrackNewsShareInput, meta: { ipAddress?: string; userAgent?: string }) {
        return prisma.$transaction(async (tx) => {
            await tx.newsShare.create({
                data: {
                    newsId,
                    platform: data.platform,
                    clientId: data.clientId,
                    ipAddress: meta.ipAddress,
                    userAgent: meta.userAgent?.slice(0, 255),
                },
            });

            const news = await tx.news.update({
                where: { id: newsId },
                data: { shareCount: { increment: 1 } },
                select: { shareCount: true },
            });

            return { shareCount: news.shareCount };
        });
    }

    /**
     * Get featured news
     */
    static async getFeaturedNews(limit: number = 5) {
        return prisma.news.findMany({
            where: {
                isFeatured: true,
                status: 'published',
                deletedAt: null,
            },
            take: limit,
            orderBy: { publishedAt: 'desc' },
            include: {
                category: true,
                author: {
                    select: {
                        id: true,
                        fullName: true,
                        avatarUrl: true,
                    },
                },
            },
        });
    }

    /**
     * Get related news (same category)
     */
    static async getRelatedNews(newsId: number, limit: number = 5) {
        const news = await prisma.news.findUnique({
            where: { id: newsId },
            select: { categoryId: true },
        });

        if (!news) return [];

        return prisma.news.findMany({
            where: {
                categoryId: news.categoryId,
                id: { not: newsId },
                status: 'published',
                deletedAt: null,
            },
            take: limit,
            orderBy: { publishedAt: 'desc' },
            include: {
                category: true,
                author: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
            },
        });
    }

    /**
     * Publish news
     */
    static async publishNews(id: number) {
        return prisma.news.update({
            where: { id },
            data: {
                status: 'published',
                publishedAt: new Date(),
            },
        });
    }

    /**
     * Archive news
     */
    static async archiveNews(id: number) {
        return prisma.news.update({
            where: { id },
            data: { status: 'archived' },
        });
    }
}
