
import { createClient } from '@supabase/supabase-js';
import { Business, Session, WebsiteReview, OutreachPackage } from '../types';

// NOTE: Hardcoded for testing. Remove before production.
const supabaseUrl = 'https://vvyfmdtvfsysciwplwvi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2eWZtZHR2ZnN5c2Npd3Bsd3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NTM2ODYsImV4cCI6MjA4MDQyOTY4Nn0.anj5epsm4-q_DOPY4nJrqv1Va7iOTgjCjzFxyRBfpLM';

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- SESSIONS ---

export const createSessionInDb = async (sessionData: Partial<Session>) => {
  const { data, error } = await supabase
    .from('sessions')
    .insert([{
      category: sessionData.category,
      location: sessionData.location,
      rating_min: sessionData.rating_min,
      rating_max: sessionData.rating_max,
      website_filter: sessionData.website_filter,
      review_count_min: sessionData.review_count_min,
      include_media: sessionData.include_media,
      status: 'active'
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const fetchSessionsFromDb = async (): Promise<Session[]> => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }
  return data || [];
};

// --- BUSINESSES ---

export const saveBusinessesToDb = async (sessionId: string, businesses: Business[]) => {
  const rows = businesses.map(b => ({
    session_id: sessionId,
    name: b.name,
    address: b.address,
    category: b.description, // Mapping description to category/type loosely
    rating: b.rating,
    review_count: b.review_count,
    website_status: b.website_status,
    description: b.description,
    confidence_score: 80, // Default confidence
    is_verified: false
  }));

  const { data, error } = await supabase
    .from('businesses')
    .insert(rows)
    .select();

  if (error) throw error;
  return data; // Returns businesses with real UUIDs
};

export const fetchBusinessesForSession = async (sessionId: string): Promise<Business[]> => {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('session_id', sessionId);

  if (error) {
    console.error("Error fetching businesses:", error);
    return [];
  }
  
  // Map DB columns back to Business interface if needed
  // Enriched data usually stored in a jsonb column or notes, depending on schema
  // Here assuming standard columns match mostly.
  return data.map((row: any) => ({
      ...row,
      enriched_data: {
          phones: row.phone ? [row.phone] : [],
          media_assets: row.media, // Assuming media is jsonb
          // If we shoved other enriched data into notes or specific columns, parse here
      }
  })) || [];
};

export const updateBusinessInDb = async (businessId: string, updates: Partial<any>) => {
  const { error } = await supabase
    .from('businesses')
    .update(updates)
    .eq('id', businessId);
    
  if (error) console.error("Error updating business:", error);
};

// --- PROMPTS ---

export const savePromptToDb = async (businessId: string, promptContent: string) => {
    // Check if exists first to update or insert
    const { data: existing } = await supabase.from('prompts').select('id').eq('business_id', businessId).single();
    
    if (existing) {
        return await supabase
            .from('prompts')
            .update({ generated_prompt: promptContent, is_approved: true })
            .eq('id', existing.id);
    } else {
        return await supabase
            .from('prompts')
            .insert([{ business_id: businessId, generated_prompt: promptContent, is_approved: true }]);
    }
};

// --- WEBSITES ---

export const saveWebsiteToDb = async (businessId: string, url: string, sourceCode: string, screenshot: string) => {
    const { data: existing } = await supabase.from('websites').select('id').eq('business_id', businessId).single();

    const payload = {
        status: 'DRAFT',
        url: url,
        source_code: sourceCode,
        screenshots: screenshot ? [screenshot] : [] // Store as array jsonb
    };

    if (existing) {
        return await supabase.from('websites').update(payload).eq('id', existing.id);
    } else {
        return await supabase.from('websites').insert([{ business_id: businessId, ...payload }]);
    }
};

// --- REVIEWS ---

export const saveReviewToDb = async (businessId: string, review: WebsiteReview) => {
    const payload = {
        design_score: review.design_score,
        conversion_score: review.conversion_score,
        issues: review.critique,
        suggestions: review.improvements,
        status: review.is_approved ? 'APPROVED' : 'NEEDS_FIX'
    };

    const { data: existing } = await supabase.from('reviews').select('id').eq('business_id', businessId).single();
    
    if (existing) {
        return await supabase.from('reviews').update(payload).eq('id', existing.id);
    } else {
        return await supabase.from('reviews').insert([{ business_id: businessId, ...payload }]);
    }
};

// --- OUTREACH ---

export const saveOutreachToDb = async (businessId: string, outreach: OutreachPackage) => {
    const payload = {
        cold_email_short: outreach.cold_email.body.substring(0, 100) + "...", // Derived
        cold_email_full: outreach.cold_email.body,
        subject_lines: [outreach.cold_email.subject], // Storing as array
        whatsapp_pitch: outreach.whatsapp,
        call_script: outreach.call_script,
        status: 'GENERATED'
    };

    const { data: existing } = await supabase.from('outreach').select('id').eq('business_id', businessId).single();
    
    if (existing) {
        return await supabase.from('outreach').update(payload).eq('id', existing.id);
    } else {
        return await supabase.from('outreach').insert([{ business_id: businessId, ...payload }]);
    }
};
