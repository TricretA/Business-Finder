
export interface Session {
  id: string;
  created_at: string;
  category: string;
  location: string;
  rating_min: number;
  rating_max: number;
  website_filter: 'NO_WEBSITE' | 'POOR_WEBSITE' | 'ANY';
  review_count_min: number;
  include_media: boolean;
  status: 'active' | 'archived';
}

export interface Business {
  id: string;
  name: string;
  address: string;
  rating: number;
  review_count: number;
  website_status: 'NONE' | 'POOR' | 'GOOD' | 'UNKNOWN';
  description?: string;
  phone?: string;
  google_maps_uri?: string;
  notes?: string;
  enriched_data?: {
    social_links?: string[];
    emails?: string[];
    phones?: string[];
    services?: string[];
    media_assets?: string[];
    extra_details?: string;
  };
}

export interface GeneratedPrompt {
  content: string;
  strength_score: number;
  missing_fields: string[];
}

export interface WebsiteReview {
  design_score: number;
  conversion_score: number;
  critique: Array<{
    point: string;
    box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] on 0-100 scale
    related_code_snippet?: string; // Exact code match for highlighting
  }>;
  improvements: string[];
  is_approved: boolean;
}

export interface OutreachPackage {
  cold_email: {
    subject: string;
    body: string;
  };
  whatsapp: string;
  call_script: string;
  follow_ups: Array<{
    subject: string;
    body: string;
    delay: string; // e.g. "2 days later"
  }>;
  objections: Array<{
    objection: string;
    response: string;
  }>;
}

export type ProcessingStage = 'PROMPT' | 'BUILD' | 'REVIEW' | 'OUTREACH' | 'SUMMARY';
