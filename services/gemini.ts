
import { GoogleGenAI } from "@google/genai";
import { Business, OutreachPackage, WebsiteReview } from "../types";

const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// --- HELPER TO CLEAN JSON ---
const cleanJson = (text: string) => {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

const cleanHtml = (text: string) => {
  return text.replace(/```html/g, '').replace(/```/g, '').trim();
};

// --- LOCATION SERVICES ---

export const fetchRegions = async (country: string): Promise<string[]> => {
  const ai = getAiClient();
  const prompt = `List the top 15 administrative regions, states, or counties in ${country}. 
  Return ONLY a raw JSON array of strings. 
  Example: ["California", "Texas", "New York"]
  DO NOT return objects.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = cleanJson(response.text || "[]");
    const parsed = JSON.parse(text);

    // Sanitize: Ensure we return an array of strings, even if AI returns objects
    if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            return item.name || item.region || item.state || item.message || JSON.stringify(item);
        });
    }
    return [];
  } catch (e) {
    console.error("Failed to fetch regions", e);
    return [];
  }
};

// --- DISCOVERY SERVICES ---

export const findBusinessesWithGemini = async (
  category: string,
  location: string,
  minRating: number
): Promise<Business[]> => {
  const ai = getAiClient();
  
  const prompt = `Find 5 ${category} businesses in ${location} that have a rating of at least ${minRating}. 
  Focus on businesses that appear to have NO website or a very basic digital presence.
  
  Return the data as a JSON Array of objects with these exact keys:
  - id (generate a random string)
  - name
  - address
  - rating (number)
  - review_count (number)
  - website_status (enum: "NONE", "POOR", "UNKNOWN")
  - description (short summary, string)
  
  Strictly return JSON only.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = cleanJson(response.text || "[]");
    return JSON.parse(text);
  } catch (e) {
    console.error("Discovery failed", e);
    return [];
  }
};

export const enrichBusinessData = async (business: Business): Promise<Partial<Business>> => {
  const ai = getAiClient();
  const prompt = `Research deep details for: "${business.name}" located at "${business.address}".
  Find their specific list of services, phone numbers, email addresses, and any specific images or video links if available on the web.
  
  Return JSON with:
  - enriched_data: {
      social_links: string[],
      emails: string[],
      phones: string[],
      services: string[], // List of services offered
      media_assets: string[], // URLs of images or videos found (if any)
      extra_details: string
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    const text = cleanJson(response.text || "{}");
    const parsed = JSON.parse(text);
    return parsed.enriched_data ? { enriched_data: parsed.enriched_data } : {};
  } catch (e) {
    console.error("Enrichment failed", e);
    return {};
  }
};

// --- GENERATION SERVICES ---

export const generateWebsitePrompt = async (business: Business): Promise<string> => {
  const ai = getAiClient();
  
  // Explicitly highlight enriched data to ensure it's used
  const extraContext = business.enriched_data ? JSON.stringify(business.enriched_data) : "None available";

  const prompt = `Act as a world-class web agency creative director.
  Generate a comprehensive website prompt for this business:
  Name: ${business.name}
  Address: ${business.address}
  Category: ${business.description}
  
  CRITICAL: INCORPORATE THIS RESEARCHED DATA:
  ${extraContext}

  The prompt should be ready to paste into an AI Website Builder.
  
  IMPORTANT: The structure MUST be a SINGLE PAGE Scrollable Website (Landing Page style).
  Do NOT create separate pages. All content must exist on one long scrolling page with anchor links in the nav.

  Include:
  1. Branding (Colors, Fonts, Vibe)
  2. Hero Section (Headline, Subhead, CTA)
  3. Services Section (3-6 key services based on category)
  4. "Why Choose Us" bullets
  5. Testimonials (Generate 2 realistic placeholders)
  6. Footer details
  
  Format it clearly with Markdown headers.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
        tools: [{ googleSearch: {} }]
    }
  });

  return response.text || "Could not generate prompt.";
};

