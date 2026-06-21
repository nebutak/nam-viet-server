import { PrismaClient, Prisma } from '@prisma/client';
import { CreateCategoryInput, UpdateCategoryInput } from '../validators/news.validator';

const prisma = new PrismaClient();

export class NewsCategoryService {

    /**
     * Get all categories
     */
    static async getAllCategories() {
        return prisma.newsCategory.findMany({
            where: { deletedAt: null },
            orderBy: { displayOrder: 'asc' },
            include: {
                _count: {
                    select: { news: true },
                },
            },
        });
    }

    /**
     * Get category by ID
     */
    static async getCategoryById(id: number) {
        return prisma.newsCategory.findFirst({
            where: { id, deletedAt: null },
        });
    }

    /**
     * Get category by slug
     */
    static async getCategoryBySlug(slug: string) {
        return prisma.newsCategory.findFirst({
            where: { slug, deletedAt: null },
        });
    }

    /**
     * Create category
     */
    static async createCategory(data: CreateCategoryInput) {
        return prisma.newsCategory.create({
            data: data as Prisma.NewsCategoryCreateInput,
        });
    }

    /**
     * Update category
     */
    static async updateCategory(id: number, data: UpdateCategoryInput) {
        return prisma.newsCategory.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete category (soft delete)
     */
    static async deleteCategory(id: number) {
        return prisma.newsCategory.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
}
