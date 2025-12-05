
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
  visual_design_score: number;
  usability_score: number;
  conversion_score: number;
  strengths: string[];
  issues: string[];
  recommendations: string[];
  mobile_responsiveness_notes: string[];
  accessibility_issues: string[];
}

export interface OutreachPackage {
  cold_email: {
    subject: string;
    body: string;
  };
  whatsapp: string;
  call_script: string;
}

export type ProcessingStage = 'PROMPT' | 'BUILD' | 'REVIEW' | 'OUTREACH';