export const refineWebsitePrompt = async (currentPrompt: string, feedback: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Act as a creative director. Update the following website prompt based on this feedback: "${feedback}".
    
    Current Prompt:
    ${currentPrompt}
    
    Return the fully updated prompt in Markdown. Do not include introductory text, just the prompt.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });

    return response.text || currentPrompt;
};

export const generateWebsiteCode = async (business: Business, approvedPrompt: string): Promise<string> => {
    const ai = getAiClient();

    const prompt = `You are an expert Frontend Developer.
    Create a high-converting, single-page website for "${business.name}" based on this approved design prompt:
    
    "${approvedPrompt}"
    
    Details:
    - Use HTML5 and Tailwind CSS (via CDN) ONLY.
    - No external JS frameworks (React/Vue), just vanilla HTML/JS if needed.
    - Use a clean, modern design with specific colors mentioned in the prompt.
    - Include Font Awesome for icons if needed (via CDN).
    - Ensure it is mobile-responsive.
    - Return ONLY the raw HTML code.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview", // Using the smarter model for coding
        contents: prompt
    });

    return cleanHtml(response.text || "<!-- Failed to generate code -->");
};

export const refineWebsiteCode = async (currentCode: string, instructions: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `You are an expert Frontend Developer.
    You MUST modify the provided HTML/Tailwind code to STRICTLY implement the following fixes.
    
    INSTRUCTIONS FOR FIXES: 
    "${instructions}"
    
    RULES:
    1. You MUST apply specific code changes to address the instructions. Do not ignore them.
    2. Return the FULL updated HTML file. Do not return snippets.
    3. Keep the existing design consistency but fix the issues.
    4. Do not include markdown formatting (like \`\`\`html). Just return the raw code.
    5. Ensure the changes are visible and functional.
    
    CURRENT CODE:
    ${currentCode}
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt
    });

    return cleanHtml(response.text || currentCode);
};

// --- SIMULATION SERVICES ---

export const simulateWebsiteDraft = async (businessName: string): Promise<{ url: string, screenshot: string }> => {
  // Simulating a delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  return {
    url: `https://${businessName.toLowerCase().replace(/\s/g, '-')}.ai-draft.com`,
    screenshot: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" // 1x1 pixel placeholder, UI will handle real placeholder
  };
};

// --- REVIEW SERVICES ---

export const reviewWebsiteContent = async (url: string, screenshotBase64?: string, htmlCode?: string): Promise<WebsiteReview> => {
  const ai = getAiClient();

  let contents: any[] = [];
  let systemInstruction = "";

  if (htmlCode) {
    // Code-based review: Simulate visual analysis
    systemInstruction = `You are an expert UI/UX Design Auditor. 
    You have been provided with the raw HTML/Tailwind code of a landing page.
    
    YOUR TASK:
    1. MENTALLY RENDER this code into a visual website.
    2. Analyze the Visual Hierarchy, Color Contrast, Whitespace Balance, and Mobile Responsiveness based on the Tailwind classes used.
    3. Identify specific flaws in design or conversion optimization.
    4. Provide a score and actionable improvements.
    
    Return valid JSON. Do not use Markdown.`;
    
    contents = [
        { text: `Analyze this website code for ${url}. 
        
        CODE START:
        ${htmlCode.slice(0, 50000)} // Ensure we send enough code
        CODE END.

        Return a JSON object with:
        - design_score (0-10)
        - conversion_score (0-10)
        - critique (array of objects: { point: string, box_2d: [0,0,0,0] }) 
          * For Code Review, keep box_2d as [0,0,0,0] unless you can infer position from the DOM structure.
        - improvements (array of 3 strings, actionable fixes)
        - is_approved (boolean, true if score > 7)` }
    ];
  } else if (screenshotBase64) {
    // Visual review
    contents = [
      {
        inlineData: {
          mimeType: "image/png",
          data: screenshotBase64
        }
      },
      { text: `Analyze this website screenshot for design quality, user experience, and conversion potential.
      Target URL: ${url}
      
      Return a JSON object with:
      - design_score (0-10)
      - conversion_score (0-10)
      - critique (array of objects: { point: string, box_2d: [ymin, xmin, ymax, xmax] })
        * box_2d should be the bounding box of the issue on a 0-100 scale.
        * If general, use [0,0,0,0].
      - improvements (array of 3 strings, actionable fixes)
      - is_approved (boolean, true if score > 7)` }
    ];
  } else {
      throw new Error("No content to review");
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents,
    config: { 
        systemInstruction: systemInstruction,
        responseMimeType: "application/json" 
    }
  });

  try {
    const text = cleanJson(response.text || "{}");
    const parsed = JSON.parse(text);
    
    // Validate structure basics
    if (!parsed.critique) parsed.critique = [];
    if (!parsed.improvements) parsed.improvements = [];
    
    return parsed;
  } catch (e) {
    console.error("Review parsing failed:", e);
    // Return a fallback object so the UI doesn't crash
    return {
        design_score: 5,
        conversion_score: 5,
        critique: [{ point: "AI Review Service encountered an parsing error. Manual review recommended.", box_2d: [0,0,0,0] }],
        improvements: ["Check manual alignment", "Verify mobile responsiveness"],
        is_approved: false
    };
  }
};

