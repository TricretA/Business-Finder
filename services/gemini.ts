
import { GoogleGenAI } from "@google/genai";
import { Business, OutreachPackage, WebsiteReview } from "../types";

const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// --- HELPER TO CLEAN JSON ---
const extractJson = (text: string) => {
  try {
    // 1. Try to find the first '{' and the last '}'
    const startObj = text.indexOf('{');
    const endObj = text.lastIndexOf('}');
    
    // 2. Try to find the first '[' and the last ']' (for arrays)
    const startArr = text.indexOf('[');
    const endArr = text.lastIndexOf(']');

    let jsonString = "{}";

    // Determine if it looks more like an Object or an Array
    // If both exist, take the one that starts earlier (outermost)
    if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
        if (endObj !== -1) {
            jsonString = text.substring(startObj, endObj + 1);
        }
    } else if (startArr !== -1) {
        if (endArr !== -1) {
            jsonString = text.substring(startArr, endArr + 1);
        }
    }

    return jsonString;
  } catch (e) {
      return "{}";
  }
};

const cleanHtml = (text: string) => {
  return text.replace(/```html/g, '').replace(/```/g, '').trim();
};

// --- LOCATION SERVICES ---

export const fetchRegions = async (country: string): Promise<string[]> => {
  const ai = getAiClient();
  const prompt = `List all administrative regions, states, or counties in ${country}. 
  Return ONLY a raw JSON array of strings. 
  Example: ["California", "Texas", "New York"]
  DO NOT return objects.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    const text = extractJson(response.text || "[]");
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

    const text = extractJson(response.text || "[]");
    return JSON.parse(text);
  } catch (e) {
    console.error("Discovery failed", e);
    return [];
  }
};

export const enrichBusinessData = async (business: Business): Promise<Partial<Business>> => {
  const ai = getAiClient();
  const prompt = `Perform an EXTENSIVE and DEEP investigative research on the business: "${business.name}" located at "${business.address}".

  Use Google Search to find every available detail. Dig deep into directories, social media, and reviews.
  
  Look for:
  1.  **Contact Info**: Specific email addresses (look for info@, contact@, or owner emails), phone numbers (mobile/landline).
  2.  **Social Footprint**: URLs for Facebook, Instagram, LinkedIn, Twitter, TikTok.
  3.  **Services**: A detailed, granular list of specific services or products they offer.
  4.  **Media**: Links to high-quality images of their work, team, or storefront.
  5.  **Background**: Year established, Owner/Founder name, Business hours.
  6.  **Reputation**: Summary of what customers love and what they complain about (pain points).

  Return a STRICT JSON object with this exact schema (no markdown, no conversation):
  {
    "enriched_data": {
      "social_links": ["url1", "url2"],
      "emails": ["email1", "email2"],
      "phones": ["phone1", "phone2"],
      "services": ["service1", "service2"], 
      "media_assets": ["url1", "url2"],
      "extra_details": "A comprehensive summary paragraph covering history, reputation, owner info, and key findings."
    }
  }`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    
    const text = extractJson(response.text || "{}");
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

  const prompt = `You are generating a full professional MULTI-PAGE business website blueprint. 
  Output a structured, detailed plan that can be used to build a complete multi-page digital presence.

**IMPORTANT RULES**

* Create a **MULTI-PAGE WEBSITE STRUCTURE**.
* Do NOT create a single-page long-scroll site. Treat this as a site with distinct pages (e.g., Home, About, Services, Contact).
* Design must look **modern, clean, premium, and conversion-focused**.
* Generate realistic, business-specific content — no placeholders except where necessary.

---

## **1. BRANDING & STYLE**

Provide:
* Primary, secondary, and accent colors
* Typography pairings
* Logo description
* Brand vibe (premium, minimal, friendly, professional, etc.)

---

## **2. SITEMAP (Multi-Page)**

Define the content for EACH of the following pages:

### **A. HOME PAGE**
* Hero Section (Headline, Subhead, Primary CTA)
* "At a Glance" Services Summary
* Social Proof / Trust Signals
* Call to Action Banner

### **B. ABOUT US PAGE**
* Company Story / History
* Mission Statement
* Team Introduction (if applicable)
* Values

### **C. SERVICES / PRODUCTS PAGE**
* Detailed breakdown of specific services (use the Researched Data)
* Pricing (if applicable/estimated)
* Service Benefits
* FAQ Section

### **D. CONTACT PAGE**
* Contact Form fields
* Map placeholder
* Physical Address, Phone, Email
* Operating Hours

---

## **3. UI/UX REQUIREMENTS**

* **Navigation Bar**: Must link to all 4 pages.
* **Mobile Responsiveness**: Critical for local businesses.
* **Footer**: Consistent across all pages with links and copyright.

---

## **4. CONTENT GENERATION**

* Generate **3–5 realistic client testimonials** for the Home page.
* Generate a **compelling "Why Choose Us"** argument.

---

**BUSINESS CONTEXT**

Name: ${business.name}
Address: ${business.address}
Category: ${business.description}

**RESEARCHED DATA TO INCORPORATE**

${extraContext}

---

## **OUTPUT FORMAT**

Deliver everything in a clean, well-organized Markdown structure that clearly separates the content for each page.`;


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

export const generateWebsiteCode = async (business: Business, approvedPrompt: string, designStyle: string = "Modern Professional", websiteType: string = "Landing Page"): Promise<string> => {
    const ai = getAiClient();

    const prompt = `You are an expert Frontend Developer.
    Create a high-converting, MULTI-PAGE website for "${business.name}" based on this approved blueprint:
    
    "${approvedPrompt}"
    
    **DESIGN PARAMETERS**:
    - **STYLE**: ${designStyle} (Adhere STRICTLY to this aesthetic).
    - **TYPE**: ${websiteType} (Optimize layout for this specific use-case).
    
    **CRITICAL TECHNICAL REQUIREMENTS**:
    1. **Single File SPA**: You must build this as a SINGLE 'index.html' file that functions as a multi-page website.
    2. **Navigation Logic**: Use Vanilla JavaScript to hide/show different \`<section>\` elements based on the Navigation Menu clicks (e.g., clicking "About" hides Home and shows the About section).
    3. **Architecture**:
        - Fixed Navigation Bar (Home, About, Services, Contact).
        - Distinct Sections with IDs: \`#home\`, \`#about\`, \`#services\`, \`#contact\`.
        - Default View: Show Home, hide others on load.
    4. **Tech Stack**: HTML5 and Tailwind CSS (via CDN) ONLY. No React, Vue, or external routing libraries.
    5. **Design**: Use high-quality Tailwind utility classes for a premium look (shadows, rounded corners, gradients, responsive grids).
    6. **Icons**: Use Font Awesome (via CDN).
    
    **IMAGE GENERATION INSTRUCTIONS (IMPORTANT)**:
    - Do NOT use broken placeholder images.
    - You MUST use the following URL format to "generate" images relevant to the business:
      \`https://image.pollinations.ai/prompt/{description}?nologo=true\`
    - Example: For a dentist, use \`https://image.pollinations.ai/prompt/dentist%20clinic%20modern?nologo=true\`.
    - Example: For a hero background, use \`https://image.pollinations.ai/prompt/abstract%20${designStyle.replace(' ', '%20')}%20background?nologo=true\`.
    - Ensure every image tag has a valid src using this method.
    
    **OUTPUT**:
    - Return ONLY the raw HTML code (starting with <!DOCTYPE html>).
    - Ensure the JavaScript for navigation is included in a <script> tag at the bottom.
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
    3. Keep the existing design consistency and the Single-File SPA navigation logic intact.
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
        systemInstruction = `You are a Senior UI/UX Design Auditor and Frontend Rendering Expert.

You will be provided with raw HTML code for a Single-File Multi-Page Website.

YOUR TASKS:

1. Accurately interpret and mentally render the layout of ALL pages (Home, About, Services, Contact) defined in the code.
2. Evaluate the design using the following criteria:
   - Visual hierarchy and reading order
   - Typography scale, clarity, and consistency
   - Color palette, contrast ratios, accessibility compliance
   - Spacing, padding, alignment, and whitespace distribution
   - Component consistency and design system adherence
   - Desktop vs. mobile responsiveness based on Tailwind utility classes
   - Conversion-focused UX patterns (CTAs, trust signals, layout logic)

3. Identify *specific*, *concrete* issues. Avoid generalities. Point to exact sections, classes, or patterns that cause problems.

4. Provide actionable improvements:
   - What to change
   - Why it matters
   - How it affects UX or conversion
   - Optional Tailwind class adjustments

5. Assign three scores (0–100):
   - visual_design_score
   - usability_score
   - conversion_score

6. Return a single clean JSON object in the following structure:

{
  "visual_design_score": number,
  "usability_score": number,
  "conversion_score": number,
  "strengths": [ ... ],
  "issues": [ ... ],
  "recommendations": [ ... ],
  "mobile_responsiveness_notes": [ ... ],
  "accessibility_issues": [ ... ]
}

Do not return Markdown. Output only valid JSON.`;
    
    contents = [
        { text: `Analyze this website code for ${url}. 
        
        CODE START:
        ${htmlCode.slice(0, 50000)} // Ensure we send enough code
        CODE END.

        Return a JSON object with:
        - design_score (0-10) (Mapped from visual_design_score)
        - conversion_score (0-10)
        - critique (array of objects: { point: string, box_2d: [ymin, xmin, ymax, xmax], related_code_snippet: string })
          * box_2d should be the bounding box of the issue on a 0-100 scale. If general, use [0,0,0,0].
          * related_code_snippet should be the EXACT unique code substring (e.g., "<div class='...'>") from the provided code that relates to this issue. If not applicable, use empty string.
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
    const text = extractJson(response.text || "{}");
    const parsed = JSON.parse(text);
    
    // Normalize scores if they came back as 0-100 from the code prompt
    if (parsed.visual_design_score && !parsed.design_score) {
        parsed.design_score = Math.round(parsed.visual_design_score / 10);
    }
    
    // Validate structure basics
    if (!parsed.critique) parsed.critique = [];
    if (!parsed.improvements) parsed.improvements = [];
    if (parsed.recommendations && parsed.improvements.length === 0) parsed.improvements = parsed.recommendations.slice(0,3);

    // --- SANITIZATION START ---
    // Fix for React Error #31: Ensure improvements is an array of strings, not objects
    if (Array.isArray(parsed.improvements)) {
        parsed.improvements = parsed.improvements.map((item: any) => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object') {
                return item.point || item.improvement || item.text || JSON.stringify(item);
            }
            return String(item);
        });
    }

    // Ensure critique points are valid
    if (Array.isArray(parsed.critique)) {
        parsed.critique = parsed.critique.map((item: any) => {
            if (typeof item === 'string') {
                return { point: item, box_2d: [0,0,0,0], related_code_snippet: "" };
            }
            if (typeof item === 'object') {
                // Ensure point is a string
                if (typeof item.point !== 'string') {
                    item.point = item.issue || item.description || JSON.stringify(item);
                }
                return item;
            }
            return { point: "Unidentified Issue", box_2d: [0,0,0,0] };
        });
    }

    // Map specific issues from 'issues' array if 'critique' is empty
    if (parsed.issues && parsed.critique.length === 0 && Array.isArray(parsed.issues)) {
        parsed.critique = parsed.issues.map((issue: any) => {
            const point = typeof issue === 'string' ? issue : (issue.issue || issue.description || JSON.stringify(issue));
            return { point: point, box_2d: [0,0,0,0], related_code_snippet: "" };
        });
    }
    // --- SANITIZATION END ---
    
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

