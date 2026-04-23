import { PrismaClient, Prisma } from '@prisma/client';
import { CreateNewsInput, UpdateNewsInput, NewsQueryInput } from '../validators/news.validator';

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
