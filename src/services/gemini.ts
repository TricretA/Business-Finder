
import { GoogleGenAI } from "@google/genai";
import { Business, OutreachPackage, WebsiteReview } from "../types";

const getAiClient = () => {
  // Vite's define config injects process.env.VITE_GOOGLE_API_KEY at build time
  const apiKey = process.env.VITE_GOOGLE_API_KEY || process.env.API_KEY || '';
  if (!apiKey) {
    console.warn('VITE_GOOGLE_API_KEY is not set. Gemini AI calls will fail.');
  }
  return new GoogleGenAI({ apiKey });
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
  
  try {
    console.log("🔍 Fetching regions for country:", country);
    
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
    if (!apiKey) {
      console.error("❌ VITE_GOOGLE_API_KEY is not set!");
      return [];
    }
    console.log("✓ API Key present (length:", apiKey.length, ")");
    
    const prompt = `List the top 15 administrative regions, states, or counties in ${country}. 
    Return ONLY a raw JSON array of strings. 
    Example: ["California", "Texas", "New York"]
    DO NOT return objects.`;

    console.log("📤 Sending request to Gemini API...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    console.log("✓ Got response from API");
    console.log("Response object keys:", Object.keys(response));
    console.log("Response.text:", response.text);
    
    const responseText = response.text;
    
    if (!responseText) {
      console.error("❌ No text in response. Full response:", response);
      return [];
    }
    
    const text = cleanJson(responseText);
    console.log("📝 Cleaned text:", text);
    
    if (!text || text === '[]') {
      console.warn("⚠️ Empty response");
      return [];
    }
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.error("❌ JSON parse error:", parseErr);
      console.error("Failed to parse:", text);
      return [];
    }

    // Ensure we have an array
    if (!Array.isArray(parsed)) {
      console.error("❌ Response is not an array:", parsed);
      return [];
    }
    
    const result = parsed.map((item: any) => {
        if (typeof item === 'string') return item;
        return item.name || item.region || item.state || item.message || JSON.stringify(item);
    });
    
    console.log("✅ Successfully fetched", result.length, "regions:", result);
    return result;
    
  } catch (e) {
    console.error("❌ Error fetching regions:", e);
    console.error("Error message:", (e as any)?.message);
    console.error("Error code:", (e as any)?.code);
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

  const prompt = `You are generating a full professional multi-page business website. Output a structured, detailed website blueprint that can be pasted into an AI Website Builder.

**IMPORTANT RULES**

* Create a **full multi-page website**, not a single-page landing site.
* Include **5 to 10 pages** depending on the business type.
* Design must look **modern, clean, premium, and conversion-focused**.
* The structure must include: navigation menu, internal links, mobile responsiveness notes, and UI/UX suggestions.
* Generate realistic, business-specific content — no placeholders except where necessary.

---

## **1. BRANDING**

Provide:

* Primary, secondary, and accent colors
* Typography pairings
* Logo description
* Brand vibe and tone (premium, minimal, friendly, professional, techy, etc.)
* Image style and visual direction

---

## **2. PAGE LIST**

Create a structured list of all pages, usually including:

* Home
* About
* Services (or product line)
* Service Sub-pages (if relevant)
* Testimonials / Case Studies
* Gallery / Portfolio
* Pricing
* Contact
* FAQ
* Blog / Resources (optional)

Include anchor link names and hierarchy.

---

## **3. PAGE-BY-PAGE CONTENT**

For each page, generate:

### **Page Structure**

* Section-by-section layout
* Headlines
* Sub-headlines
* Paragraph text
* CTAs
* Image descriptions
* Icons or graphics suggestions

### **SEO Optimized**

* Meta title
* Meta description
* Keywords
* Suggested URL slug

### **Modern UI/UX Requirements**

* Full-width hero images
* Smooth animations
* Card layouts
* Clean grids
* Mobile-first spacing
* High readability

---

## **4. TESTIMONIALS**

Generate **3–5 realistic client testimonials** with:

* Full name
* Business or title
* Short message

---

## **5. CONTACT & FOOTER**

Provide:

* Address
* Email
* Phone
* Map embed suggestion
* Operating hours
* Social links
* Copyright details

---

## **6. ADVANCED FEATURES (Optional based on business type)**

Add relevant enhancements such as:

* Booking system
* Live chat
* E-commerce product listing
* Appointment forms
* Blog article templates
* Photo gallery
* Interactive map
* FAQ accordion

---

**BUSINESS CONTEXT**

Name: ${business.name}
Address: ${business.address}
Category: ${business.description}

**RESEARCHED DATA TO INCORPORATE**

${extraContext}

---

## **OUTPUT FORMAT**

Deliver everything in a clean, well-organized Markdown structure with sections for Branding, Pages, Page Content (by page), Testimonials, and Footer.`;

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
    systemInstruction = `You are a Senior UI/UX Design Auditor and Frontend Rendering Expert.

You will be provided with raw HTML, JSX, or TailwindCSS-based code for a webpage.

YOUR TASKS:

1. Accurately interpret and mentally render the layout, visual structure, spacing, typography, colors, and components as they would appear in a browser.

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
        - visual_design_score (0-100)
        - usability_score (0-100)
        - conversion_score (0-100)
        - strengths (array of strings)
        - issues (array of strings)
        - recommendations (array of strings)
        - mobile_responsiveness_notes (array of strings)
        - accessibility_issues (array of strings)` }
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
      - visual_design_score (0-100)
      - usability_score (0-100)
      - conversion_score (0-100)
      - strengths (array of strings)
      - issues (array of strings)
      - recommendations (array of strings)
      - mobile_responsiveness_notes (array of strings)
      - accessibility_issues (array of strings)` }
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
    
    // Validate structure - ensure all required fields exist
    return {
      visual_design_score: parsed.visual_design_score || 0,
      usability_score: parsed.usability_score || 0,
      conversion_score: parsed.conversion_score || 0,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      mobile_responsiveness_notes: Array.isArray(parsed.mobile_responsiveness_notes) ? parsed.mobile_responsiveness_notes : [],
      accessibility_issues: Array.isArray(parsed.accessibility_issues) ? parsed.accessibility_issues : []
    };
  } catch (e) {
    console.error("Review parsing failed:", e);
    // Return a fallback object so the UI doesn't crash
    return {
        visual_design_score: 5,
        usability_score: 5,
        conversion_score: 5,
        strengths: [],
        issues: ["AI Review Service encountered a parsing error. Manual review recommended."],
        recommendations: ["Check manual alignment", "Verify mobile responsiveness"],
        mobile_responsiveness_notes: [],
        accessibility_issues: []
    };
  }
};

// --- OUTREACH SERVICES ---

export const generateOutreachMaterials = async (business: Business, websiteUrl: string): Promise<OutreachPackage> => {
  const ai = getAiClient();

const prompt = `
You are an elite conversion-focused sales copywriter hired to craft a high-impact outreach package.

TARGET BUSINESS:
${business.name}

WEBSITE DEMO WE BUILT FOR THEM:
${websiteUrl}

BUSINESS DATA (Use intelligently, don't dump):
${JSON.stringify(business.enriched_data || {})}

YOUR JOB:
1. Analyze the business and identify the strongest pain points and growth opportunities.
2. Use those insights to write persuasive outreach that feels personal and relevant.
3. Everything should push the client toward viewing the mockup and booking a call.

OUTPUT STRICTLY AS JSON with these EXACT keys:

{
  "cold_email": {
    "subject": "string",
    "body": "string (short, punchy, and human — avoid sounding like AI)"
  },
  "whatsapp": "string (1–2 short messages, conversational, built for quick reading)",
  "call_script": "string (a confident but friendly script guiding a sales call)"
}

RULES:
- No unnecessary fluff.
- No generic language.
- Make them feel like we understand their business better than they do.
- Focus on ROI, revenue growth, and the value of a professional online presence.
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
