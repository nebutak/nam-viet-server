import { Router } from 'express';
import { NewsController } from '../controllers/news.controller';
import { uploadVideo, uploadThumbnail } from '../config/video-upload.config';

const router = Router();

// Public routes
router.get('/', NewsController.getAllNews);
router.get('/featured', NewsController.getFeaturedNews);
// Admin routes
router.get('/admin/all', NewsController.getAllNewsAdmin);
router.get('/admin/:id', NewsController.getNewsById);
router.post('/admin', NewsController.createNews);
router.put('/admin/:id', NewsController.updateNews);
router.delete('/admin/:id', NewsController.deleteNews);
router.post('/admin/:id/publish', NewsController.publishNews);
router.post('/admin/:id/archive', NewsController.archiveNews);

// Generic public routes (these must be at the very bottom to prevent intercepting /admin routes!)
router.get('/:slug', NewsController.getNewsBySlug);
router.post('/:id/view', NewsController.incrementViewCount);
router.get('/:id/related', NewsController.getRelatedNews);

// Upload routes
router.post('/admin/upload-video', uploadVideo.single('video'), NewsController.uploadVideo);
router.post('/admin/upload-thumbnail', uploadThumbnail.single('thumbnail'), NewsController.uploadThumbnail);

export default router;
