import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@utils/errors';
import { asyncHandler } from './errorHandler';

export const parseFormData = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (req.body && req.body.data && typeof req.body.data === 'string') {
    try {
      const parsedData = JSON.parse(req.body.data);
      // Merge parsed data into req.body
      req.body = { ...req.body, ...parsedData };
      // Delete the raw data string to clean up the request body if desired
      delete req.body.data;
    } catch (error) {
      throw new ValidationError('Invalid JSON in form data', [
        {
          field: 'data',
          message: 'Could not parse JSON payload',
          code: 'invalid_json',
        },
      ]);
    }
  }
  next();
});
