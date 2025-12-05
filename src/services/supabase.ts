
import { createClient } from '@supabase/supabase-js';
import { Business, Session, WebsiteReview, OutreachPackage } from '../types';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const isSupabaseEnabled = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseEnabled) {
  // Don't throw here — allow the app to run in a degraded local-only mode.
  // Consumers of these services should handle missing network persistence.
  console.warn('Supabase disabled: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = isSupabaseEnabled ? createClient(supabaseUrl, supabaseKey) : null as any;

// --- SESSIONS ---

export const createSessionInDb = async (sessionData: Partial<Session>) => {
  if (!isSupabaseEnabled) {
    // Return a synthetic session object so the app can continue offline.
    const fake = { id: `local-${Date.now()}`, ...sessionData } as any;
    return fake;
  }

  const { data, error } = await supabase
    .from('sessions')
    .insert([
      {
        category: sessionData.category,
        location: sessionData.location,
        rating_min: sessionData.rating_min,
        rating_max: sessionData.rating_max,
        website_filter: sessionData.website_filter,
        review_count_min: sessionData.review_count_min,
        include_media: sessionData.include_media,
        status: 'active'
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
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
  if (!isSupabaseEnabled) {
    // Return the input but inject local IDs so the UI can work with them
    return rows.map((r, i) => ({ ...r, id: `local-biz-${Date.now()}-${i}` }));
  }

  const { data, error } = await supabase
    .from('businesses')
    .insert(rows)
    .select();

  if (error) throw error;
  return data; // Returns businesses with real UUIDs
};

export const updateBusinessInDb = async (businessId: string, updates: Partial<any>) => {
  if (!isSupabaseEnabled) {
    console.warn('updateBusinessInDb skipped (supabase disabled)', businessId, updates);
    return;
  }

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
