import { supabase } from "./supabase";

const APIFY_TOKEN = process.env.NEXT_PUBLIC_APIFY_TOKEN!;
const GOOGLE_MAPS_ACTOR = process.env.NEXT_PUBLIC_APIFY_GOOGLE_MAPS_ACTOR || "compass~crawler-google-places";
const CONTACT_ACTOR = process.env.NEXT_PUBLIC_APIFY_CONTACT_ACTOR || "vdrmota~contact-info-scraper";
const LINKEDIN_ACTOR = process.env.NEXT_PUBLIC_APIFY_LINKEDIN_ACTOR || "harvestapi~linkedin-profile-search-by-name";

export type EnrichmentRecord = {
  license_number: string;
  status: "pending" | "enriched" | "partial" | "no_match" | "error";
  confidence: "high" | "medium" | "low" | null;
  matched_title: string | null;
  matched_categories: string[] | null;
  street: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  total_score: number | null;
  reviews_count: number | null;
  emails: string[] | null;
  extra_phones: string[] | null;
  linkedins: string[] | null;
  facebooks: string[] | null;
  instagrams: string[] | null;
  twitters: string[] | null;
  youtubes: string[] | null;
  tiktoks: string[] | null;
  search_query: string | null;
  error_message: string | null;
  enriched_at: string;
  npi_number: string | null;
  npi_name: string | null;
  npi_specialty: string | null;
  npi_address: string | null;
  npi_phone: string | null;
  npi_status: string | null;
  person_linkedin_url?: string | null;
  person_email?: string | null;
  person_headline?: string | null;
  person_confidence?: string | null;
  person_candidates?: unknown;
  linkedin_sent?: boolean | null;
  email_sent?: boolean | null;
  person_email_found?: boolean | null;
  person_email_company?: string | null;
};

type Row = Record<string, string>;

export type ProgressCallback = (stage: string) => void;

// ---------- Input quality check ----------
export function checkRowInputQuality(row: Row): { ok: boolean; reason?: string; hasWeakInput?: boolean; missing: string[] } {
  const first = (row["First Name"] || "").trim();
  const last = (row["Last Name"] || "").trim();
  const business = (row["Business Name"] || "").trim();
  const city = (row["City"] || "").trim();

  const missing: string[] = [];
  if (!first && !last) missing.push("name");
  if (!business) missing.push("business name");
  if (!city) missing.push("city");

  if (!first && !last && !business) {
    return { ok: false, reason: "No name or business to search for.", missing };
  }
  const hasWeakInput = !business && !city;
  return { ok: true, hasWeakInput, missing };
}

// ---------- Apify helper ----------
async function runActor<T>(actorId: string, input: Record<string, unknown>): Promise<T[]> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Actor ${actorId} failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return (await res.json()) as T[];
}

