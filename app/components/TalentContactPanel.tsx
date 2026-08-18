"use client";

import { useState } from "react";
import { findEmailByUrl, savePersonUrlEmail, setSentFlag, type EnrichmentRecord } from "@/app/lib/enrich";

/**
 * Shared, self-contained enrichment panel — the same four sections used in the
 * pipeline detail page (Person Contact / NPPES / Google Maps / Website Scrape).
 */
export default function TalentContactPanel({
  licenseNumber,
  firstName,
  lastName,
  city,
  enr,
  onRefresh,
}: {
  licenseNumber: string;
  firstName: string;
  lastName: string;
  city: string;
  enr: EnrichmentRecord | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const copyForLinkedIn = (role: "dentist" | "dental hygienist") => {
    const text = [firstName, lastName, city, role].filter(Boolean).join(" ");
    navigator.clipboard.writeText(text);
    flashCopied(role);
  };

  const getEmail = async () => {
    const url = urlInput.trim();
    if (!url) { alert("Paste the LinkedIn profile URL first."); return; }
    setBusy(true);
    setStage("Looking up email...");
    try {
      const result = await findEmailByUrl(url, { onProgress: (s) => setStage(s) });
      await savePersonUrlEmail(licenseNumber, url, result);
      await onRefresh();
    } catch (e) {
      alert("Email lookup failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const toggleSent = async (field: "linkedin_sent" | "email_sent", current: boolean) => {
    await setSentFlag(licenseNumber, field, !current);
    await onRefresh();
  };

  return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-sm [&>div]:min-w-0">
      {/* Person Contact — hybrid manual flow */}
      <div>
        <h4 className="font-semibold text-zinc-900 mb-2">Person Contact (LinkedIn)</h4>
        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            <button onClick={() => copyForLinkedIn("dentist")} className="px-2 py-1 border border-zinc-300 rounded hover:bg-zinc-50 transition">
              {copiedKey === "dentist" ? "Copied!" : "📋 Copy as Dentist"}
            </button>
            <button onClick={() => copyForLinkedIn("dental hygienist")} className="px-2 py-1 border border-zinc-300 rounded hover:bg-zinc-50 transition">
              {copiedKey === "dental hygienist" ? "Copied!" : "📋 Copy as Hygienist"}
            </button>
          </div>
          <p className="text-zinc-400">Search LinkedIn with the copied text, then paste the profile URL below.</p>

          <div className="flex gap-1">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste linkedin.com/in/... URL"
              className="flex-1 px-2 py-1 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
            <button onClick={getEmail} disabled={busy} className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition disabled:opacity-50 whitespace-nowrap">
              {busy ? "..." : "Get Email"}
            </button>
          </div>
          {busy && stage && <p className="text-blue-600">{stage}</p>}

          {enr?.person_linkedin_url && (
            <div className="pt-2 border-t border-zinc-200 space-y-1">
              <a href={enr.person_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block break-all">Open LinkedIn →</a>
              {enr.person_email ? (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-900 font-mono break-all">{enr.person_email}</span>
                  <button onClick={() => { navigator.clipboard.writeText(enr.person_email || ""); flashCopied("email"); }} className="text-blue-600 hover:underline whitespace-nowrap">
                    {copiedKey === "email" ? "Copied!" : "copy"}
                  </button>
                </div>
              ) : enr.person_email_found === false ? (
                <span className="text-zinc-500 italic">No email found</span>
              ) : null}
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={!!enr.linkedin_sent} onChange={() => toggleSent("linkedin_sent", !!enr.linkedin_sent)} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600" />
                  <span className="text-zinc-600">LinkedIn sent</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={!!enr.email_sent} onChange={() => toggleSent("email_sent", !!enr.email_sent)} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600" />
                  <span className="text-zinc-600">Email sent</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NPPES */}
      <div>
        <h4 className="font-semibold text-zinc-900 mb-2">From NPPES Registry</h4>
        {enr?.npi_status ? (
          <dl className="space-y-1 text-xs">
            <div>
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                enr.npi_status === "verified" ? "bg-emerald-100 text-emerald-700"
                : enr.npi_status === "probable" ? "bg-amber-100 text-amber-700"
                : "bg-zinc-100 text-zinc-600"
              }`}>
                {enr.npi_status === "verified" ? "✓ License verified" : enr.npi_status === "probable" ? "~ Probable match" : enr.npi_status === "no_match" ? "✕ Not found" : "? Unverified"}
              </span>
            </div>
            {enr.npi_name && <div><dt className="inline text-zinc-500">Name: </dt><dd className="inline text-zinc-900">{enr.npi_name}</dd></div>}
            {enr.npi_number && <div><dt className="inline text-zinc-500">NPI #: </dt><dd className="inline text-zinc-900 font-mono">{enr.npi_number}</dd></div>}
            {enr.npi_specialty && <div><dt className="inline text-zinc-500">Specialty: </dt><dd className="inline text-zinc-900">{enr.npi_specialty}</dd></div>}
            {enr.npi_address && <div><dt className="inline text-zinc-500">Practice: </dt><dd className="inline text-zinc-900">{enr.npi_address}</dd></div>}
            {enr.npi_phone && <div><dt className="inline text-zinc-500">Phone: </dt><dd className="inline text-zinc-900">{enr.npi_phone}</dd></div>}
          </dl>
        ) : (
          <p className="text-xs text-zinc-400 italic">Not looked up yet.</p>
        )}
      </div>

      {/* Google Maps */}
      <div>
        <h4 className="font-semibold text-zinc-900 mb-2">From Google Maps</h4>
        {enr?.matched_title ? (
          <dl className="space-y-1 text-xs">
            <div><dt className="inline text-zinc-500">Match: </dt><dd className="inline text-zinc-900">{enr.matched_title}</dd></div>
            {enr.street && <div><dt className="inline text-zinc-500">Address: </dt><dd className="inline text-zinc-900">{enr.street}, {enr.city}, {enr.state}</dd></div>}
            {enr.phone && <div><dt className="inline text-zinc-500">Phone: </dt><dd className="inline text-zinc-900">{enr.phone}</dd></div>}
            {enr.website && <div><dt className="inline text-zinc-500">Website: </dt><dd className="inline"><a href={enr.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{enr.website}</a></dd></div>}
            {enr.google_maps_url && <div><a href={enr.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Verify on Google Maps →</a></div>}
          </dl>
        ) : (
          <p className="text-xs text-zinc-400 italic">Not searched yet.</p>
        )}
      </div>

      {/* Website Scrape */}
      <div>
        <h4 className="font-semibold text-zinc-900 mb-2">From Website Scrape</h4>
        <dl className="space-y-1 text-xs">
          {enr?.emails && enr.emails.length > 0 && (
            <div><dt className="text-zinc-500 mb-1">Emails:</dt>
              {enr.emails.map((em, i) => <dd key={i} className="text-zinc-900 font-mono break-all">{em}</dd>)}
            </div>
          )}
          {enr?.extra_phones && enr.extra_phones.length > 0 && (
            <div><dt className="text-zinc-500 mb-1">Additional phones:</dt>
              <div className="max-h-24 overflow-y-auto pr-1">
                {enr.extra_phones.map((p, i) => <dd key={i} className="text-zinc-900">{p}</dd>)}
              </div>
            </div>
          )}
          {enr?.facebooks && enr.facebooks.length > 0 && <div className="flex flex-wrap gap-x-1 items-baseline"><dt className="text-zinc-500">Facebook:</dt>{enr.facebooks.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">link</a>)}</div>}
          {enr?.instagrams && enr.instagrams.length > 0 && <div className="flex flex-wrap gap-x-1 items-baseline"><dt className="text-zinc-500">Instagram:</dt>{enr.instagrams.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">link</a>)}</div>}
          {(!enr?.emails || enr.emails.length === 0) && (!enr?.extra_phones || enr.extra_phones.length === 0) && (
            <p className="text-zinc-400 italic">No contact details from website yet.</p>
          )}
        </dl>
      </div>
    </div>
  );
}