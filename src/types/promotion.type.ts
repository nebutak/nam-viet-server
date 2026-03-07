export interface PromotionConditions {
  applicable_categories?: number[];
  applicable_customer_types?: string[];
  days_of_week?: number[];
  time_slots?: string[];
  max_usage_per_customer?: number;
  buy_quantity?: number;
  get_quantity?: number;
  get_same_product?: boolean;
  gift_product_id?: number;
  gift_quantity?: number;
  customer_id?: number;
  unit?: string;
}

export interface ApplyPromotionResult {
  applicable: boolean;
  discountAmount: number;
  finalAmount: number;
  giftProducts?: {
    productId: number;
    quantity: number;
  }[];
  message?: string;
}