export const generateOutreachMaterials = async (
    business: Business, 
    websiteUrl: string,
    options: { includeCalendar?: boolean } = {}
): Promise<OutreachPackage> => {
  const ai = getAiClient();

  const calendarInstruction = options.includeCalendar 
    ? "Include a placeholder [CALENDAR_LINK] for booking a follow-up call in both the Email and WhatsApp message." 
    : "";

  const prompt = `You are a top-tier sales copywriter.
  Write a complete outreach campaign for ${business.name}.
  We just built them a mockup website at: ${websiteUrl}
  Details: ${JSON.stringify(business.enriched_data || {})}
  
  ${calendarInstruction}
  
  Generate a JSON object with these EXACT keys:
  - cold_email: { subject: string, body: string } (The initial outreach)
  - whatsapp: string (The initial short message)
  - call_script: string (The initial cold call script)
  - follow_ups: Array of 2 objects: [{ subject: string, body: string, delay: string }] 
    * 1st follow up (value proposition reminder)
    * 2nd follow up (final break-up email)
  - objections: Array of 3 objects: [{ objection: string, response: string }]
    * Common sales objections for web design services (e.g. "Too expensive", "We have a facebook page", "Not interested") and how to counter them using the new website as leverage.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  try {
    const text = extractJson(response.text || "{}");
    const data = JSON.parse(text);

    // Sanitization
    if (data.whatsapp && typeof data.whatsapp === 'object') {
        data.whatsapp = (data.whatsapp as any).message || (data.whatsapp as any).text || JSON.stringify(data.whatsapp);
    }
    if (data.call_script && typeof data.call_script === 'object') {
        data.call_script = (data.call_script as any).message || (data.call_script as any).text || JSON.stringify(data.call_script);
    }

    if (!data.follow_ups) data.follow_ups = [];
    if (!data.objections) data.objections = [];

    return data;
  } catch (e) {
    console.error("Outreach generation failed", e);
    return {
        cold_email: { subject: "Error", body: "Could not generate." },
        whatsapp: "Error generating content.",
        call_script: "Error generating content.",
        follow_ups: [],
        objections: []
    };
  }
};

export const refineOutreach = async (
    currentContent: any, 
    feedback: string, 
    context: string
): Promise<any> => {
    const ai = getAiClient();
    
    const prompt = `Refine the following text/content based on this feedback: "${feedback}".
    
    Context: ${context}
    Current Content:
    ${typeof currentContent === 'string' ? currentContent : JSON.stringify(currentContent)}
    
    Return ONLY the updated content in the same format (String or JSON).
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt
    });

    try {
        const text = extractJson(response.text || "{}");
        // If the original was a string, tries to return string. If JSON, returns JSON.
        // Simple check:
        if (text.startsWith('{') || text.startsWith('[')) {
            return JSON.parse(text);
        }
        return response.text?.trim();
    } catch(e) {
        return response.text?.trim() || currentContent;
    }
}
