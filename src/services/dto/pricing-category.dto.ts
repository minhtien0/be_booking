export class PricingItemDto {
  id: number;
  name: string;
  price: number;
  currency: string;
  description: string;
  duration: number;
}

export class PricingCategoryDto {
  id: string;
  label: string;
  items: PricingItemDto[];
}