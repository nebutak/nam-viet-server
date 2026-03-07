import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError } from '@utils/errors';
import {
  PublicProductDto,
  PublicProductDetailDto
} from '@custom-types/cs-product.type';
import { PromotionInfo } from '@custom-types/cs-promotion.type';
const prisma = new PrismaClient();

class StoreProductService {

  async getPublicProducts(params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: number;
    isFeatured?: boolean;
    historySearch?: string[];
    sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'bestseller';
    packagingType?: 'bottle' | 'box' | 'bag' | 'label' | 'other';
  }) {
    const {
      page = 1, limit = 20, search, categoryId, sortBy = 'newest',
      historySearch,
      packagingType
    } = params;

    const cleanedHistorySearch = historySearch?.map(h => this.normalizeText(h))


    const offset = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      status: 'active',
      productType: { in: ['finished_product', 'goods'] },
      // ...(isFeatured !== undefined && {  isFeatured }),
      ...(categoryId && { categoryId }),
      ...(packagingType && { packagingType: packagingType as any }),
      ...(search && {
        OR: [
          { productName: { contains: search } },
          { sku: { contains: search } }
        ]
      })
    };

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'price_asc') orderBy = { sellingPriceRetail: 'asc' };
    if (sortBy === 'price_desc') orderBy = { sellingPriceRetail: 'desc' };
    if (sortBy === 'newest') orderBy = { createdAt: 'desc' };

    const products = await prisma.product.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy,
      select: {
        id: true,
        productName: true,
        sku: true,
        slug: true,
        sellingPriceRetail: true,
        unit: { select: { unitCode: true, unitName: true } },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { imageUrl: true, altText: true }
        },
        videos: {
          where: { isPrimary: true },
          take: 1,
          select: {
            videoUrl: true,
            videoType: true,
          }
        },
        category: { select: { id: true, categoryName: true, slug: true } },
        inventory: { select: { quantity: true, reservedQuantity: true } },

        promotionProducts: {
          where: {
            promotion: {
              status: 'active',
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            }
          },
          include: {
            promotion: {
              select: {
                id: true,
                promotionName: true,
                promotionType: true,
                discountValue: true,
                maxDiscountValue: true,
                endDate: true,
              }
            }
          }
        }
      }
    });

    const total = await prisma.product.count({ where });

    let rankedProducts = products;

    if (!search && cleanedHistorySearch && cleanedHistorySearch.length > 0) {
      rankedProducts = products
        .map(p => {
          const percents = cleanedHistorySearch.map(keyword =>
            this.similarityPercent(p.productName, keyword)
          );

          const bestPercent = Math.max(...percents);

          return {
            ...p,
            __matchPercent: bestPercent
          };
        })
        .sort((a, b) => b.__matchPercent - a.__matchPercent);
    }

    const pagedProducts = rankedProducts.slice(offset, offset + limit);

    const mappedProducts: PublicProductDto[] = pagedProducts.map((p: any) => {
      const basePrice = Number(p.sellingPriceRetail || 0);

      const totalStock = p.inventory
        ? p.inventory.reduce((sum: number, inv: any) => {
          const available = Number(inv.quantity) - Number(inv.reservedQuantity);
          return sum + Math.max(0, available);
        }, 0)
        : 0;

      const { salePrice, discountInfo } = this.calculateBestPrice(basePrice, p.promotionProducts);

      return {
        id: p.id,
        name: p.productName,
        sku: p.sku,
        slug: p.slug || '',
        image: (p.images && p.images.length > 0) ? p.images[0].imageUrl : '/placeholder.png',
        video: (p.videos && p.videos.length > 0) ? p.videos[0].videoUrl : '/placeholder-video.mp4',
        videoType: (p.videos && p.videos.length > 0) ? p.videos[0].videoType : 'review',
        unit: (p.unit as any)?.unitName || '',
        originalPrice: basePrice,
        salePrice: salePrice,
        discountPercentage: (discountInfo && discountInfo.type !== 'gift')
          ? Math.round(((basePrice - salePrice) / basePrice) * 100)
          : 0,
        isFeatured: p.isFeatured,
        inStock: totalStock > 0,
        category: {
          id: p.category?.id,
          name: p.category?.categoryName,
          slug: p.category?.slug || ''
        },
        promotion: discountInfo
      };
    });

    const result = {
      data: mappedProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

    return result;
  }

  async getProductDetail(slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug, status: 'active', productType: { in: ['finished_product', 'goods'] } },
      select: {
        id: true,
        productName: true,
        sku: true,
        slug: true,
        sellingPriceRetail: true,
        sellingPriceWholesale: true,
        sellingPriceVip: true,
        description: true,
        unit: { select: { unitCode: true, unitName: true } },
        barcode: true,
        weight: true,
        dimensions: true,
        packagingType: true,
        // isFeatured: true,

        category: { select: { id: true, categoryName: true, slug: true } },
        images: {
          orderBy: { displayOrder: 'asc' },
          select: { imageUrl: true, altText: true, isPrimary: true, imageType: true }
        },
        videos: {
          orderBy: { displayOrder: 'asc' },
          select: { videoUrl: true, thumbnail: true, title: true }
        },
        inventory: { select: { quantity: true, reservedQuantity: true } },
        promotionProducts: {
          where: {
            promotion: {
              status: 'active',
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            }
          },
          include: {
            promotion: {
              select: {
                id: true,
                promotionName: true,
                promotionType: true,
                discountValue: true,
                maxDiscountValue: true,
                endDate: true,
              }
            }
          }
        }
      }
    });




    if (!product) throw new NotFoundError('Sản phẩm không tồn tại');

    const basePrice = Number(product.sellingPriceRetail);
    const totalStock = product.inventory
      ? product.inventory.reduce((sum: number, inv: any) => sum + Math.max(0, Number(inv.quantity) - Number(inv.reservedQuantity)), 0)
      : 0;


    const { salePrice, discountInfo, allPromotions } = this.calculateBestPrice(basePrice, product.promotionProducts);

    const result: PublicProductDetailDto = {
      id: product.id,
      name: product.productName,
      sku: product.sku,
      slug: product.slug || '',
      unit: (product.unit as any)?.unitName || '',
      originalPrice: basePrice,
      salePrice: salePrice,
      discountPercentage: (discountInfo && discountInfo.type !== 'gift')
        ? Math.round(((basePrice - salePrice) / basePrice) * 100) : 0,
      // isFeatured: product.isFeatured,
      inStock: totalStock > 0,
      category: {
        id: product.category?.id || 0,
        name: product.category?.categoryName || 'Unknown',
        slug: product.category?.slug || ''
      },
      promotion: discountInfo,
      availablePromotions: allPromotions,
      description: product.description || '',
      barcode: product.barcode || undefined,
      weight: product.weight ? Number(product.weight) : undefined,
      dimensions: product.dimensions || undefined,
      packagingType: product.packagingType || undefined,
      images: product.images.map(img => ({
        url: img.imageUrl,
        alt: img.altText || product.productName,
        isPrimary: img.isPrimary
      })),
      videos: product.videos.map(v => ({
        url: v.videoUrl,
        thumbnail: v.thumbnail || undefined,
        title: v.title || undefined
      })),
    };

    return result;
  }



  private normalizeText(text: string) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }


  private similarityPercent(a: string, b: string): number {
    const A = this.normalizeText(a);
    const B = this.normalizeText(b);

    if (!A || !B) return 0;

    const setA = new Set(A.split(" "));
    const setB = new Set(B.split(" "));

    const intersection = [...setA].filter(x => setB.has(x));

    const percent = (intersection.length / Math.min(setA.size, setB.size)) * 100;

    return Math.min(100, Math.round(percent));
  }



  private calculateBestPrice(originalPrice: number, activePromotions: any[]) {
    let bestPrice = originalPrice;
    let bestPromo: PromotionInfo | null = null;
    const allPromos: PromotionInfo[] = [];

    if (!activePromotions || activePromotions.length === 0) {
      return { salePrice: originalPrice, discountInfo: null, allPromotions: [] };
    }

    for (const item of activePromotions) {
      const promo = item.promotion;
      let priceAfterDiscount = originalPrice;
      let promoInfo: PromotionInfo = {
        id: promo.id,
        name: promo.promotionName,
        type: promo.promotionType,
        endDate: promo.endDate,
        giftName: undefined
      };

      if (promo.promotionType === 'percent_discount') {
        const discountVal = item.discountValueOverride || promo.discountValue || 0;
        let discountAmount = (originalPrice * Number(discountVal)) / 100;
        if (promo.maxDiscountValue) discountAmount = Math.min(discountAmount, Number(promo.maxDiscountValue));
        priceAfterDiscount = originalPrice - discountAmount;
        promoInfo.value = discountAmount;
      }
      else if (promo.promotionType === 'fixed_discount') {
        const discountVal = item.discountValueOverride || promo.discountValue || 0;
        priceAfterDiscount = originalPrice - Number(discountVal);
        promoInfo.value = Number(discountVal);
      }
      else if (promo.promotionType === 'gift') {
        priceAfterDiscount = originalPrice;
        promoInfo.value = 0;
      }

      priceAfterDiscount = Math.max(0, priceAfterDiscount);
      allPromos.push({ ...promoInfo, _tempPrice: priceAfterDiscount } as any);
    }

    allPromos.sort((a: any, b: any) => {
      if (a._tempPrice !== b._tempPrice) return a._tempPrice - b._tempPrice;
      if (a.type !== 'gift' && b.type === 'gift') return -1;
      if (a.type === 'gift' && b.type !== 'gift') return 1;
      return 0;
    });

    if (allPromos.length > 0) {
      const best = allPromos[0] as any;
      bestPrice = best._tempPrice;
      bestPromo = {
        id: best.id,
        name: best.name,
        type: best.type,
        value: best.value,
        giftName: best.giftName,
        endDate: best.endDate
      };
    }

    const cleanList = allPromos.map(({ _tempPrice, ...rest }: any) => rest as PromotionInfo);
    return { salePrice: bestPrice, discountInfo: bestPromo, allPromotions: cleanList };
  }
}

export default new StoreProductService();