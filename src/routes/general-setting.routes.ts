import { Router } from 'express';
import generalSettingController from '@controllers/general-setting.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { asyncHandler } from '@middlewares/errorHandler';

const router = Router();

router.use(authentication);

// Get system information (OS, CPU, memory, dependencies)
router.get(
  '/system-info',
  authorize('GET_SETTING'),
  asyncHandler(generalSettingController.getSystemInfo.bind(generalSettingController))
);

// Get general settings
router.get(
  '/',
  authorize('GET_SETTING'),
  asyncHandler(generalSettingController.getGeneralSetting.bind(generalSettingController))
);

// Update general settings
router.put(
  '/',
  authorize('GENERAL_SETTING'),
  asyncHandler(generalSettingController.updateGeneralSetting.bind(generalSettingController))
);

export default router;
