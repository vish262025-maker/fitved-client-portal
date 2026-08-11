export interface BlogAuthor {
  id: string;
  name: string;
  slug: string;
  avatar_url?: string;
  bio?: string;
  credentials?: string;
  social_links?: {
    instagram?: string;
    linkedin?: string;
    twitter?: string;
    website?: string;
  };
  areas_of_expertise?: string[];
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  meta_title?: string;
  meta_description?: string;
}

export interface RecipeDetails {
  prep_time_mins: number;
  cook_time_mins: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Advanced";
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  diet_type: "Vegetarian" | "Vegan" | "Non-Vegetarian" | "Eggetarian";
  ingredients: string[];
  instructions: string[];
  tips?: string[];
}

export interface ComparisonDetails {
  optionA: {
    name: string;
    subtitle: string;
    pros: string[];
    cons: string[];
    rating: number;
  };
  optionB: {
    name: string;
    subtitle: string;
    pros: string[];
    cons: string[];
    rating: number;
  };
  verdict: string;
  winner: "optionA" | "optionB" | "tie";
  featureMatrix: Array<{ feature: string; optionAVal: string; optionBVal: string }>;
}

export interface LocationData {
  city: string;
  locality?: string;
  service_type: string;
  top_coaches_count?: number;
  popular_areas?: string[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ContentBlock {
  type: "heading" | "paragraph" | "callout" | "tip" | "warning" | "nutrition_table" | "workout_table" | "image" | "youtube" | "quote";
  title?: string;
  content?: string;
  level?: 2 | 3 | 4;
  url?: string;
  caption?: string;
  tableData?: Array<Record<string, string>>;
}

export interface BlogArticle {
  id: string;
  title: string;
  display_title?: string;
  slug: string;
  summary: string;
  content: {
    keyTakeaways?: string[];
    blocks: ContentBlock[];
    medicalDisclaimer?: boolean;
    coachReviewBadge?: string;
  };
  category_id?: string;
  category?: BlogCategory;
  author_id?: string;
  author?: BlogAuthor;
  featured_image: string;
  reading_time: number;
  tags: string[];
  is_featured?: boolean;
  is_editor_pick?: boolean;
  is_popular?: boolean;
  published?: boolean;
  published_at: string;
  updated_at?: string;
  views_count?: number;
  seo_title?: string;
  seo_description?: string;
  canonical_url?: string;
  keywords?: string[];
  image_alt?: string;
  faq_schema?: FAQItem[];
  recipe_details?: RecipeDetails;
  comparison_details?: ComparisonDetails;
  location_data?: LocationData;
  topic_hub_slug?: string;
}

export interface TopicHub {
  id: string;
  name: string;
  slug: string;
  title: string;
  subtitle?: string;
  hero_image?: string;
  description?: string;
  featured_article_ids?: string[];
  meta_title?: string;
  meta_description?: string;
}

export interface LocationSEOPage {
  id: string;
  city: string;
  slug: string;
  service_type: string;
  title: string;
  meta_description?: string;
  content: string;
  hero_image?: string;
  faqs?: FAQItem[];
}
