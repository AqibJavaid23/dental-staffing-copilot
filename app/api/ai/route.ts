import { NextRequest, NextResponse } from "next/server";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash"; // current fast model

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Gemini request failed");
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");
  return text.trim();
}

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { mode, text } = await req.json();
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    if (mode === "clean") {
      // Clean up broken English into clear, professional English — preserve meaning
      const prompt = `You are helping an employee write a weekly work plan. Rewrite the following text in clear, professional English. Fix grammar and spelling. Keep the exact same meaning and all the specific details — do NOT add tasks or invent work that isn't mentioned. Keep it natural and concise. Return ONLY the rewritten text, nothing else.\n\nText:\n"""${text}"""`;
      const result = await callGemini(prompt);
      return NextResponse.json({ result });
    }
    if (mode === "assistant") {
      const systemContext = `You are the helpful AI assistant inside "Dental Staffing Co-Pilot", a recruiting platform for dental staffing. You help the user (a recruiter) in two ways:

1. APP GUIDANCE — explain how to do things in the app. The app has these areas:
- Provider Database: browse dentists & hygienists, filter by location, send to pipelines
- Candidate Queue: researched candidates with confidence & social profiles
- My Data: upload your own lists
- Provider Lookup: find a provider by NPI, name, or city
- Pipelines: manage recruiting pipelines (talent or hiring type); enrich rows via NPPES/Google Maps; Find Person (LinkedIn); Find Contacts (company emails); Export CSV; +Pool button on hiring rows
- Job Postings: find hiring practices on LinkedIn/Indeed
- Talent Pools: match talent to hiring practices
- Reports & Tasks: members write weekly plans, submit to a manager who builds a checklist with priorities & deadlines; Kanban board; My Week overview
- Groups: departments with a manager + members, shown as a tree

2. RECRUITING RESEARCH HELP — when enrichment fails or info is missing, reason over what the user gives you (name, license, city, etc.) and suggest what to search for, where to look, and what can be inferred. IMPORTANT: you do NOT have live web access, so never invent specific facts (phone numbers, emails, addresses) about a real person. If you don't know, say so and suggest how to find it.

Be concise, friendly, and practical. Give step-by-step help when explaining app features.`;

      const prompt = `${systemContext}\n\nUser: ${text}\n\nAssistant:`;
      const result = await callGemini(prompt);
      return NextResponse.json({ result });
    }

    if (mode === "tasks") {
      // Turn a plan paragraph into a list of concrete task items
      const prompt = `You are helping a manager turn an employee's weekly plan into a checklist of concrete tasks. Read the plan below and break it into clear, actionable task items. Each task should be a short action (a few words to one sentence). Do NOT invent work that isn't implied by the plan. Do NOT add deadlines or priorities.\n\nReturn ONLY a JSON array of strings, nothing else. Example format: ["Task one","Task two","Task three"]\n\nPlan:\n"""${text}"""`;
      const raw = await callGemini(prompt);
      // Try to parse the JSON array (strip any code fences)
      const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      let tasks: string[] = [];
      try {
        tasks = JSON.parse(cleaned);
      } catch {
        // Fallback: split by lines if it didn't return clean JSON
        tasks = cleaned.split("\n").map((l) => l.replace(/^[-*\d.]+\s*/, "").trim()).filter(Boolean);
      }
      return NextResponse.json({ tasks });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (e) {
    console.error("AI route error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 500 });
  }
}