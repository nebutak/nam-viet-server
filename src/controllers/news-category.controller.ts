import { Request, Response } from 'express';
import { NewsCategoryService } from '../services/news-category.service';
import { createCategorySchema, updateCategorySchema } from '../validators/news.validator';

export class NewsCategoryController {

    static async getAllCategories(_req: Request, res: Response) {
        try {
            const categories = await NewsCategoryService.getAllCategories();
            return res.json({ success: true, data: categories });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    static async getCategoryBySlug(req: Request, res: Response) {
        try {
            const { slug } = req.params;
            const category = await NewsCategoryService.getCategoryBySlug(slug);

            if (!category) {
                return res.status(404).json({ success: false, error: 'Category not found' });
            }

            return res.json({ success: true, data: category });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    static async createCategory(req: Request, res: Response) {
        try {
            const body = req.body;

            // Auto-generate categoryKey from slug or categoryName if not provided
            if (!body.categoryKey) {
                const base = body.slug || body.categoryName || '';
                body.categoryKey = base
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd')
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-')
                    .trim()
                    .substring(0, 50);
            }

            // Auto-generate slug from categoryName if not provided
            if (!body.slug) {
                body.slug = body.categoryName
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd')
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-')
                    .trim()
                    .substring(0, 100);
            }

            const data = createCategorySchema.parse(body);
            const category = await NewsCategoryService.createCategory(data);

            res.status(201).json({ success: true, data: category });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    static async updateCategory(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const data = updateCategorySchema.parse(req.body);
            const category = await NewsCategoryService.updateCategory(id, data);

            res.json({ success: true, data: category });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    static async deleteCategory(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            await NewsCategoryService.deleteCategory(id);

            res.json({ success: true, message: 'Category deleted successfully' });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
