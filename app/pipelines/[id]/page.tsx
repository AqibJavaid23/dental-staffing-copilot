"use client";

import { useEffect, useState, use, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { enrichRow, smartSearchRescue, enrichRowNppes, checkRowInputQuality, findPerson, savePersonMatch, setSentFlag, findEmailByUrl, savePersonUrlEmail, type EnrichmentRecord, type PersonCandidate, type EmailResult , exportPipelineCsv , findContactsApify, findContactsHunter, saveCompanyContacts, type CompanyContact , loadCompanyContacts } from "@/app/lib/enrich";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type PipelineRow = {
  id: string;
  license_number: string;
  row_data: Record<string, string>;
  enrichment_status: string;
  outreach_status: string;
  outreach_notes: string | null;
};

type Pipeline = { id: string; name: string; source_tab: string; project: string; created_at: string; pipeline_type?: string | null; owner_id?: string | null };
type SharePerson = { id: string; full_name: string | null; email: string; role: string };
const ADD_FIELDS = ["First Name", "Last Name", "Business Name", "City", "State", "Phone", "Email", "License Number"];
const emptyPipeRow = (): Record<string, string> => ({ "First Name": "", "Last Name": "", "Business Name": "", City: "", State: "", Phone: "", Email: "", "License Number": "" });

type LogEntry = {
  id: string;
  pipeline_row_id: string;
  status: string | null;
  note: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<string, { label: string; classes: string }> = {
  enriched: { label: "✓ Enriched", classes: "bg-emerald-50 text-emerald-700" },
  partial: { label: "⚠ Partial", classes: "bg-amber-50 text-amber-700" },
  no_match: { label: "✕ No match", classes: "bg-red-50 text-red-700" },
  error: { label: "! Error", classes: "bg-red-50 text-red-700" },
  pending: { label: "Pending", classes: "bg-zinc-100 text-zinc-600" },
};

const OUTREACH_STATUSES: { value: string; label: string; color: string }[] = [
  { value: "to_contact", label: "To Contact", color: "#71717a" },
  { value: "contacted", label: "Contacted", color: "#0080D0" },
  { value: "in_conversation", label: "In Conversation", color: "#7c3aed" },
  { value: "interested", label: "Interested", color: "#059669" },
  { value: "meeting_scheduled", label: "Meeting Scheduled", color: "#d97706" },
  { value: "placed", label: "Placed ✓", color: "#123B78" },
  { value: "not_interested", label: "Not Interested", color: "#dc2626" },
  { value: "no_response", label: "No Response", color: "#9ca3af" },
];

const statusMeta = (value: string) => OUTREACH_STATUSES.find((s) => s.value === value) || OUTREACH_STATUSES[0];

function formatLogDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [enrichments, setEnrichments] = useState<Record<string, EnrichmentRecord>>({});
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmWeak, setConfirmWeak] = useState<{ row: PipelineRow; missing: string[] } | null>(null);
  const [personBusy, setPersonBusy] = useState<string | null>(null);
  const [contactDialog, setContactDialog] = useState<PipelineRow | null>(null);
  const [contactDomain, setContactDomain] = useState("");
  const [contactBusy, setContactBusy] = useState<"apify" | "hunter" | null>(null);
  const [foundContacts, setFoundContacts] = useState<CompanyContact[]>([]);
  const [savedContacts, setSavedContacts] = useState<Record<string, CompanyContact[]>>({});
  const [pickedContacts, setPickedContacts] = useState<Record<string, CompanyContact>>({});
  const [hunterLeft, setHunterLeft] = useState<number | null>(null);
  const [personCandidates, setPersonCandidates] = useState<Record<string, PersonCandidate[]>>({});
  const [urlInput, setUrlInput] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [logDialog, setLogDialog] = useState<{ row: PipelineRow; newStatus: string | null } | null>(null);
  const [logNote, setLogNote] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [bulkDialog, setBulkDialog] = useState<{ newStatus: string | null } | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [sharePeople, setSharePeople] = useState<SharePerson[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"form" | "paste">("form");
  const [formRows, setFormRows] = useState<Record<string, string>[]>([emptyPipeRow()]);
  const [pasteText, setPasteText] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data: p, error: pErr } = await supabase.from("pipelines").select("*").eq("id", id).single();
      if (pErr) throw pErr;
      setPipeline(p);

      const { data: r, error: rErr } = await supabase.from("pipeline_rows").select("*").eq("pipeline_id", id).order("created_at", { ascending: true });
      if (rErr) throw rErr;
      const rowList = r ?? [];
      setRows(rowList);

      const licenseNums = new Set(rowList.map((x) => (x.license_number || "").trim()).filter(Boolean));
      if (licenseNums.size > 0) {
        const { data: enr, error: enrErr } = await supabase.from("enrichments").select("*");
        if (enrErr) console.error("Enrichments fetch failed:", enrErr);
        const map: Record<string, EnrichmentRecord> = {};
        (enr ?? []).forEach((e) => {
          const key = (e.license_number || "").trim();
          if (licenseNums.has(key)) map[key] = e as EnrichmentRecord;
        });
        setEnrichments(map);
              // Load any saved company contacts for these rows
      const contactMap: Record<string, CompanyContact[]> = {};
      await Promise.all([...licenseNums].map(async (ln) => {
        const cs = await loadCompanyContacts(ln);
        if (cs.length > 0) contactMap[ln] = cs;
      }));
      setSavedContacts(contactMap);
      }

      const rowIds = rowList.map((x) => x.id);
      if (rowIds.length > 0) {
        const { data: logData } = await supabase
          .from("outreach_log")
          .select("*")
          .in("pipeline_row_id", rowIds)
          .order("created_at", { ascending: false });
        const logMap: Record<string, LogEntry[]> = {};
        (logData ?? []).forEach((l) => {
          if (!logMap[l.pipeline_row_id]) logMap[l.pipeline_row_id] = [];
          logMap[l.pipeline_row_id].push(l as LogEntry);
        });
        setLogs(logMap);
      }

      const { data: shr } = await supabase.from("pipeline_shares").select("user_id").eq("pipeline_id", id);
      setSharedIds(new Set((shr ?? []).map((x) => x.user_id as string)));
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email, role");
      setSharePeople((profs ?? []) as SharePerson[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const refreshEnrichmentsOnly = async () => {
    const licenseNums = new Set(rows.map((x) => (x.license_number || "").trim()).filter(Boolean));
    if (licenseNums.size === 0) return;
    const { data: enr, error: enrErr } = await supabase.from("enrichments").select("*");
    if (enrErr) console.error("Enrichments refresh failed:", enrErr);
    const map: Record<string, EnrichmentRecord> = {};
    (enr ?? []).forEach((e) => {
      const key = (e.license_number || "").trim();
      if (licenseNums.has(key)) map[key] = e as EnrichmentRecord;
    });
    setEnrichments(map);
  };

  const refreshLogsFor = async (rowId: string) => {
    const { data: logData } = await supabase
      .from("outreach_log")
      .select("*")
      .eq("pipeline_row_id", rowId)
      .order("created_at", { ascending: false });
    setLogs((prev) => ({ ...prev, [rowId]: (logData ?? []) as LogEntry[] }));
  };

  const onStatusChange = (row: PipelineRow, newStatus: string) => {
    setLogNote("");
    setLogDialog({ row, newStatus });
  };

  const openLogOnly = (row: PipelineRow) => {
    setLogNote("");
    setLogDialog({ row, newStatus: null });
  };

  const saveLogEntry = async () => {
    if (!logDialog) return;
    const { row, newStatus } = logDialog;
    const note = logNote.trim() || null;
    if (!newStatus && !note) { setLogDialog(null); return; }
    setSavingLog(true);
    try {
      const { error: lErr } = await supabase.from("outreach_log").insert({
        pipeline_row_id: row.id,
        status: newStatus,
        note,
      });
      if (lErr) throw lErr;
      if (newStatus) {
        const { error: uErr } = await supabase
          .from("pipeline_rows")
          .update({ outreach_status: newStatus, outreach_updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (uErr) throw uErr;
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, outreach_status: newStatus } : r)));
      }
      await refreshLogsFor(row.id);
      setExpandedId(row.id);
      setLogDialog(null);
    } catch (e) {
      alert("Failed to save: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSavingLog(false); }
  };

  // --- Bulk selection + actions ---
  const selectedIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);
  const selectedCount = selectedIds.length;
  const toggleRowSel = (id: string) => setSelectedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  const allSelected = rows.length > 0 && rows.every((r) => selectedRows[r.id]);
  const toggleAllSel = () => {
    if (allSelected) { setSelectedRows({}); return; }
    const m: Record<string, boolean> = {};
    rows.forEach((r) => { m[r.id] = true; });
    setSelectedRows(m);
  };

  const saveBulk = async () => {
    if (!bulkDialog) return;
    const ids = selectedIds;
    if (ids.length === 0) { setBulkDialog(null); return; }
    const note = bulkNote.trim() || null;
    const newStatus = bulkDialog.newStatus;
    if (!newStatus && !note) { setBulkDialog(null); return; }
    setSavingBulk(true);
    try {
      const logRows = ids.map((id) => ({ pipeline_row_id: id, status: newStatus, note }));
      const { error: lErr } = await supabase.from("outreach_log").insert(logRows);
      if (lErr) throw lErr;
      if (newStatus) {
        const { error: uErr } = await supabase
          .from("pipeline_rows")
          .update({ outreach_status: newStatus, outreach_updated_at: new Date().toISOString() })
          .in("id", ids);
        if (uErr) throw uErr;
        setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, outreach_status: newStatus } : r)));
      }
      for (const id of ids) await refreshLogsFor(id);
      setBulkDialog(null);
      setBulkNote("");
      setSelectedRows({});
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSavingBulk(false); }
  };

  const buildAddRows = (): { license_number: string; row_data: Record<string, string> }[] => {
    if (addMode === "form") {
      return formRows
        .filter((r) => Object.values(r).some((v) => v.trim()))
        .map((r) => {
          const rd = { ...r };
          const lic = (rd["License Number"] || "").trim();
          delete rd["License Number"];
          return { license_number: lic || `MANUAL::${crypto.randomUUID()}`, row_data: rd };
        });
    }
    return pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.includes("\t") ? line.split("\t") : line.split(",");
        const rd: Record<string, string> = {};
        ADD_FIELDS.forEach((c, i) => { rd[c] = (parts[i] || "").trim(); });
        const lic = (rd["License Number"] || "").trim();
        delete rd["License Number"];
        return { license_number: lic || `MANUAL::${crypto.randomUUID()}`, row_data: rd };
      })
      .filter((r) => Object.values(r.row_data).some((v) => v));
  };

  const saveAdd = async () => {
    const newRows = buildAddRows();
    if (newRows.length === 0) { alert("Add at least one row with some data."); return; }
    setSavingAdd(true);
    try {
      const toInsert = newRows.map((r) => ({ pipeline_id: id, license_number: r.license_number, row_data: r.row_data }));
      const { error } = await supabase.from("pipeline_rows").insert(toInsert);
      if (error) throw error;
      setAddOpen(false); setFormRows([emptyPipeRow()]); setPasteText(""); setAddMode("form");
      load();
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSavingAdd(false); }
  };

  const toggleShare = async (userId: string) => {
    if (sharedIds.has(userId)) {
      await supabase.from("pipeline_shares").delete().eq("pipeline_id", id).eq("user_id", userId);
      setSharedIds((prev) => { const n = new Set(prev); n.delete(userId); return n; });
    } else {
      await supabase.from("pipeline_shares").insert({ pipeline_id: id, user_id: userId, shared_by: profile?.id || null });
      setSharedIds((prev) => { const n = new Set(prev); n.add(userId); return n; });
    }
  };

  const canShare = !!profile && !!pipeline && (pipeline.owner_id === profile.id || profile.role === "manager" || profile.role === "admin");

  const enrichableData = (row: PipelineRow) => ({ ...row.row_data, "License Number": row.license_number });

  const actuallyEnrich = async (row: PipelineRow) => {
    setBusyId(row.id);
    setBusyStage("Starting...");
    try {
      const existing = enrichments[(row.license_number || "").trim()];
      const forceRefresh = !!(existing && existing.matched_title);
      const result = await enrichRow(enrichableData(row), { forceRefresh, onProgress: (stage) => setBusyStage(stage) });
      await supabase.from("pipeline_rows").update({ enrichment_status: result.status }).eq("id", row.id);
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("Enrichment failed: " + (e instanceof Error ? e.message : "unknown"));
      await refreshEnrichmentsOnly();
    } finally { setBusyId(null); setBusyStage(""); }
  };

  const runEnrich = (row: PipelineRow) => {
    const quality = checkRowInputQuality(enrichableData(row));
    if (!quality.ok || quality.hasWeakInput) { setConfirmWeak({ row, missing: quality.missing }); return; }
    actuallyEnrich(row);
  };

  const copyForLinkedIn = (row: PipelineRow, role: "dentist" | "dental hygienist") => {
    const d = row.row_data;
    const text = [d["First Name"], d["Last Name"], d["City"], role].filter(Boolean).join(" ");
    navigator.clipboard.writeText(text);
    setCopiedId(row.id + role);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getEmailForRow = async (row: PipelineRow) => {
    const url = (urlInput[row.id] || "").trim();
    if (!url) { alert("Paste the LinkedIn profile URL first."); return; }
    setPersonBusy(row.id);
    setBusyStage("Looking up email...");
    try {
      const result = await findEmailByUrl(url, { onProgress: (s) => setBusyStage(s) });
      await savePersonUrlEmail(row.license_number, url, result);
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("Email lookup failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setPersonBusy(null);
      setBusyStage("");
    }
  };
  // Is this a Hiring (company) pipeline?
  const isHiring = pipeline ? (pipeline.pipeline_type === "hiring" || (!pipeline.pipeline_type && pipeline.source_tab === "Jobs")) : false;

  const sendToProspecting = async (targetRows: PipelineRow[]) => {
    if (targetRows.length === 0) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const ownerId = sess.session?.user.id;
      const records = targetRows.map((row) => {
        const d = row.row_data;
        const enr = enrichments[(row.license_number || "").trim()];
        const phone = enr?.phone || (enr?.extra_phones && enr.extra_phones[0]) || enr?.npi_phone || d["Phone"] || "";
        const email = (enr?.emails && enr.emails[0]) || enr?.person_email || d["Email"] || "";
        const fullName = d["Name"] || d["Full Name"] || `${d["First Name"] || ""} ${d["Last Name"] || ""}`.trim() || d["Business Name"] || "Unknown";
        return {
          owner_id: ownerId,
          pipeline_row_id: row.id,
          license_number: (row.license_number || "").trim(),
          name: fullName,
          first_name: d["First Name"] || null,
          last_name: d["Last Name"] || null,
          job_title: d["Job Title"] || d["Specialty"] || null,
          phone: phone || null,
          email: email || null,
          source: "pipeline",
          assigned: false,
        };
      });
      const { error } = await supabase.from("prospecting_records").insert(records);
      if (error) throw error;
      alert(`Added ${records.length} to the Prospecting inbox. Assign them to a sequence from Prospecting.`);
      setSelectedRows({});
    } catch (e) {
      alert("Failed to send to Prospecting: " + (e instanceof Error ? e.message : "unknown"));
    }
  };

  const sendToPool = async (row: PipelineRow) => {
    const d = row.row_data;
    const company = d["Business Name"] || d["Office Name"] || "";
    if (!company) { alert("This row has no company/business name to create a pool from."); return; }
    if (!confirm(`Create a pool for "${company}"${d["Job Title"] ? ` (${d["Job Title"]})` : ""}?`)) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const { data: pool, error } = await supabase.from("pools").insert({
        owner_id: sess.session?.user.id,
        company_name: company,
        job_title: d["Job Title"] || "",
        city: d["City"] || "",
        state: d["State"] || "",
        job_url: d["Job URL"] || "",
        source_row_id: row.id,
        company_license: (row.license_number || "").trim(),
      }).select().single();
      if (error) throw error;
      if (confirm("Pool created! Go to the pool now to add talent?")) {
        router.push(`/dashboard/pools/${pool.id}`);
      }
    } catch (e) {
      alert("Failed to create pool: " + (e instanceof Error ? e.message : "unknown"));
    }
  };
    const openContacts = (row: PipelineRow) => {
    const enr = enrichments[(row.license_number || "").trim()];
    // Prefill domain from the enriched website if we have it
    let domain = "";
    if (enr?.website) domain = enr.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    setContactDomain(domain);
    setFoundContacts([]);
    setPickedContacts({});
    setContactDialog(row);
  };
  const loadSavedContactsFor = async (licenseNumber: string) => {
    const contacts = await loadCompanyContacts(licenseNumber);
    setSavedContacts((prev) => ({ ...prev, [licenseNumber.trim()]: contacts }));
  };
  const runContacts = async (source: "apify" | "hunter") => {
    if (!contactDialog) return;
    if (!contactDomain.trim()) { alert("Enter a domain first (e.g. example.com)."); return; }
    setContactBusy(source);
    try {
      const results = source === "apify"
        ? await findContactsApify(contactDomain, "Arizona")
        : await findContactsHunter(contactDomain);
      setFoundContacts(results);
      setPickedContacts({});
      if (results.length === 0) alert("No contacts found for that domain.");
    } catch (e) {
      alert("Lookup failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setContactBusy(null);
    }
  };

  const toggleContact = (c: CompanyContact) => {
    setPickedContacts((prev) => {
      const n = { ...prev };
      if (n[c.email]) delete n[c.email]; else n[c.email] = c;
      return n;
    });
  };

  const saveContacts = async () => {
    if (!contactDialog) return;
    const chosen = Object.values(pickedContacts);
    if (chosen.length === 0) return;
    try {
      await saveCompanyContacts(contactDialog.license_number, contactDomain.trim(), chosen);
      alert(`Saved ${chosen.length} contact(s).`);
      setContactDialog(null);
      await loadSavedContactsFor(contactDialog.license_number);
    } catch (e) {
      alert("Save failed: " + (e instanceof Error ? e.message : "unknown"));
    }
  };
  const runFindPerson = async (row: PipelineRow) => {
    setPersonBusy(row.id);
    setBusyStage("Searching LinkedIn...");
    try {
      const candidates = await findPerson(enrichableData(row), { onProgress: (s) => setBusyStage(s) });
      setPersonCandidates((prev) => ({ ...prev, [row.id]: candidates }));
      await savePersonMatch(row.license_number, candidates[0] || null, candidates);
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("Find Person failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setPersonBusy(null);
      setBusyStage("");
    }
  };

  const chooseCandidate = async (row: PipelineRow, c: PersonCandidate) => {
    const all = personCandidates[row.id] || [];
    await savePersonMatch(row.license_number, c, all);
    await refreshEnrichmentsOnly();
  };

  const toggleSent = async (row: PipelineRow, field: "linkedin_sent" | "email_sent", current: boolean) => {
    await setSentFlag(row.license_number, field, !current);
    await refreshEnrichmentsOnly();
  };

  const runNppes = async (row: PipelineRow) => {
    setBusyId(row.id);
    setBusyStage("Looking up NPPES registry...");
    try {
      await enrichRowNppes(enrichableData(row), { onProgress: (stage) => setBusyStage(stage) });
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("NPPES lookup failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setBusyId(null); setBusyStage(""); }
  };

  const runSmartSearch = async (row: PipelineRow) => {
    setBusyId(row.id);
    setBusyStage("Starting Smart Search...");
    try {
      const result = await smartSearchRescue(enrichableData(row), { onProgress: (stage) => setBusyStage(stage) });
      await supabase.from("pipeline_rows").update({ enrichment_status: result.status }).eq("id", row.id);
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("Smart search failed: " + (e instanceof Error ? e.message : "unknown"));
      await refreshEnrichmentsOnly();
    } finally { setBusyId(null); setBusyStage(""); }
  };

  const removeRow = async (rowId: string) => {
    if (!confirm("Remove this row from the pipeline? Its outreach history will also be deleted.")) return;
    const { error } = await supabase.from("pipeline_rows").delete().eq("id", rowId);
    if (error) { alert("Remove failed: " + error.message); return; }
    load();
  };

  const statusCounts = OUTREACH_STATUSES.map((s) => ({
    ...s,
    count: rows.filter((r) => (r.outreach_status || "to_contact") === s.value).length,
  })).filter((s) => s.count > 0);

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/pipelines" className="text-sm text-zinc-500 hover:text-zinc-900 transition whitespace-nowrap">← Back to Pipelines</Link>
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0 mx-4">
          {pipeline?.project && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{pipeline.project}</span>
          )}
          <h1 className="text-lg font-semibold text-zinc-900 truncate">{pipeline?.name ?? "Pipeline"}</h1>
        </div>
        <button onClick={() => setAddOpen(true)} className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition whitespace-nowrap" title="Add rows to this pipeline">
          + Add rows
        </button>
        {canShare && (
          <button onClick={() => setShareOpen(true)} className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition whitespace-nowrap" title="Share this pipeline with teammates">
            Share{sharedIds.size > 0 ? ` (${sharedIds.size})` : ""}
          </button>
        )}
        <button onClick={() => sendToProspecting(rows)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-100 transition whitespace-nowrap" title="Send all rows to the Prospecting inbox">
          → Send all to Prospecting
        </button>
        <button onClick={() => exportPipelineCsv(rows, enrichments, pipeline?.name || "pipeline")} className="px-3 py-1.5 text-xs font-medium bg-[#123B78] text-white rounded-lg hover:bg-[#0e2f60] transition whitespace-nowrap" title="Download every row with all its data and enrichment as a CSV">
          ⬇ Download data
        </button>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          {!loading && rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {statusCounts.map((s) => (
                <span key={s.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-full text-xs font-medium text-zinc-700 shadow-sm">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          )}

          {error ? <div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div>
          : loading ? <BrandLoader label="Loading pipeline..." />
          : rows.length === 0 ? <div className="p-12 text-center text-zinc-400">This pipeline is empty.</div>
          : (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-x-auto pretty-scroll">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAllSel} className="h-4 w-4 rounded border-zinc-300 text-blue-600" /></th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700 w-10"></th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Business</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">City</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Outreach Status</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Last Activity</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Data</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = r.row_data;
                    const enr = enrichments[(r.license_number || "").trim()];
                    const status = enr?.status || "pending";
                    const style = STATUS_STYLE[status] || STATUS_STYLE.pending;
                    const isBusy = busyId === r.id;
                    const isExpanded = expandedId === r.id;
                    const canSmartSearch = enr && (enr.status === "partial" || enr.status === "no_match" || enr.status === "error");
                    const rowLogs = logs[r.id] || [];
                    const hasAnyResult = !!(enr && (enr.status !== "pending" || enr.npi_status || enr.person_linkedin_url)) || rowLogs.length > 0;
                    const oStatus = statusMeta(r.outreach_status || "to_contact");
                    const lastLog = rowLogs[0];
                    return (
                      <Fragment key={r.id}>
                        <tr className={`border-b border-zinc-100 transition-colors ${selectedRows[r.id] ? "bg-blue-50/40" : ""} ${isBusy || personBusy === r.id ? "bg-blue-50/60" : ""}`}>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={!!selectedRows[r.id]} onChange={() => toggleRowSel(r.id)} className="h-4 w-4 rounded border-zinc-300 text-blue-600" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {hasAnyResult && (
                              <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="text-zinc-400 hover:text-zinc-700">
                                {isExpanded ? "▾" : "▸"}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-900 whitespace-nowrap font-medium">
                            {[d["First Name"], d["Middle Name"], d["Last Name"]].filter(Boolean).join(" ")}
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{d["Business Name"] || d["Office Name"] || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{d["City"] || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={r.outreach_status || "to_contact"}
                              onChange={(e) => onStatusChange(r, e.target.value)}
                              className="text-xs font-medium border rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                              style={{ color: oStatus.color, borderColor: oStatus.color + "55" }}
                            >
                              {OUTREACH_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 max-w-[220px]">
                            {lastLog ? (
                              <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="text-left w-full">
                                <span className="block text-xs text-zinc-700 truncate" title={lastLog.note || ""}>{lastLog.note || statusMeta(lastLog.status || "").label}</span>
                                <span className="block text-[10px] text-zinc-400">{formatLogDate(lastLog.created_at)} · {rowLogs.length} entr{rowLogs.length === 1 ? "y" : "ies"}</span>
                              </button>
                            ) : (
                              <span className="text-xs italic text-zinc-400">No activity yet</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md ${style.classes}`}>{style.label}</span>
                            {enr?.npi_status === "verified" && <span className="ml-1 text-[10px] text-emerald-600">NPI✓</span>}
                            {enr?.person_linkedin_url && <span className="ml-1 text-[10px] text-indigo-600">in✓</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex gap-2 justify-end">
                           {isHiring && (
                                <>
                                  <button onClick={() => sendToPool(r)} className="px-3 py-1 text-xs font-medium bg-teal-50 text-teal-700 rounded-md hover:bg-teal-100 transition" title="Create a talent pool for this company">
                                    + Pool
                                  </button>
                                  <button onClick={() => openContacts(r)} className="px-3 py-1 text-xs font-medium bg-cyan-50 text-cyan-700 rounded-md hover:bg-cyan-100 transition" title="Find email contacts at this company">
                                    Find Contacts
                                  </button>
                                </>
                              )}  <button onClick={() => openLogOnly(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium bg-zinc-100 text-zinc-600 rounded-md hover:bg-zinc-200 transition disabled:opacity-40" title="Add a note to the outreach history">
                                + Log
                              </button>
                              <button onClick={() => sendToProspecting([r])} className="px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition" title="Send this row to the Prospecting inbox">
                                → Prospecting
                              </button>
                              <button onClick={() => runNppes(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition disabled:opacity-60 disabled:cursor-not-allowed" title="Free official registry lookup">
                                {isBusy ? "..." : enr?.npi_status ? "NPPES ↻" : "NPPES"}
                              </button>
                              <button onClick={() => runEnrich(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium bg-sky-50 text-sky-700 rounded-md hover:bg-sky-100 transition disabled:opacity-60 disabled:cursor-not-allowed min-w-[80px]" title="Google Maps + website scrape">
                                {isBusy ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="inline-block w-3 h-3 rounded-full border-2 border-sky-300 border-t-sky-600 animate-spin" />
                                    Working
                                  </span>
                                ) : (enr?.status && enr.status !== "pending") ? "G-Maps ↻" : "G-Maps"}
                              </button>
                              {canSmartSearch && (
                                <button onClick={() => runSmartSearch(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium bg-amber-50 text-amber-700 rounded-md hover:bg-amber-100 transition disabled:opacity-40 disabled:cursor-not-allowed" title="Rescue with Google Search">🔍</button>
                              )}
                              <button onClick={() => removeRow(r.id)} className="px-2 py-1 text-xs text-zinc-500 hover:text-red-500 transition">✕</button>
                            </div>
                          </td>
                        </tr>

                        {(isBusy || personBusy === r.id) && (
                          <tr className="bg-blue-50/60 border-b border-zinc-100">
                            <td colSpan={9} className="px-6 py-2 text-xs text-blue-700">
                              <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2 align-middle" />
                              {busyStage || "Working..."}
                            </td>
                          </tr>
                        )}

                        {!isBusy && enr?.status === "error" && enr.error_message && (
                          <tr className="bg-red-50/40 border-b border-zinc-100">
                            <td colSpan={9} className="px-6 py-2 text-xs text-red-700">⚠️ {enr.error_message}</td>
                          </tr>
                        )}

                        {!isBusy && enr?.status === "no_match" && (
                          <tr className="bg-red-50/40 border-b border-zinc-100">
                            <td colSpan={9} className="px-6 py-2 text-xs text-red-700">⚠️ No match found on Google Maps. Try NPPES or 🔍 Smart Search.</td>
                          </tr>
                        )}

                        {isExpanded && (
                          <tr className="bg-zinc-50/50">
                            <td colSpan={9} className="px-6 py-4">
                              {/* All original fields from the row */}
                              <div className="mb-5">
                                <h4 className="font-semibold text-zinc-900 mb-2">All fields</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                                  {Object.entries(r.row_data).filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
                                    <div key={k} className="min-w-0">
                                      <span className="text-zinc-500">{k}: </span>
                                      <span className="text-zinc-900 break-words">{v}</span>
                                    </div>
                                  ))}
                                  {Object.values(r.row_data).filter((v) => v && String(v).trim()).length === 0 && (
                                    <p className="text-zinc-400 italic">No stored fields for this row.</p>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                               {/* Person Contact — hybrid manual flow */}
                                <div>
                                  <h4 className="font-semibold text-zinc-900 mb-2">Person Contact (LinkedIn)</h4>
                                  <div className="space-y-2 text-xs">
                                    {/* Copy-for-search buttons */}
                                    <div className="flex gap-2">
                                      <button onClick={() => copyForLinkedIn(r, "dentist")} className="px-2 py-1 border border-zinc-300 rounded hover:bg-zinc-50 transition">
                                        {copiedId === r.id + "dentist" ? "Copied!" : "📋 Copy as Dentist"}
                                      </button>
                                      <button onClick={() => copyForLinkedIn(r, "dental hygienist")} className="px-2 py-1 border border-zinc-300 rounded hover:bg-zinc-50 transition">
                                        {copiedId === r.id + "dental hygienist" ? "Copied!" : "📋 Copy as Hygienist"}
                                      </button>
                                    </div>
                                    <p className="text-zinc-400">Search LinkedIn with the copied text, then paste the profile URL below.</p>

                                    {/* Paste URL + Get Email */}
                                    <div className="flex gap-1">
                                      <input
                                        type="text"
                                        value={urlInput[r.id] || ""}
                                        onChange={(e) => setUrlInput((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                        placeholder="Paste linkedin.com/in/... URL"
                                        className="flex-1 px-2 py-1 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <button onClick={() => getEmailForRow(r)} disabled={personBusy === r.id} className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition disabled:opacity-50 whitespace-nowrap">
                                        {personBusy === r.id ? "..." : "Get Email"}
                                      </button>
                                    </div>

                                    {/* Saved result */}
                                    {enr?.person_linkedin_url && (
                                      <div className="pt-2 border-t border-zinc-200 space-y-1">
                                        <a href={enr.person_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block break-all">Open LinkedIn →</a>
                                        {enr.person_email ? (
                                          <div className="flex items-center gap-2">
                                            <span className="text-zinc-900 font-mono break-all">{enr.person_email}</span>
                                            <button onClick={() => { navigator.clipboard.writeText(enr.person_email || ""); setCopiedId(r.id + "email"); setTimeout(() => setCopiedId(null), 1500); }} className="text-blue-600 hover:underline whitespace-nowrap">
                                              {copiedId === r.id + "email" ? "Copied!" : "copy"}
                                            </button>
                                          </div>
                                        ) : enr.person_email_found === false ? (
                                          <span className="text-zinc-500 italic">No email found</span>
                                        ) : null}
                                        <div className="flex gap-3 mt-1">
                                          <label className="flex items-center gap-1 cursor-pointer">
                                            <input type="checkbox" checked={!!enr.linkedin_sent} onChange={() => toggleSent(r, "linkedin_sent", !!enr.linkedin_sent)} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600" />
                                            <span className="text-zinc-600">LinkedIn sent</span>
                                          </label>
                                          <label className="flex items-center gap-1 cursor-pointer">
                                            <input type="checkbox" checked={!!enr.email_sent} onChange={() => toggleSent(r, "email_sent", !!enr.email_sent)} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600" />
                                            <span className="text-zinc-600">Email sent</span>
                                          </label>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
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
                                    <p className="text-xs text-zinc-400 italic">Not looked up yet. Click NPPES.</p>
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
                                    <p className="text-xs text-zinc-400 italic">Not searched yet. Click G-Maps.</p>
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
                                        {enr.extra_phones.map((p, i) => <dd key={i} className="text-zinc-900">{p}</dd>)}
                                      </div>
                                    )}
                                    {enr?.facebooks && enr.facebooks.length > 0 && <div><dt className="inline text-zinc-500">Facebook: </dt>{enr.facebooks.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">link</a>)}</div>}
                                    {enr?.instagrams && enr.instagrams.length > 0 && <div><dt className="inline text-zinc-500">Instagram: </dt>{enr.instagrams.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">link</a>)}</div>}
                                    {(!enr?.emails || enr.emails.length === 0) && (!enr?.extra_phones || enr.extra_phones.length === 0) && (
                                      <p className="text-zinc-400 italic">No contact details from website yet.</p>
                                    )}
                                  </dl>
                                </div>
                              </div>

                              {/* Outreach History (full width, below the four columns) */}
                                                            {(savedContacts[(r.license_number || "").trim()]?.length ?? 0) > 0 && (
                                <div className="mt-5 pt-4 border-t border-zinc-200">
                                  <h4 className="font-semibold text-zinc-900 mb-2">Saved Contacts</h4>
                                  <div className="space-y-1">
                                    {savedContacts[(r.license_number || "").trim()].map((c, i) => (
                                      <div key={i} className="text-xs flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-zinc-900">{c.email}</span>
                                        {c.name && <span className="text-zinc-500">· {c.name}</span>}
                                        {c.title && <span className="text-zinc-500">· {c.title}</span>}
                                        {c.confidence ? <span className="text-zinc-400">· {c.confidence}%</span> : null}
                                        {c.source === "hunter" && <span className="text-[10px] text-amber-600 font-semibold">⭐ Hunter</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="mt-5 pt-4 border-t border-zinc-200">
                                <h4 className="font-semibold text-zinc-900 mb-2">Outreach History</h4>
                                {rowLogs.length > 0 ? (
                                  <ol className="space-y-2 max-h-64 overflow-y-auto pr-2">
                                    {rowLogs.map((l) => {
                                      const meta = l.status ? statusMeta(l.status) : null;
                                      return (
                                        <li key={l.id} className="text-xs border-l-2 pl-2" style={{ borderColor: meta?.color || "#d4d4d8" }}>
                                          <div className="flex items-center gap-1.5">
                                            {meta && <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span>}
                                            <span className="text-zinc-400">{formatLogDate(l.created_at)}</span>
                                          </div>
                                          {l.note && <p className="text-zinc-700 mt-0.5">{l.note}</p>}
                                        </li>
                                      );
                                    })}
                                  </ol>
                                ) : (
                                  <p className="text-xs text-zinc-400 italic">No activity logged yet. Use + Log or change the status.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !savingAdd && setAddOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Add rows to this pipeline</h2>
              <button onClick={() => setAddOpen(false)} className="text-zinc-400 hover:text-zinc-900">✕</button>
            </div>
            <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm">
              <button onClick={() => setAddMode("form")} className={`px-3 py-1 rounded-md ${addMode === "form" ? "bg-blue-600 text-white" : "text-zinc-600"}`}>Type a row</button>
              <button onClick={() => setAddMode("paste")} className={`px-3 py-1 rounded-md ${addMode === "paste" ? "bg-blue-600 text-white" : "text-zinc-600"}`}>Paste many</button>
            </div>

            {addMode === "form" ? (
              <div className="space-y-2">
                {formRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-zinc-200 rounded-lg p-2 relative">
                    {ADD_FIELDS.map((f) => (
                      <input key={f} value={row[f] || ""} onChange={(e) => setFormRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [f]: e.target.value } : r)))} placeholder={f} className="px-2 py-1.5 border border-zinc-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    ))}
                    {formRows.length > 1 && (
                      <button onClick={() => setFormRows((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 w-5 h-5 text-[11px] bg-white border border-zinc-300 rounded-full text-zinc-400 hover:text-red-500" title="Remove row">✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setFormRows((prev) => [...prev, emptyPipeRow()])} className="text-sm font-medium text-blue-600 hover:text-blue-800">+ Add another row</button>
              </div>
            ) : (
              <div className="space-y-1">
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={8} placeholder="One row per line…" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[11px] text-zinc-400">One row per line. Columns in this order (tab or comma separated): First Name, Last Name, Business Name, City, State, Phone, Email, License #. Copy cells straight from Excel/Sheets — tabs are handled.</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
              <button onClick={() => setAddOpen(false)} disabled={savingAdd} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
              <button onClick={saveAdd} disabled={savingAdd} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">{savingAdd ? "Adding…" : "Add to pipeline"}</button>
            </div>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShareOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Share &quot;{pipeline?.name}&quot;</h2>
              <button onClick={() => setShareOpen(false)} className="text-zinc-400 hover:text-zinc-900">✕</button>
            </div>
            <p className="text-sm text-zinc-500">Tick a teammate to give them full access — they can add logs, change status, and enrich alongside you. Changes save instantly.</p>
            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 border border-zinc-200 rounded-lg">
              {sharePeople.filter((p) => p.id !== pipeline?.owner_id && p.id !== profile?.id).map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50">
                  <input type="checkbox" checked={sharedIds.has(p.id)} onChange={() => toggleShare(p.id)} className="h-4 w-4 rounded border-zinc-300 text-blue-600" />
                  <span className="min-w-0">
                    <span className="block text-sm text-zinc-800 truncate">{p.full_name || p.email}</span>
                    <span className="block text-[11px] text-zinc-400 capitalize">{p.role}</span>
                  </span>
                </label>
              ))}
              {sharePeople.filter((p) => p.id !== pipeline?.owner_id && p.id !== profile?.id).length === 0 && (
                <p className="px-3 py-3 text-sm text-zinc-400 italic">No other teammates to share with.</p>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={() => setShareOpen(false)} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Done</button>
            </div>
          </div>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 text-white rounded-full shadow-2xl px-5 py-3 flex items-center gap-3 flex-wrap justify-center">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <select
            value=""
            onChange={(e) => { if (e.target.value) { setBulkNote(""); setBulkDialog({ newStatus: e.target.value }); } }}
            className="text-xs font-medium border border-zinc-600 rounded-lg px-2 py-1.5 bg-zinc-800 text-white cursor-pointer focus:outline-none"
          >
            <option value="">Set status…</option>
            {OUTREACH_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
          <button onClick={() => { setBulkNote(""); setBulkDialog({ newStatus: null }); }} className="text-sm font-medium bg-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-700 transition">+ Log to all</button>
          <button onClick={() => sendToProspecting(rows.filter((r) => selectedRows[r.id]))} className="text-sm font-medium bg-rose-600 px-3 py-1.5 rounded-full hover:bg-rose-700 transition">→ Prospecting</button>
          <button onClick={() => setSelectedRows({})} className="text-sm text-zinc-300 hover:text-white transition">Clear</button>
        </div>
      )}

      {bulkDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !savingBulk && setBulkDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">
              {bulkDialog.newStatus
                ? <>Set {selectedCount} to → <span style={{ color: statusMeta(bulkDialog.newStatus).color }}>{statusMeta(bulkDialog.newStatus).label}</span></>
                : `Add a note to ${selectedCount} rows`}
            </h2>
            <p className="text-sm text-zinc-500">Saved to the outreach history for all {selectedCount} selected rows.</p>
            <textarea
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              autoFocus
              rows={3}
              placeholder={bulkDialog.newStatus ? "Optional note for all selected…" : "e.g., left voicemail for all"}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setBulkDialog(null)} disabled={savingBulk} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
              <button onClick={saveBulk} disabled={savingBulk || (!bulkDialog.newStatus && !bulkNote.trim())} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {savingBulk ? "Saving…" : `Apply to ${selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {logDialog && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !savingLog && setLogDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">
              {logDialog.newStatus
                ? <>Update status → <span style={{ color: statusMeta(logDialog.newStatus).color }}>{statusMeta(logDialog.newStatus).label}</span></>
                : "Add outreach note"}
            </h2>
            <p className="text-sm text-zinc-500">
              {[logDialog.row.row_data["First Name"], logDialog.row.row_data["Last Name"]].filter(Boolean).join(" ")}
              {" — "}this will be saved to the outreach history.
            </p>
            <textarea
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              autoFocus
              rows={3}
              placeholder={logDialog.newStatus ? "Optional note — e.g., spoke with office manager, call back Tuesday" : "e.g., left voicemail again"}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setLogDialog(null)} disabled={savingLog} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
              <button onClick={saveLogEntry} disabled={savingLog || (!logDialog.newStatus && !logNote.trim())} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {savingLog ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmWeak && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmWeak(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">Limited info to search with</h2>
            <p className="text-sm text-zinc-500">
              This row is missing: <strong>{confirmWeak.missing.join(", ")}</strong>. Enrichment may return no results or the wrong person.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmWeak(null)} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition">Cancel</button>
              <button onClick={() => { const r = confirmWeak.row; setConfirmWeak(null); actuallyEnrich(r); }} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Enrich anyway</button>
            </div>
          </div>
        </div>
      )}
            {contactDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => contactBusy === null && setContactDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900">Find Contacts</h2>
              <p className="text-xs text-zinc-500 mt-0.5">{contactDialog.row_data["Business Name"] || contactDialog.row_data["Office Name"] || "Company"}</p>
              <div className="flex gap-2 mt-3">
                <input type="text" value={contactDomain} onChange={(e) => setContactDomain(e.target.value)} placeholder="company domain (e.g. rodeodental.com)" className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => runContacts("apify")} disabled={contactBusy !== null} className="flex-1 px-3 py-2 text-sm font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition disabled:opacity-50">
                  {contactBusy === "apify" ? "Searching..." : "Find Contacts (free)"}
                </button>
                <button onClick={() => runContacts("hunter")} disabled={contactBusy !== null} className="flex-1 px-3 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50" title="Premium — verified people (limited)">
                  {contactBusy === "hunter" ? "Searching..." : "⭐ Hunter"}{hunterLeft !== null ? ` (${hunterLeft}/50)` : ""}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {foundContacts.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 text-sm">Enter a domain and search. Free = emails only; Hunter = verified people with names & titles.</div>
              ) : (
                foundContacts.map((c) => {
                  const isSel = !!pickedContacts[c.email];
                  return (
                    <button key={c.email} onClick={() => toggleContact(c)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition ${isSel ? "bg-blue-50" : "hover:bg-zinc-50"}`}>
                      <input type="checkbox" checked={isSel} readOnly className="h-4 w-4 rounded border-zinc-300 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-zinc-900 break-all">{c.email}</div>
                        {(c.name || c.title) && <div className="text-xs text-zinc-500">{[c.name, c.title].filter(Boolean).join(" · ")}{c.confidence ? ` · ${c.confidence}%` : ""}</div>}
                      </div>
                      {c.source === "hunter" && <span className="text-[10px] text-amber-600 font-semibold">⭐</span>}
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-zinc-200 flex justify-between items-center">
              <span className="text-sm text-zinc-500">{Object.keys(pickedContacts).length} selected</span>
              <div className="flex gap-2">
                <button onClick={() => setContactDialog(null)} disabled={contactBusy !== null} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Close</button>
                <button onClick={saveContacts} disabled={Object.keys(pickedContacts).length === 0} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">Save selected</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}