// --- OUTREACH SERVICES ---

export const generateOutreachMaterials = async (business: Business, websiteUrl: string): Promise<OutreachPackage> => {
  const ai = getAiClient();

  const prompt = `You are a top-tier sales copywriter.
  Write an outreach package for ${business.name}.
  We just built them a mockup website at: ${websiteUrl}
  Details: ${JSON.stringify(business.enriched_data || {})}
  
  Generate JSON with these EXACT keys:
  - cold_email: { subject: string, body: string }
  - whatsapp: string (The actual message text only, NOT an object)
  - call_script: string (The actual script text only, NOT an object)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
  });

  try {
    const text = cleanJson(response.text || "{}");
    const data = JSON.parse(text);

    if (data.whatsapp && typeof data.whatsapp === 'object') {
        data.whatsapp = (data.whatsapp as any).message || (data.whatsapp as any).text || (data.whatsapp as any).content || JSON.stringify(data.whatsapp);
    }
    if (data.call_script && typeof data.call_script === 'object') {
        data.call_script = (data.call_script as any).message || (data.call_script as any).text || (data.call_script as any).content || JSON.stringify(data.call_script);
    }

    return data;
  } catch (e) {
    console.error("Outreach generation failed", e);
    return {
        cold_email: { subject: "Error", body: "Could not generate." },
        whatsapp: "Error generating content.",
        call_script: "Error generating content."
    };
  }
};

export const refineOutreach = async (
    currentPackage: OutreachPackage, 
    feedback: string, 
    target: 'EMAIL' | 'WHATSAPP' | 'SCRIPT'
): Promise<Partial<OutreachPackage>> => {
    const ai = getAiClient();
    
    let targetContext = "";
    if (target === 'EMAIL') targetContext = `Current Email: ${JSON.stringify(currentPackage.cold_email)}`;
    if (target === 'WHATSAPP') targetContext = `Current WhatsApp: ${currentPackage.whatsapp}`;
    if (target === 'SCRIPT') targetContext = `Current Script: ${currentPackage.call_script}`;

    const prompt = `Refine the following sales copy based on this feedback: "${feedback}".
    ${targetContext}
    
    Return ONLY the updated JSON part for this specific section.
    If EMAIL, return { cold_email: { subject, body } }.
    If WHATSAPP, return { whatsapp: string }.
    If SCRIPT, return { call_script: string }.`;

    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt
    });

    try {
        const text = cleanJson(response.text || "{}");
        const parsed = JSON.parse(text);
        
        // Sanitize return
        if (target === 'WHATSAPP' && typeof parsed.whatsapp === 'object') {
            parsed.whatsapp = parsed.whatsapp.message || parsed.whatsapp.text;
        }
        if (target === 'SCRIPT' && typeof parsed.call_script === 'object') {
            parsed.call_script = parsed.call_script.message || parsed.call_script.text;
        }

        return parsed;
    } catch(e) {
        return {};
    }
}