// ---------- Confidence scoring ----------
function scoreConfidence(row: Row, place: Record<string, unknown>): "high" | "medium" | "low" {
  const rowCity = (row["City"] || "").toLowerCase().trim();
  const rowState = (row["State"] || "").toLowerCase().trim();
  const rowFirst = (row["First Name"] || "").toLowerCase().trim();
  const rowLast = (row["Last Name"] || "").toLowerCase().trim();
  const rowBusiness = (row["Business Name"] || "").toLowerCase().trim();

  const placeCity = String(place.city || "").toLowerCase().trim();
  const placeState = String(place.state || "").toLowerCase().trim();
  const placeTitle = String(place.title || "").toLowerCase();

  let score = 0;
  if (rowCity && placeCity && rowCity === placeCity) score += 2;
  if (rowState && placeState && rowState === placeState) score += 1;
  if (rowLast && placeTitle.includes(rowLast)) score += 2;
  if (rowFirst && placeTitle.includes(rowFirst)) score += 1;
  if (rowBusiness && placeTitle.includes(rowBusiness)) score += 3;

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

// ---------- Query building (with Arizona fallback) ----------
export function buildSearchQuery(row: Row, mode: "business" | "person" = "business"): string {
  const business = (row["Business Name"] || "").trim();
  const first = (row["First Name"] || "").trim();
  const last = (row["Last Name"] || "").trim();
  const city = (row["City"] || "").trim();
  const state = (row["State"] || "").trim();

  const location = city || state || "Arizona";
  const locationState = city && state ? state : "";

  if (mode === "business" && business) {
    return [business, location, locationState].filter(Boolean).join(" ");
  }
  return [first, last, "dentist", location, locationState].filter(Boolean).join(" ");
}

type GooglePlaceResult = {
  title?: string;
  totalScore?: number;
  reviewsCount?: number;
  street?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  phone?: string;
  website?: string;
  categories?: string[];
  categoryName?: string;
  url?: string;
};

type ContactResult = {
  domain?: string;
  emails?: string[];
  phones?: string[];
  linkedIns?: string[];
  twitters?: string[];
  instagrams?: string[];
  facebooks?: string[];
  youtubes?: string[];
  tiktoks?: string[];
};

// ---------- Save a failure so rows leave 'pending' state ----------
async function saveFailure(licenseNumber: string, searchQuery: string, reason: string, status: "no_match" | "error" = "no_match") {
  const record = {
    license_number: licenseNumber,
    status,
    confidence: null,
    search_query: searchQuery,
    error_message: reason,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("enrichments").upsert(record, { onConflict: "license_number" });
  return record;
}

// ---------- Google Maps enrichment ----------
export async function enrichRow(row: Row, options?: { forceRefresh?: boolean; onProgress?: ProgressCallback }): Promise<EnrichmentRecord> {
  const licenseNumber = row["License Number"] || "";
  if (!licenseNumber) throw new Error("Row is missing License Number");
  const progress = options?.onProgress || (() => {});

  const quality = checkRowInputQuality(row);
  if (!quality.ok) {
    progress("Not enough info to search");
    const rec = await saveFailure(licenseNumber, "", quality.reason || "Insufficient input", "error");
    return rec as unknown as EnrichmentRecord;
  }

  if (!options?.forceRefresh) {
    const { data: cached } = await supabase
      .from("enrichments")
      .select("*")
      .eq("license_number", licenseNumber)
      .maybeSingle();
    // Only reuse cache if a real G-Maps result exists (matched_title present)
    if (cached && cached.matched_title && cached.status !== "error" && cached.status !== "pending") {
      progress("Using cached result");
      return cached as EnrichmentRecord;
    }
  }

  const business = (row["Business Name"] || "").trim();
  const queries: string[] = [];
  if (business) queries.push(buildSearchQuery(row, "business"));
  queries.push(buildSearchQuery(row, "person"));

  let bestPlace: GooglePlaceResult | null = null;
  let bestQuery = "";
  let bestConfidence: "high" | "medium" | "low" = "low";
  let raw1: GooglePlaceResult[] = [];
  let lastError = "";

  const rank = { low: 0, medium: 1, high: 2 } as const;

  for (const q of queries) {
    try {
      progress(`Searching Google Maps: "${q}"`);
      const results = await runActor<GooglePlaceResult>(GOOGLE_MAPS_ACTOR, {
        searchStringsArray: [q],
        maxCrawledPlacesPerSearch: 5,
      });
      raw1 = results;
      if (!results || results.length === 0) continue;

      let bestScore: "high" | "medium" | "low" = "low";
      let bestForQuery: GooglePlaceResult | null = null;
      for (const p of results) {
        const c = scoreConfidence(row, p as unknown as Record<string, unknown>);
        if (!bestForQuery || rank[c] > rank[bestScore]) {
          bestScore = c;
          bestForQuery = p;
          if (c === "high") break;
        }
      }

      if (bestForQuery && (bestConfidence === "low" || bestScore === "high" || (bestScore === "medium" && bestConfidence !== "high"))) {
        bestPlace = bestForQuery;
        bestQuery = q;
        bestConfidence = bestScore;
        if (bestScore === "high") break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "unknown error";
      console.error(`Search failed for query "${q}":`, e);
    }
  }

  if (!bestPlace) {
    progress("No match found");
    const reason = lastError ? `Google Maps error: ${lastError}` : "No matching places returned by Google Maps.";
    const rec = await saveFailure(licenseNumber, queries[0] || "", reason, lastError ? "error" : "no_match");
    return rec as unknown as EnrichmentRecord;
  }

  let contactData: ContactResult | null = null;
  let raw2: ContactResult[] = [];
  if (bestPlace.website) {
    try {
      progress(`Reading website: ${bestPlace.website}`);
      const results = await runActor<ContactResult>(CONTACT_ACTOR, {
        startUrls: [{ url: bestPlace.website }],
        maxDepth: 2,
      });
      raw2 = results;
      contactData = results?.[0] || null;
    } catch (e) {
      console.error("Contact scraper failed:", e);
      progress("Website scrape failed, saving partial data");
    }
  } else {
    progress("No website found — saving what we have");
  }

  const hasContactInfo = contactData && ((contactData.emails?.length ?? 0) > 0 || (contactData.phones?.length ?? 0) > 0);
  const status: EnrichmentRecord["status"] = hasContactInfo ? "enriched" : "partial";

  progress("Saving results");

  const record = {
    license_number: licenseNumber,
    status,
    confidence: bestConfidence,
    matched_title: bestPlace.title || null,
    matched_categories: bestPlace.categories || (bestPlace.categoryName ? [bestPlace.categoryName] : null),
    street: bestPlace.street || null,
    city: bestPlace.city || null,
    state: bestPlace.state || null,
    country_code: bestPlace.countryCode || null,
    phone: bestPlace.phone || null,
    website: bestPlace.website || null,
    google_maps_url: bestPlace.url || null,
    total_score: bestPlace.totalScore ?? null,
    reviews_count: bestPlace.reviewsCount ?? null,
    emails: contactData?.emails || null,
    extra_phones: contactData?.phones || null,
    linkedins: contactData?.linkedIns || null,
    facebooks: contactData?.facebooks || null,
    instagrams: contactData?.instagrams || null,
    twitters: contactData?.twitters || null,
    youtubes: contactData?.youtubes || null,
    tiktoks: contactData?.tiktoks || null,
    search_query: bestQuery,
    error_message: null,
    raw_actor1: raw1,
    raw_actor2: raw2,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("enrichments")
    .upsert(record, { onConflict: "license_number" })
    .select()
    .single();
  if (error) throw error;
  return saved as EnrichmentRecord;
}

// ---------- Smart Search rescue ----------
export async function smartSearchRescue(row: Row, options?: { onProgress?: ProgressCallback }): Promise<EnrichmentRecord> {
  const licenseNumber = row["License Number"] || "";
  if (!licenseNumber) throw new Error("Row is missing License Number");
  const progress = options?.onProgress || (() => {});

  const business = (row["Business Name"] || "").trim();
  const first = (row["First Name"] || "").trim();
  const last = (row["Last Name"] || "").trim();
  const city = (row["City"] || "").trim();
  const state = (row["State"] || "").trim();
  const location = city || state || "Arizona";
  const locationState = city && state ? state : "";
  const query = business
    ? `${business} ${location} ${locationState} website`.trim()
    : `${first} ${last} dentist ${location} ${locationState} website`.trim();

  progress(`Google searching: "${query}"`);
  let websites: string[] = [];
  try {
    const results = await runActor<{ organicResults?: { url?: string }[] }>(
      "apify~google-search-scraper",
      { queries: query, maxPagesPerQuery: 1, resultsPerPage: 5 }
    );
    const firstResult = results?.[0];
    websites = (firstResult?.organicResults || [])
      .map((r) => r.url || "")
      .filter((u) => u && !u.includes("google.com") && !u.includes("facebook.com") && !u.includes("yelp.com"));
  } catch (e) {
    const msg = "Google Search failed: " + (e instanceof Error ? e.message : "unknown");
    await saveFailure(licenseNumber, query, msg, "error");
    throw new Error(msg);
  }

  if (websites.length === 0) {
    const msg = "Google Search returned no usable websites.";
    await saveFailure(licenseNumber, query, msg, "no_match");
    throw new Error(msg);
  }

  const targetWebsite = websites[0];
  progress(`Reading website: ${targetWebsite}`);

  const results = await runActor<ContactResult>(CONTACT_ACTOR, {
    startUrls: [{ url: targetWebsite }],
    maxDepth: 2,
  });
  const contactData = results?.[0] || null;

  const { data: existing } = await supabase
    .from("enrichments")
    .select("*")
    .eq("license_number", licenseNumber)
    .maybeSingle();

  const hasContactInfo = contactData && ((contactData.emails?.length ?? 0) > 0 || (contactData.phones?.length ?? 0) > 0);
  progress("Saving results");

  const record = {
    ...(existing || { license_number: licenseNumber }),
    website: existing?.website || targetWebsite,
    emails: contactData?.emails || existing?.emails || null,
    extra_phones: contactData?.phones || existing?.extra_phones || null,
    linkedins: contactData?.linkedIns || existing?.linkedins || null,
    facebooks: contactData?.facebooks || existing?.facebooks || null,
    instagrams: contactData?.instagrams || existing?.instagrams || null,
    twitters: contactData?.twitters || existing?.twitters || null,
    youtubes: contactData?.youtubes || existing?.youtubes || null,
    tiktoks: contactData?.tiktoks || existing?.tiktoks || null,
    status: hasContactInfo ? "enriched" : (existing?.status || "partial"),
    error_message: null,
    raw_actor2: results,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("enrichments")
    .upsert(record, { onConflict: "license_number" })
    .select()
    .single();
  if (error) throw error;
  return saved as EnrichmentRecord;
}

// ---------- NPPES NPI Registry enrichment (free, official) ----------
type NpiResult = {
  number: string;
  basic?: { first_name?: string; last_name?: string; credential?: string };
  addresses?: {
    address_purpose?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    telephone_number?: string;
  }[];
  taxonomies?: { desc?: string; primary?: boolean; license?: string; state?: string }[];
  identifiers?: { identifier?: string; state?: string; desc?: string }[];
};

export async function enrichRowNppes(row: Row, options?: { onProgress?: ProgressCallback }): Promise<EnrichmentRecord> {
  const licenseNumber = row["License Number"] || "";
  if (!licenseNumber) throw new Error("Row is missing License Number");
  const progress = options?.onProgress || (() => {});

  const first = (row["First Name"] || "").trim();
  const last = (row["Last Name"] || "").trim();
  const state = (row["State"] || "").trim() || "AZ";
  const stateCode = state.toLowerCase().startsWith("ariz") ? "AZ" : state;

  if (!first || !last) {
    const { data: rec } = await supabase.from("enrichments").upsert({
      license_number: licenseNumber,
      npi_status: "error",
      error_message: "NPPES lookup needs first and last name.",
      updated_at: new Date().toISOString(),
    }, { onConflict: "license_number" }).select().single();
    return rec as EnrichmentRecord;
  }

  progress(`Searching NPPES registry for ${first} ${last} (${stateCode})...`);

  const url = `/api/nppes?first=${encodeURIComponent(first)}&last=${encodeURIComponent(last)}&state=${encodeURIComponent(stateCode)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NPPES lookup failed (${res.status})`);
  const data = (await res.json()) as { result_count?: number; results?: NpiResult[] };
  const results = data.results || [];

  const licNorm = licenseNumber.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  let best: NpiResult | null = null;
  let matchLevel: "license" | "dental" | "first" | null = null;

  for (const r of results) {
    const ids = [
      ...(r.identifiers || []).map((i) => (i.identifier || "")),
      ...(r.taxonomies || []).map((t) => (t.license || "")),
    ].map((s) => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase());
    if (ids.some((i) => i && (i === licNorm || i.endsWith(licNorm) || licNorm.endsWith(i)))) {
      best = r; matchLevel = "license"; break;
    }
  }
  if (!best) {
    for (const r of results) {
      const isDental = (r.taxonomies || []).some((t) => (t.desc || "").toLowerCase().includes("dent"));
      if (isDental) { best = r; matchLevel = "dental"; break; }
    }
  }
  if (!best && results.length > 0) { best = results[0]; matchLevel = "first"; }

  if (!best) {
    progress("No NPPES match found");
    const { data: rec } = await supabase.from("enrichments").upsert({
      license_number: licenseNumber,
      npi_status: "no_match",
      raw_npi: data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "license_number" }).select().single();
    return rec as EnrichmentRecord;
  }

  progress("Match found — saving");

  const loc = (best.addresses || []).find((a) => a.address_purpose === "LOCATION") || (best.addresses || [])[0];
  const address = loc
    ? [loc.address_1, loc.address_2, loc.city, loc.state, loc.postal_code].filter(Boolean).join(", ")
    : null;
  const primaryTax = (best.taxonomies || []).find((t) => t.primary) || (best.taxonomies || [])[0];
  const npiStatus = matchLevel === "license" ? "verified" : matchLevel === "dental" ? "probable" : "unverified";

  const record = {
    license_number: licenseNumber,
    npi_number: best.number || null,
    npi_name: [best.basic?.first_name, best.basic?.last_name].filter(Boolean).join(" ") + (best.basic?.credential ? `, ${best.basic.credential}` : ""),
    npi_specialty: primaryTax?.desc || null,
    npi_address: address,
    npi_phone: loc?.telephone_number || null,
    npi_status: npiStatus,
    raw_npi: data,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("enrichments")
    .upsert(record, { onConflict: "license_number" })
    .select()
    .single();
  if (error) throw error;
  return saved as EnrichmentRecord;
}// ---------- Find Person (LinkedIn + email via HarvestAPI) ----------
export type PersonCandidate = {
  linkedinUrl: string;
  name: string;
  headline: string;
  location: string;
  email: string | null;
  emailQuality: number | null;
  confidence: "high" | "medium" | "low";
  score: number;
};

type HarvestProfile = {
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  emails?: { email?: string; qualityScore?: number; status?: string }[] | null;
  location?: { linkedinText?: string } | null;
};

const DENTAL_KEYWORDS = ["dentist", "dental", "dds", "dmd", "hygienist", "rdh", "orthodont", "endodont", "periodont", "prosthodont", "oral surgeon", "dentistry"];

function scorePersonCandidate(row: Row, p: HarvestProfile): { confidence: "high" | "medium" | "low"; score: number } {
  const rowCity = (row["City"] || "").toLowerCase().trim();
  const rowState = (row["State"] || "").toLowerCase().trim();
  const headline = (p.headline || "").toLowerCase();
  const loc = (p.location?.linkedinText || "").toLowerCase();

  let score = 0;
  if (rowCity && loc.includes(rowCity)) score += 3;
  if (rowState && (loc.includes(rowState) || loc.includes("arizona"))) score += 1;
  if (DENTAL_KEYWORDS.some((k) => headline.includes(k))) score += 4;
  if (p.emails && p.emails.length > 0 && p.emails[0].email) score += 1;

  let confidence: "high" | "medium" | "low" = "low";
  if (score >= 6) confidence = "high";
  else if (score >= 3) confidence = "medium";
  return { confidence, score };
}

export async function findPerson(row: Row, options?: { onProgress?: ProgressCallback }): Promise<PersonCandidate[]> {
  const first = (row["First Name"] || "").trim();
  const last = (row["Last Name"] || "").trim();
  const city = (row["City"] || "").trim();
  const state = (row["State"] || "").trim();
  const progress = options?.onProgress || (() => {});

  if (!first || !last) throw new Error("Need first and last name to search LinkedIn.");

  // Detect role from the row (dentist vs hygienist) — check License Type, then other hints
  const licenseType = (row["License Type"] || "").toLowerCase();
  const businessName = (row["Business Name"] || row["Office Name"] || "").toLowerCase();
  let roleWord = "dentist";
  if (licenseType.includes("hygien") || businessName.includes("hygien")) {
    roleWord = "dental hygienist";
  }

  // Name-first query so the person's name is the primary match signal.
  // City helps disambiguate; role word is a light hint at the end.
  const query = [`${first} ${last}`, city, roleWord].filter(Boolean).join(" ");
  const location = [city, state || "Arizona"].filter(Boolean).join(", ");

  const input = {
    query,
    profileScraperMode: "Full + email search",
    maxItems: 20,
    locations: [location],
  };

  // LinkedIn actors are inconsistent (LinkedIn throttles them), so retry a few times
  let results: HarvestProfile[] = [];
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    progress(attempt === 1 ? `Searching LinkedIn for ${first} ${last}...` : `Searching LinkedIn... (attempt ${attempt})`);
    results = await runActor<HarvestProfile>(LINKEDIN_ACTOR, input);
    if (results && results.length > 0) break;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((res) => setTimeout(res, 2500));
    }
  }

  if (!results || results.length === 0) {
    progress("No LinkedIn profiles found (LinkedIn may be rate-limiting)");
    return [];
  }

  progress(`Found ${results.length} candidate${results.length === 1 ? "" : "s"} — ranking`);

  const candidates: PersonCandidate[] = results.map((p) => {
    const { confidence, score } = scorePersonCandidate(row, p);
    const emailObj = p.emails && p.emails.length > 0 ? p.emails[0] : null;
    return {
      linkedinUrl: p.linkedinUrl || "",
      name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown",
      headline: p.headline || "—",
      location: p.location?.linkedinText || "—",
      email: emailObj?.email || null,
      emailQuality: emailObj?.qualityScore ?? null,
      confidence,
      score,
    };
  }).filter((c) => c.linkedinUrl);

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
// ---------- Save the chosen person match ----------
export async function savePersonMatch(
  licenseNumber: string,
  chosen: PersonCandidate | null,
  allCandidates: PersonCandidate[]
): Promise<void> {
  const record = {
    license_number: licenseNumber,
    person_linkedin_url: chosen?.linkedinUrl || null,
    person_email: chosen?.email || null,
    person_headline: chosen?.headline || null,
    person_confidence: chosen?.confidence || null,
    person_candidates: allCandidates,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("enrichments").upsert(record, { onConflict: "license_number" });
  if (error) throw error;
}

// ---------- Toggle sent flags ----------
export async function setSentFlag(
  licenseNumber: string,
  field: "linkedin_sent" | "email_sent",
  value: boolean
): Promise<void> {
  const { error } = await supabase
    .from("enrichments")
    .upsert({ license_number: licenseNumber, [field]: value, updated_at: new Date().toISOString() }, { onConflict: "license_number" });
  if (error) throw error;
}
// ---------- Find email from a confirmed LinkedIn URL (vulnv/linkedin-email-finder) ----------
const EMAIL_FINDER_ACTOR = process.env.NEXT_PUBLIC_APIFY_EMAIL_ACTOR || "vulnv~linkedin-email-finder";

export type EmailResult = {
  found: boolean;
  email: string | null;
  name: string | null;
  company: string | null;
};

export async function findEmailByUrl(linkedinUrl: string, options?: { onProgress?: ProgressCallback }): Promise<EmailResult> {
  const progress = options?.onProgress || (() => {});
  const url = linkedinUrl.trim();
  if (!url || !url.includes("linkedin.com/in/")) {
    throw new Error("Please paste a valid LinkedIn profile URL (linkedin.com/in/...).");
  }

  progress("Looking up email from LinkedIn profile...");
  const results = await runActor<{ found?: boolean; email?: string; name?: string; company?: string }>(
    EMAIL_FINDER_ACTOR,
    { urls: [url] }
  );

  const r = results?.[0];
  if (!r || !r.found || !r.email) {
    return { found: false, email: null, name: r?.name || null, company: r?.company || null };
  }
  return { found: true, email: r.email, name: r.name || null, company: r.company || null };
}

// ---------- Save the manually-confirmed LinkedIn URL + email ----------
export async function savePersonUrlEmail(
  licenseNumber: string,
  linkedinUrl: string,
  email: EmailResult | null
): Promise<void> {
  const record = {
    license_number: licenseNumber,
    person_linkedin_url: linkedinUrl.trim() || null,
    person_email: email?.email || null,
    person_email_found: email ? email.found : null,
    person_email_company: email?.company || null,
    person_confidence: "high", // human-confirmed URL = high confidence
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("enrichments").upsert(record, { onConflict: "license_number" });
  if (error) throw error;
}
// ---------- Provider Lookup (free NPPES search) ----------
export type ProviderResult = {
  npi: string;
  name: string;
  credential: string;
  specialty: string;
  practice: string;
  city: string;
  state: string;
  phone: string;
  license: string;
  licenseState: string;
  status: string;
};

function mapNppesResult(r: NpiResult): ProviderResult {
  const loc = (r.addresses || []).find((a) => a.address_purpose === "LOCATION") || (r.addresses || [])[0];
  const practice = loc ? [loc.address_1, loc.address_2, loc.city, loc.state, loc.postal_code].filter(Boolean).join(", ") : "";
  const tax = (r.taxonomies || []).find((t) => t.primary) || (r.taxonomies || [])[0];
  const licObj = (r.taxonomies || []).find((t) => t.license);
  return {
    npi: r.number || "",
    name: [r.basic?.first_name, r.basic?.last_name].filter(Boolean).join(" ") + (r.basic?.credential ? `, ${r.basic.credential}` : ""),
    credential: r.basic?.credential || "",
    specialty: tax?.desc || "",
    practice,
    city: loc?.city || "",
    state: loc?.state || "",
    phone: loc?.telephone_number || "",
    license: licObj?.license || "",
    licenseState: licObj?.state || "",
    status: "",
  };
}

// Search NPPES by NPI number
export async function lookupByNpi(npi: string): Promise<ProviderResult[]> {
  const clean = npi.replace(/\D/g, "");
  if (clean.length !== 10) throw new Error("NPI must be a 10-digit number.");
  const res = await fetch(`/api/nppes?npi=${encodeURIComponent(clean)}`);
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const data = (await res.json()) as { results?: NpiResult[] };
  return (data.results || []).map(mapNppesResult);
}

// Search NPPES by name (+ optional state)
export async function lookupByName(first: string, last: string, state: string, city: string = ""): Promise<ProviderResult[]> {
  if (!first && !last && !city) throw new Error("Enter a name or city.");
  const params = new URLSearchParams();
  if (first) params.set("first", first);
  if (last) params.set("last", last);
  if (state) params.set("state", state);
  if (city) params.set("city", city);
  const res = await fetch(`/api/nppes?${params.toString()}`);
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const data = (await res.json()) as { results?: NpiResult[] };
  return (data.results || []).map(mapNppesResult);
}
// ---------- LinkedIn Job Postings (valig/linkedin-jobs-scraper) ----------
const JOBS_ACTOR = process.env.NEXT_PUBLIC_APIFY_JOBS_ACTOR || "valig~linkedin-jobs-scraper";
const INDEED_ACTOR = process.env.NEXT_PUBLIC_APIFY_INDEED_ACTOR || "borderline~indeed-scraper";

export type JobPosting = {
  id: string;
  title: string;
  company: string;
  companyUrl: string;
  location: string;
  postedTimeAgo: string;
  postedDate: string;
  contractType: string;
  experienceLevel: string;
  url: string;
  description: string;
};

export type JobFilters = {
  platform?: string;
  title: string;
  location: string;
  datePosted?: string;
  contractType?: string;
  experienceLevel?: string;
  remote?: string;
  fromDays?: string;
  limit?: number;
};

export async function searchJobs(filters: JobFilters, options?: { onProgress?: ProgressCallback }): Promise<JobPosting[]> {
  const progress = options?.onProgress || (() => {});
  if (!filters.title.trim()) throw new Error("Enter a job title (e.g. General Dentist).");

  const platform = filters.platform || "linkedin";
  progress(`Searching ${platform === "indeed" ? "Indeed" : "LinkedIn"} jobs: ${filters.title}...`);

  // ---- INDEED ----
  if (platform === "indeed") {
    const input: Record<string, unknown> = {
      query: filters.title.trim(),
      location: filters.location.trim() || "United States",
      country: "us",
      maxRows: filters.limit || 50,
      fromDays: filters.fromDays || "14",
      sort: "date",
      radius: "0",
      enableUniqueJobs: true,
    };
    const results = await runActor<Record<string, unknown>>(INDEED_ACTOR, input);
    return (results || []).map((j) => {
      const loc = (j.location || {}) as { city?: string; state?: string; postalCode?: string };
      const locText = [loc.city, loc.state].filter(Boolean).join(", ");
      const jobTypeArr = Array.isArray(j.jobType) ? (j.jobType as string[]) : [];
      return {
        id: String(j.jobKey || j.jobUrl || Math.random()),
        title: String(j.title || ""),
        company: String(j.companyName || ""),
        companyUrl: String(j.companyUrl || ""),
        location: locText,
        postedTimeAgo: String(j.age || ""),
        postedDate: String(j.datePublished || ""),
        contractType: jobTypeArr.join(", "),
        experienceLevel: "",
        url: String(j.jobUrl || ""),
        description: String(j.descriptionText || ""),
      };
    });
  }

  // ---- LINKEDIN (default) ----
  const input: Record<string, unknown> = {
    title: filters.title.trim(),
    location: filters.location.trim() || "United States",
    rows: filters.limit || 50,
  };
  if (filters.datePosted) input.publishedAt = filters.datePosted;

  const CONTRACT_CODE: Record<string, string> = { "Full-time": "F", "Part-time": "P", "Contract": "C", "Temporary": "T", "Internship": "I", "Other": "O" };
  const EXP_CODE: Record<string, string> = { "Internship": "1", "Entry level": "2", "Associate": "3", "Mid-Senior level": "4", "Director": "5", "Executive": "6" };
  const REMOTE_CODE: Record<string, string> = { "On-site": "1", "Remote": "2", "Hybrid": "3" };

  if (filters.contractType && CONTRACT_CODE[filters.contractType]) input.contractType = [CONTRACT_CODE[filters.contractType]];
  if (filters.experienceLevel && EXP_CODE[filters.experienceLevel]) input.experienceLevel = [EXP_CODE[filters.experienceLevel]];
  if (filters.remote && REMOTE_CODE[filters.remote]) input.workType = [REMOTE_CODE[filters.remote]];

  const results = await runActor<Record<string, unknown>>(JOBS_ACTOR, input);
  return (results || []).map((j) => ({
    id: String(j.id || j.url || Math.random()),
    title: String(j.title || ""),
    company: String(j.companyName || ""),
    companyUrl: String(j.companyUrl || ""),
    location: String(j.location || ""),
    postedTimeAgo: String(j.postedTimeAgo || ""),
    postedDate: String(j.postedDate || ""),
    contractType: String(j.contractType || ""),
    experienceLevel: String(j.experienceLevel || ""),
    url: String(j.url || ""),
    description: String(j.description || ""),
  }));
}
// ---------- Export pipeline rows to HeyReach CSV ----------
type HeyReachRow = {
  row_data: Record<string, string>;
  license_number: string;
};

export function exportToHeyReachCsv(
  rows: HeyReachRow[],
  enrichments: Record<string, EnrichmentRecord>,
  pipelineName: string
): void {
  // HeyReach's exact column order
  const headers = [
    "Profile URL", "First Name", "Last Name", "Full Name", "Headline",
    "Enriched Email", "Custom Address", "Job Title", "Location", "Company",
    "Company URL", "Tags", "Auto-tag", "Auto-tag Campaign Name",
    "Auto-tag Campaign Id", "Auto-tag Sender Full Name", "Auto-tag Sender Id",
    "Auto-tag Creation Time",
  ];

  const esc = (v: string) => {
    const s = (v ?? "").toString();
    // Quote if it contains comma, quote, or newline; double up internal quotes
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [headers.join(",")];
  let included = 0;

  for (const row of rows) {
    const enr = enrichments[(row.license_number || "").trim()];
    const linkedinUrl = enr?.person_linkedin_url || "";
    // Only export people who have a LinkedIn profile URL
    if (!linkedinUrl) continue;

    const d = row.row_data || {};
    const first = d["First Name"] || "";
    const last = d["Last Name"] || "";
    const fullName = [first, d["Middle Name"], last].filter(Boolean).join(" ");
    const email = enr?.person_email || (enr?.emails && enr.emails.length > 0 ? enr.emails[0] : "") || "";
    const location = [d["City"] || enr?.city, d["State"] || enr?.state].filter(Boolean).join(", ");
    const company = d["Business Name"] || d["Office Name"] || enr?.matched_title || "";
    const companyUrl = enr?.website || "";
    const headline = enr?.person_headline || d["License Type"] || "";
    const jobTitle = enr?.npi_specialty || d["License Type"] || "";

    const values = [
      linkedinUrl, first, last, fullName, headline,
      email, "", jobTitle, location, company,
      companyUrl, "", "", "", "", "", "", "",
    ];
    lines.push(values.map(esc).join(","));
    included++;
  }

  if (included === 0) {
    alert("No rows have a LinkedIn URL yet. Use 'Find Person' to add LinkedIn URLs first.");
    return;
  }

  const csv = "\ufeff" + lines.join("\r\n"); // BOM for Excel/HeyReach compatibility
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pipelineName.replace(/[^a-z0-9]+/gi, "_")}_heyreach.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}