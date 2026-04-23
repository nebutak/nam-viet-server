import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sales & Production Management System API',
      version: '1.0.0',
      description: `
        Comprehensive ERP system for sales and production management.
        
        ## Features
        - Multi-warehouse inventory management (Raw Materials, Packaging, Finished Products, Goods)
        - Production management with BOM (Bill of Materials)
        - Sales order management with promotions
        - Customer & supplier management
        - Financial management (Receipts, Vouchers, Cash Fund, Debt Reconciliation)
        - HR management (Attendance, Salary)
        - Real-time notifications
        - Comprehensive reporting & analytics
        
        ## Authentication
        Most endpoints require authentication via JWT Bearer token.
        Use the /api/auth/login endpoint to obtain a token.
        
        ## Error Codes
        - VALIDATION_ERROR: Invalid input data
        - AUTHENTICATION_ERROR: Invalid or missing authentication
        - AUTHORIZATION_ERROR: Insufficient permissions
        - NOT_FOUND: Resource not found
        - CONFLICT: Duplicate or conflicting data
        - RATE_LIMIT_ERROR: Too many requests
        - DATABASE_ERROR: Database operation failed
        - INTERNAL_ERROR: Internal server error
      `,
      contact: {
        name: 'API Support',
        email: 'support@yourcompany.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8000}`,
        description: 'Development server',
      },
      {
        url: 'https://api.yourcompany.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token in the format: Bearer {token}',
        },
      },
      responses: {
        Success: {
          description: 'Success response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: true,
                  },
                  data: {
                    type: 'object',
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
        SuccessWithPagination: {
          description: 'Success response with pagination',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: true,
                  },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                    },
                  },
                  meta: {
                    type: 'object',
                    properties: {
                      page: {
                        type: 'integer',
                        example: 1,
                      },
                      limit: {
                        type: 'integer',
                        example: 20,
                      },
                      total: {
                        type: 'integer',
                        example: 100,
                      },
                      totalPages: {
                        type: 'integer',
                        example: 5,
                      },
                    },
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  error: {
                    type: 'object',
                    properties: {
                      code: {
                        type: 'string',
                        example: 'VALIDATION_ERROR',
                      },
                      message: {
                        type: 'string',
                        example: 'Validation failed',
                      },
                      details: {
                        type: 'array',
                        items: {
                          type: 'object',
                        },
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        AuthenticationError: {
          description: 'Authentication error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  error: {
                    type: 'object',
                    properties: {
                      code: {
                        type: 'string',
                        example: 'AUTHENTICATION_ERROR',
                      },
                      message: {
                        type: 'string',
                        example: 'No token provided',
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        AuthorizationError: {
          description: 'Authorization error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  error: {
                    type: 'object',
                    properties: {
                      code: {
                        type: 'string',
                        example: 'AUTHORIZATION_ERROR',
                      },
                      message: {
                        type: 'string',
                        example: 'Access denied',
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  error: {
                    type: 'object',
                    properties: {
                      code: {
                        type: 'string',
                        example: 'NOT_FOUND',
                      },
                      message: {
                        type: 'string',
                        example: 'Resource not found',
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        InternalError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  error: {
                    type: 'object',
                    properties: {
                      code: {
                        type: 'string',
                        example: 'INTERNAL_ERROR',
                      },
                      message: {
                        type: 'string',
                        example: 'Internal server error',
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      schemas: {
        // Common schemas
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
                details: {
                  type: 'object',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              example: 1,
            },
            limit: {
              type: 'integer',
              example: 20,
            },
            total: {
              type: 'integer',
              example: 100,
            },
            totalPages: {
              type: 'integer',
              example: 5,
            },
          },
        },
      },
      parameters: {
        PageParam: {
          in: 'query',
          name: 'page',
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1,
          },
          description: 'Page number for pagination',
        },
        LimitParam: {
          in: 'query',
          name: 'limit',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
          description: 'Number of items per page',
        },
        SearchParam: {
          in: 'query',
          name: 'search',
          schema: {
            type: 'string',
          },
          description: 'Search keyword',
        },
        SortByParam: {
          in: 'query',
          name: 'sortBy',
          schema: {
            type: 'string',
          },
          description: 'Field to sort by',
        },
        SortOrderParam: {
          in: 'query',
          name: 'sortOrder',
          schema: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'asc',
          },
          description: 'Sort order',
        },
        StatusParam: {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
          },
          description: 'Filter by status',
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Authentication endpoints (login, logout, token refresh)',
      },
      {
        name: 'Users',
        description: 'User management endpoints',
      },
      {
        name: 'Roles',
        description: 'Role management endpoints',
      },
      {
        name: 'Permissions',
        description: 'Permission management endpoints',
      },
      {
        name: 'Warehouses',
        description: 'Warehouse management endpoints',
      },
      {
        name: 'Categories',
        description: 'Product category management endpoints',
      },
      {
        name: 'Suppliers',
        description: 'Supplier management endpoints',
      },
      {
        name: 'Products',
        description: 'Product management endpoints',
      },
      {
        name: 'Inventory',
        description: 'Inventory tracking endpoints',
      },
      {
        name: 'Stock Transactions',
        description: 'Stock transaction management (import, export, transfer, disposal, stocktake)',
      },
      {
        name: 'Stock Transfers',
        description: 'Stock transfer management endpoints',
      },
      {
        name: 'BOM',
        description: 'Bill of Materials management endpoints',
      },
      {
        name: 'Production Orders',
        description: 'Production order management endpoints',
      },
      {
        name: 'Customers',
        description: 'Customer management endpoints',
      },
      {
        name: 'Sales Orders',
        description: 'Sales order management endpoints',
      },
      {
        name: 'Deliveries',
        description: 'Delivery management endpoints',
      },
      {
        name: 'Payment Receipts',
        description: 'Payment receipt management endpoints',
      },
      {
        name: 'Payment Vouchers',
        description: 'Payment voucher management endpoints',
      },
      {
        name: 'Debt Reconciliation',
        description: 'Debt reconciliation management endpoints',
      },
      {
        name: 'Cash Fund',
        description: 'Cash fund management endpoints',
      },
      {
        name: 'Promotions',
        description: 'Promotion management endpoints',
      },
      {
        name: 'Attendance',
        description: 'Attendance management endpoints',
      },
      {
        name: 'Salary',
        description: 'Salary management endpoints',
      },
      {
        name: 'Notifications',
        description: 'Notification management endpoints',
      },
      {
        name: 'Reports',
        description: 'Reporting and analytics endpoints',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Application): void => {
  // Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Sales & Production API Docs',
    })
  );

  // Swagger JSON
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('✅ Swagger documentation setup complete');
  console.log(`📚 API Docs available at: http://localhost:${process.env.PORT || 8000}/api-docs`);
};

export default swaggerSpec;
