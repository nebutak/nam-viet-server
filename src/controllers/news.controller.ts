import { Request, Response } from 'express';
import { NewsService } from '../services/news.service';
import { createNewsSchema, updateNewsSchema, newsQuerySchema } from '../validators/news.validator';

export class NewsController {

    /**
     * Get all news (public)
     */
    static async getAllNews(req: Request, res: Response) {
        try {
            const query = newsQuerySchema.parse(req.query);
            const result = await NewsService.getAllNews(query, true);

            res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Get all news (admin - includes draft)
     */
    static async getAllNewsAdmin(req: Request, res: Response) {
        try {
            const query = newsQuerySchema.parse(req.query);
            const result = await NewsService.getAllNews(query, false);

            res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Get news by slug
     */
    static async getNewsBySlug(req: Request, res: Response) {
        try {
            const { slug } = req.params;
            const news = await NewsService.getNewsBySlug(slug);

            if (!news) {
                return res.status(404).json({ success: false, error: 'News not found' });
            }

            return res.json({ success: true, data: news });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get news by ID (admin)
     */
    static async getNewsById(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const news = await NewsService.getNewsById(id);

            if (!news) {
                return res.status(404).json({ success: false, error: 'News not found' });
            }

            return res.json({ success: true, data: news });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create news
     */
    static async createNews(req: Request, res: Response) {
        try {
            const data = createNewsSchema.parse(req.body);
            // TODO: Get userId from auth middleware when implemented
            const userId = (req as any).user?.id || 1; // Default to user ID 1 for now

            const news = await NewsService.createNews(data, userId);

            return res.status(201).json({ success: true, data: news });
        } catch (error: any) {
            if (error.code === 'P2002') {
                return res.status(400).json({ success: false, error: 'Đường dẫn (slug) đã tồn tại. Vui lòng chọn tiêu đề hoặc slug khác.' });
            }
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Update news
     */
    static async updateNews(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const data = updateNewsSchema.parse(req.body);
            // TODO: Get userId from auth middleware when implemented
            const userId = (req as any).user?.id || 1; // Default to user ID 1 for now

            const news = await NewsService.updateNews(id, data, userId);

            return res.json({ success: true, data: news });
        } catch (error: any) {
            if (error.code === 'P2002') {
                return res.status(400).json({ success: false, error: 'Đường dẫn (slug) đã tồn tại. Vui lòng chọn tiêu đề hoặc slug khác.' });
            }
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete news
     */
    static async deleteNews(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            await NewsService.deleteNews(id);

            res.json({ success: true, message: 'News deleted successfully' });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Increment view count
     */
    static async incrementViewCount(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            await NewsService.incrementViewCount(id);

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get featured news
     */
    static async getFeaturedNews(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 5;
            const news = await NewsService.getFeaturedNews(limit);

            res.json({ success: true, data: news });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get related news
     */
    static async getRelatedNews(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const limit = parseInt(req.query.limit as string) || 5;
            const news = await NewsService.getRelatedNews(id, limit);

            res.json({ success: true, data: news });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Publish news
     */
    static async publishNews(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const news = await NewsService.publishNews(id);

            res.json({ success: true, data: news });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Archive news
     */
    static async archiveNews(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const news = await NewsService.archiveNews(id);

            res.json({ success: true, data: news });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Upload video file
     */
    static async uploadVideo(req: Request, res: Response) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No video file uploaded' });
            }

            const videoPath = `videos/${req.file.filename}`;

            return res.json({
                success: true,
                data: {
                    videoFile: videoPath,
                    filename: req.file.filename,
                    size: req.file.size,
                }
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Upload thumbnail file
     */
    static async uploadThumbnail(req: Request, res: Response) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No thumbnail file uploaded' });
            }

            const thumbnailPath = `thumbnails/${req.file.filename}`;

            return res.json({
                success: true,
                data: {
                    videoThumbnail: thumbnailPath,
                    filename: req.file.filename,
                    size: req.file.size,
                }
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}
