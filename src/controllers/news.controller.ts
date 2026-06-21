import { Request, Response } from 'express';
import { NewsService } from '../services/news.service';
import {
    createNewsSchema,
    updateNewsSchema,
    newsQuerySchema,
    newsLikeSchema,
    createNewsCommentSchema,
    newsCommentQuerySchema,
    updateNewsCommentStatusSchema,
    trackNewsShareSchema,
} from '../validators/news.validator';

export class NewsController {
    private static getRequestMeta(req: Request) {
        return {
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
        };
    }

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
     * Get public engagement data
     */
    static async getEngagement(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const clientId = req.query.clientId as string | undefined;
            const engagement = await NewsService.getEngagement(id, clientId);

            if (!engagement) {
                return res.status(404).json({ success: false, error: 'News not found' });
            }

            return res.json({ success: true, data: engagement });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Toggle like
     */
    static async toggleLike(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const data = newsLikeSchema.parse(req.body);
            const result = await NewsService.toggleLike(id, data.clientId, NewsController.getRequestMeta(req));

            return res.json({ success: true, data: result });
        } catch (error: any) {
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Get approved comments for public article
     */
    static async getPublicComments(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const comments = await NewsService.getPublicComments(id);
            return res.json({ success: true, data: comments });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create public comment
     */
    static async createComment(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const data = createNewsCommentSchema.parse(req.body);
            const comment = await NewsService.createComment(id, data, NewsController.getRequestMeta(req));

            return res.status(201).json({ success: true, data: comment });
        } catch (error: any) {
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Track share event
     */
    static async trackShare(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id);
            const data = trackNewsShareSchema.parse(req.body);
            const result = await NewsService.trackShare(id, data, NewsController.getRequestMeta(req));

            return res.json({ success: true, data: result });
        } catch (error: any) {
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Get comments for admin moderation
     */
    static async getCommentsAdmin(req: Request, res: Response) {
        try {
            const query = newsCommentQuerySchema.parse(req.query);
            const result = await NewsService.getCommentsAdmin(query);

            return res.json({ success: true, ...result });
        } catch (error: any) {
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Update comment status
     */
    static async updateCommentStatus(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.commentId);
            const data = updateNewsCommentStatusSchema.parse(req.body);
            const comment = await NewsService.updateCommentStatus(id, data.status);

            return res.json({ success: true, data: comment });
        } catch (error: any) {
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete comment
     */
    static async deleteComment(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.commentId);
            await NewsService.deleteComment(id);

            return res.json({ success: true, message: 'Comment deleted successfully' });
        } catch (error: any) {
            return res.status(400).json({ success: false, error: error.message });
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
