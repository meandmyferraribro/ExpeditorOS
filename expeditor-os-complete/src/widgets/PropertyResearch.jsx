import { useState, useEffect, useCallback, useMemo } from 'react';
import { createStorage } from '../lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   Property Research Widget — ExpeditorOS
   Building Expediting Systems, Inc.
   NYC property research & compliance analysis CRM
   All data persists via Supabase + localStorage
   ═══════════════════════════════════════════════════════════════ */

const BES = { rep: "SHAHID SIDDIQI", company: "Building Expediting Systems, Inc.", addr: "71-58 Austin St, Suite 207A", city: "Forest Hills, NY", zip: "11375", phone: "718-291-8555", email: "shawn@buildingexpeditingsystems.com" };
const storage = createStorage('property_research');

const BOROUGHS = [
  { code: "1", label: "Manhattan", abbr: "MN" },
  { code: "2", label: "Bronx", abbr: "BX" },
  { code: "3", label: "Brooklyn", abbr: "BK" },
  { code: "4", label: "Queens", abbr: "QN" },
  { code: "5", label: "Staten Island", abbr: "SI" },
];

const STATUSES = ["Active", "Researching", "Compliant", "Non-Compliant", "Pending Filing", "Filed", "Archived"];
const ZONING_COLORS = { R: "#10b981", C: "#3b82f6", M: "#f59e0b", P: "#8b5cf6" };

const EMPTY = {
  id: null,
  // Property
  address: "", borough: "", block: "", lot: "", bin_number: "", zip_code: "",
  // PLUTO Data
  zoning_district: "", overlay: "", special_district: "", landmark: "",
  building_class: "", building_class_desc: "", land_use: "",
  lot_area: "", building_area: "", num_floors: "", num_units: "", year_built: "",
  owner_name: "", zoning_map: "", comm_dist: "", council_dist: "",
  far: "", max_far: "", lot_frontage: "", lot_depth: "",
  // Research
  status: "Researching",
  compliance_notes: "",
  research_summary: "",
  client_name: "", client_phone: "", client_email: "",
  engagement_type: "",
  // API Data Snapshots (JSON)
  dob_violations: "[]", hpd_violations: "[]", dob_complaints: "[]",
  dob_permits: "[]", ecb_violations: "[]",
  last_lookup: "",
  // Audit
  audit_log: "[]", created_at: "", updated_at: ""
};

// ─── NYC Open Data SODA API Endpoints ─────────────────────
const API = {
  pluto: "https://data.cityofnewyork.us/resource/64uk-42ks.json",
  dobViol: "https://data.cityofnewyork.us/resource/3h2n-5cm9.json",
  dobComplaints: "https://data.cityofnewyork.us/resource/eabe-havv.json",
  dobPermits: "https://data.cityofnewyork.us/resource/ic3t-wcy2.json",
  hpdViol: "https://data.cityofnewyork.us/resource/wvxf-dwi5.json",
  ecbViol: "https://data.cityofnewyork.us/resource/6bgk-3dad.json",
};

// ─── Quick-Link Builders ──────────────────────────────────
function getBISUrl(bin) { return bin ? `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?bin=${bin}` : null; }
function getDOBNowUrl(bin) { return bin ? `https://a810-dobnow.nyc.gov/Publish/#!/bis/${bin}` : null; }
function getZolaUrl(bbl) { return bbl ? `https://zola.planning.nyc.gov/lot/${bbl.replace(/\//g, "/")}` : null; }
function getHPDUrl(boro, block, lot) { return (boro && block && lot) ? `https://hpdonline.nyc.gov/HPDonline/Provide_Address?boro=${boro}&block=${block}&lot=${lot}` : null; }
function getACRISUrl(boro, block, lot) { return (boro && block && lot) ? `https://a836-acris.nyc.gov/bblsearch/bblsearch.asp?borough=${boro}&block=${block}&lot=${lot}` : null; }
function getCityPayUrl() { return "https://a836-citypay.nyc.gov/citypay/ecb"; }

// ─── Helpers ──────────────────────────────────────────────
const zoningColor = z => { if (!z) return "#94a3b8"; const p = z.charAt(0).toUpperCase(); return ZONING_COLORS[p] || "#94a3b8"; };
const statusStyle = s => ({
  Active: { bg: "#10b981", c: "#fff" }, Researching: { bg: "#3b82f6", c: "#fff" },
  Compliant: { bg: "#06b6d4", c: "#fff" }, "Non-Compliant": { bg: "#ef4444", c: "#fff" },
  "Pending Filing": { bg: "#f59e0b", c: "#1a1a2e" }, Filed: { bg: "#8b5cf6", c: "#fff" },
  Archived: { bg: "#374151", c: "#d1d5db" }
}[s] || { bg: "#374151", c: "#d1d5db" });

const boroCode = label => BOROUGHS.find(b => b.label === label || b.abbr === label)?.code || "";
const boroLabel = code => BOROUGHS.find(b => b.code === String(code))?.label || "";
const padBlock = b => String(b).padStart(5, "0");
const padLot = l => String(l).padStart(4, "0");
const makeBBL = (boro, block, lot) => `${boro}/${padBlock(block)}/${padLot(lot)}`;

// ═══════════════════════════════════════════════════════════════
export default function PropertyResearch() {
  const [view, setView] = useState("dashboard");
  const [records, setRecords] = useState([]);
  const [ac, setAc] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({ borough: "", status: "", search: "" });
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");
  const [delId, setDelId] = useState(null);

  // Lookup states
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStep, setLookupStep] = useState("");
  const [violSummary, setViolSummary] = useState({ dob: [], hpd: [], ecb: [], complaints: [], permits: [] });
  const [showViolPanel, setShowViolPanel] = useState("");
  const [lookupError, setLookupError] = useState("");

  // ─── Load ──────────────────────────────────────────────────
  useEffect(() => { (async () => { setRecords(await storage.getAll()); setLoading(false); })(); }, []);

  const flash = useCallback((m, t = "ok") => { setToast({ m, t }); setTimeout(() => setToast(null), 3000); }, []);

  // ─── Filtering & Sorting ───────────────────────────────────
  const filtered = useMemo(() => {
    let l = [...records];
    if (filters.borough) l = l.filter(r => r.borough === filters.borough);
    if (filters.status) l = l.filter(r => r.status === filters.status);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      l = l.filter(r => [r.address, r.owner_name, r.client_name, r.bin_number, r.block, r.lot, r.zoning_district].some(v => (v || "").toLowerCase().includes(s)));
    }
    l.sort((a, b) => { let va = a[sortBy] || "", vb = b[sortBy] || ""; return va < vb ? (sortDir === "asc" ? -1 : 1) : va > vb ? (sortDir === "asc" ? 1 : -1) : 0; });
    return l;
  }, [records, filters, sortBy, sortDir]);

  const stats = useMemo(() => {
    const t = records.length;
    const bd = {}; STATUSES.forEach(s => bd[s] = 0);
    let withViol = 0, withPermits = 0;
    records.forEach(r => {
      bd[r.status] = (bd[r.status] || 0) + 1;
      const dv = JSON.parse(r.dob_violations || "[]");
      const hv = JSON.parse(r.hpd_violations || "[]");
      if (dv.length > 0 || hv.length > 0) withViol++;
      const dp = JSON.parse(r.dob_permits || "[]");
      if (dp.length > 0) withPermits++;
    });
    const boroCounts = {};
    records.forEach(r => { if (r.borough) boroCounts[r.borough] = (boroCounts[r.borough] || 0) + 1; });
    return { t, bd, withViol, withPermits, boroCounts };
  }, [records]);

  // ─── CRUD ──────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    const saved = await storage.save({ ...ac });
    setRecords(p => { const i = p.findIndex(r => r.id === saved.id); if (i >= 0) { const n = [...p]; n[i] = saved; return n; } return [saved, ...p]; });
    setAc(saved);
    setSaving(false);
    flash("Property saved — all data persisted");
  };

  const handleDel = async id => {
    await storage.remove(id);
    setRecords(p => p.filter(r => r.id !== id));
    setDelId(null);
    if (ac.id === id) { setAc({ ...EMPTY }); setView("dashboard"); }
    flash("Deleted", "warn");
  };

  const openRecord = r => { setAc({ ...EMPTY, ...r }); loadViolSummary(r); setView("editor"); };
  const newRecord = () => { setAc({ ...EMPTY }); setViolSummary({ dob: [], hpd: [], ecb: [], complaints: [], permits: [] }); setView("editor"); };
  const upd = (f, v) => setAc(p => ({ ...p, [f]: v }));
  const toggleSort = col => { if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir("asc"); } };

  // Load cached violation summaries from record
  function loadViolSummary(r) {
    setViolSummary({
      dob: JSON.parse(r.dob_violations || "[]"),
      hpd: JSON.parse(r.hpd_violations || "[]"),
      ecb: JSON.parse(r.ecb_violations || "[]"),
      complaints: JSON.parse(r.dob_complaints || "[]"),
      permits: JSON.parse(r.dob_permits || "[]"),
    });
  }

  // ─── NYC Open Data Lookups ─────────────────────────────────
  async function fetchSoda(url, params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${qs}`, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  async function runFullLookup() {
    const boro = boroCode(ac.borough);
    const block = ac.block?.trim();
    const lot = ac.lot?.trim();
    const bin = ac.bin_number?.trim();

    if ((!boro || !block || !lot) && !bin) {
      flash("Enter Borough + Block + Lot, or BIN", "warn");
      return;
    }

    setLookupLoading(true); setLookupError("");

    try {
      // ── Step 1: PLUTO ──────────────────────────────────────
      setLookupStep("Looking up PLUTO data...");
      let plutoData = null;
      if (boro && block && lot) {
        const pRes = await fetchSoda(API.pluto, {
          "$where": `borocode='${boro}' AND block='${padBlock(block)}' AND lot='${padLot(lot)}'`,
          "$limit": 1
        });
        if (pRes.length > 0) plutoData = pRes[0];
      }

      if (plutoData) {
        setAc(p => ({
          ...p,
          address: plutoData.address || p.address,
          zip_code: plutoData.zipcode || p.zip_code,
          zoning_district: [plutoData.zonedist1, plutoData.zonedist2, plutoData.zonedist3, plutoData.zonedist4].filter(Boolean).join(" / ") || p.zoning_district,
          overlay: [plutoData.overlay1, plutoData.overlay2].filter(Boolean).join(" / ") || p.overlay,
          special_district: [plutoData.spdist1, plutoData.spdist2, plutoData.spdist3].filter(Boolean).join(" / ") || p.special_district,
          landmark: plutoData.landmark || p.landmark,
          building_class: plutoData.bldgclass || p.building_class,
          land_use: plutoData.landuse || p.land_use,
          lot_area: plutoData.lotarea || p.lot_area,
          building_area: plutoData.bldgarea || p.building_area,
          num_floors: plutoData.numfloors || p.num_floors,
          num_units: plutoData.unitsres || p.num_units,
          year_built: plutoData.yearbuilt || p.year_built,
          owner_name: plutoData.ownername || p.owner_name,
          zoning_map: plutoData.zonemap || p.zoning_map,
          comm_dist: plutoData.cd || p.comm_dist,
          council_dist: plutoData.council || p.council_dist,
          far: plutoData.builtfar || p.far,
          max_far: plutoData.residfar || p.max_far,
          lot_frontage: plutoData.lotfront || p.lot_frontage,
          lot_depth: plutoData.lotdepth || p.lot_depth,
          bin_number: plutoData.bbl ? (p.bin_number || "") : p.bin_number,
        }));
      }

      // ── Step 2: DOB Violations ─────────────────────────────
      setLookupStep("Pulling DOB violations...");
      let dobViols = [];
      if (bin || (boro && block && lot)) {
        const params = bin
          ? { "$where": `bin='${bin}'`, "$limit": 50, "$order": "issue_date DESC" }
          : { "$where": `boro='${boro}' AND block='${padBlock(block)}' AND lot='${padLot(lot)}'`, "$limit": 50, "$order": "issue_date DESC" };
        try { dobViols = await fetchSoda(API.dobViol, params); } catch { }
      }

      // ── Step 3: HPD Violations ─────────────────────────────
      setLookupStep("Pulling HPD violations...");
      let hpdViols = [];
      if (boro && block && lot) {
        try {
          hpdViols = await fetchSoda(API.hpdViol, {
            "$where": `boroid='${boro}' AND block='${padBlock(block)}' AND lot='${padLot(lot)}'`,
            "$limit": 50, "$order": "inspectiondate DESC"
          });
        } catch { }
      }

      // ── Step 4: DOB Complaints ─────────────────────────────
      setLookupStep("Pulling DOB complaints...");
      let dobComps = [];
      if (bin) {
        try {
          dobComps = await fetchSoda(API.dobComplaints, {
            "$where": `bin='${bin}'`, "$limit": 50, "$order": "date_entered DESC"
          });
        } catch { }
      }

      // ── Step 5: DOB Permits ────────────────────────────────
      setLookupStep("Pulling DOB permits/filings...");
      let dobPerms = [];
      if (bin) {
        try {
          dobPerms = await fetchSoda(API.dobPermits, {
            "$where": `bin__='${bin}'`, "$limit": 50, "$order": "filing_date DESC"
          });
        } catch { }
      }

      // ── Step 6: ECB Violations ─────────────────────────────
      setLookupStep("Pulling ECB violations...");
      let ecbViols = [];
      if (bin || (boro && block && lot)) {
        const ecbParams = bin
          ? { "$where": `bin='${bin}'`, "$limit": 50, "$order": "violation_date DESC" }
          : { "$where": `boro='${boro}' AND block='${padBlock(block)}' AND lot='${padLot(lot)}'`, "$limit": 50, "$order": "violation_date DESC" };
        try { ecbViols = await fetchSoda(API.ecbViol, ecbParams); } catch { }
      }

      // ── Store snapshots ─────────────────────────────────────
      const summary = { dob: dobViols, hpd: hpdViols, ecb: ecbViols, complaints: dobComps, permits: dobPerms };
      setViolSummary(summary);
      setAc(p => ({
        ...p,
        dob_violations: JSON.stringify(dobViols.slice(0, 25)),
        hpd_violations: JSON.stringify(hpdViols.slice(0, 25)),
        ecb_violations: JSON.stringify(ecbViols.slice(0, 25)),
        dob_complaints: JSON.stringify(dobComps.slice(0, 25)),
        dob_permits: JSON.stringify(dobPerms.slice(0, 25)),
        last_lookup: new Date().toISOString(),
      }));

      const totalFinds = dobViols.length + hpdViols.length + ecbViols.length + dobComps.length + dobPerms.length;
      setLookupLoading(false); setLookupStep("");
      flash(plutoData
        ? `PLUTO loaded + ${totalFinds} records found across agencies`
        : `No PLUTO data — ${totalFinds} agency records found`, plutoData ? "ok" : "warn"
      );
    } catch (err) {
      setLookupLoading(false); setLookupStep("");
      setLookupError(err.message || "Lookup failed");
      flash("Lookup error: " + (err.message || "unknown"), "warn");
    }
  }

  // ─── Quick Links ───────────────────────────────────────────
  const bbl = (ac.borough && ac.block && ac.lot) ? makeBBL(boroCode(ac.borough), ac.block, ac.lot) : null;
  const quickLinks = [
    { label: "BIS", icon: "🏗", url: getBISUrl(ac.bin_number), tip: "DOB Building Info" },
    { label: "DOB NOW", icon: "📋", url: getDOBNowUrl(ac.bin_number), tip: "DOB NOW Portal" },
    { label: "ZoLa", icon: "🗺", url: bbl ? `https://zola.planning.nyc.gov/lot/${boroCode(ac.borough)}/${padBlock(ac.block)}/${padLot(ac.lot)}` : null, tip: "Zoning & Land Use" },
    { label: "HPD", icon: "🏠", url: getHPDUrl(boroCode(ac.borough), ac.block, ac.lot), tip: "HPD Online" },
    { label: "ACRIS", icon: "📑", url: getACRISUrl(boroCode(ac.borough), ac.block, ac.lot), tip: "Deed/Mortgage Records" },
    { label: "CityPay", icon: "💳", url: getCityPayUrl(), tip: "Pay ECB Penalties" },
  ];

  // ─── Compliance Report Generator ───────────────────────────
  const generateReport = () => {
    const now = new Date().toLocaleDateString("en-US");
    const dobV = JSON.parse(ac.dob_violations || "[]");
    const hpdV = JSON.parse(ac.hpd_violations || "[]");
    const ecbV = JSON.parse(ac.ecb_violations || "[]");
    const dobC = JSON.parse(ac.dob_complaints || "[]");
    const dobP = JSON.parse(ac.dob_permits || "[]");
    const bblStr = bbl || "N/A";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Property Research — ${ac.address || "Report"}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial;color:#1a1a2e;padding:36px 48px;max-width:8.5in;line-height:1.5}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#4f46e5;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #eef2ff}table{width:100%;border-collapse:collapse;margin:8px 0 16px}th{background:#f1f5f9;padding:6px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:2px solid #e2e8f0}td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700}.count{font-size:28px;font-weight:800;font-family:monospace}.label{font-size:10px;text-transform:uppercase;color:#64748b}@media print{body{padding:18px 36px}}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:3px solid #4f46e5;margin-bottom:20px"><div><h1>Property Compliance Report</h1><div style="font-size:11px;color:#64748b">${ac.address || "—"} ${ac.borough ? "· " + ac.borough : ""}</div><div style="font-size:10px;color:#94a3b8;margin-top:2px">BBL: ${bblStr} · BIN: ${ac.bin_number || "N/A"}</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:700">${BES.company}</div><div style="font-size:10px;color:#64748b">${BES.addr} · ${BES.city} ${BES.zip}<br>${BES.phone} · ${BES.email}</div><div style="font-size:10px;color:#94a3b8;margin-top:4px">Report Date: ${now}</div></div></div>

<h2>Property Summary</h2>
<table><tr><th>Field</th><th>Value</th></tr>
<tr><td>Zoning</td><td><strong>${ac.zoning_district || "—"}</strong>${ac.overlay ? " (Overlay: " + ac.overlay + ")" : ""}</td></tr>
<tr><td>Building Class</td><td>${ac.building_class || "—"}</td></tr>
<tr><td>Lot Area</td><td>${ac.lot_area ? Number(ac.lot_area).toLocaleString() + " sq ft" : "—"}</td></tr>
<tr><td>Building Area</td><td>${ac.building_area ? Number(ac.building_area).toLocaleString() + " sq ft" : "—"}</td></tr>
<tr><td>Floors</td><td>${ac.num_floors || "—"}</td></tr>
<tr><td>Units</td><td>${ac.num_units || "—"}</td></tr>
<tr><td>Year Built</td><td>${ac.year_built || "—"}</td></tr>
<tr><td>Owner</td><td>${ac.owner_name || "—"}</td></tr>
<tr><td>FAR (Built / Max)</td><td>${ac.far || "—"} / ${ac.max_far || "—"}</td></tr>
</table>

<div style="display:flex;gap:16px;margin:16px 0">
<div style="flex:1;background:#fef2f2;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #ef4444"><div class="count" style="color:#ef4444">${dobV.length}</div><div class="label">DOB Violations</div></div>
<div style="flex:1;background:#fff7ed;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #f59e0b"><div class="count" style="color:#f59e0b">${hpdV.length}</div><div class="label">HPD Violations</div></div>
<div style="flex:1;background:#eff6ff;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #3b82f6"><div class="count" style="color:#3b82f6">${ecbV.length}</div><div class="label">ECB Violations</div></div>
<div style="flex:1;background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #10b981"><div class="count" style="color:#10b981">${dobP.length}</div><div class="label">DOB Permits</div></div>
</div>

${dobV.length > 0 ? `<h2>DOB Violations (${dobV.length})</h2><table><tr><th>Number</th><th>Type</th><th>Date</th><th>Status</th><th>Description</th></tr>${dobV.slice(0, 15).map(v => `<tr><td style="font-family:monospace">${v.number || v.violation_number || "—"}</td><td>${v.violation_type || "—"}</td><td>${v.issue_date ? new Date(v.issue_date).toLocaleDateString() : "—"}</td><td>${v.violation_type_code || v.disposition_comments || "—"}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.description || v.violation_category || "—"}</td></tr>`).join("")}</table>` : ""}

${hpdV.length > 0 ? `<h2>HPD Violations (${hpdV.length})</h2><table><tr><th>ID</th><th>Class</th><th>Date</th><th>Status</th></tr>${hpdV.slice(0, 15).map(v => `<tr><td style="font-family:monospace">${v.violationid || "—"}</td><td>${v.class || v.violationclass || "—"}</td><td>${v.inspectiondate ? new Date(v.inspectiondate).toLocaleDateString() : "—"}</td><td>${v.currentstatus || v.violationstatus || "—"}</td></tr>`).join("")}</table>` : ""}

${ac.compliance_notes ? `<h2>Compliance Notes</h2><div style="background:#f8fafc;border-radius:8px;padding:14px;font-size:12px;white-space:pre-wrap;border-left:4px solid #4f46e5">${ac.compliance_notes}</div>` : ""}

<div style="margin-top:30px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center">${BES.company} · ${BES.addr} · ${BES.city} ${BES.zip} · ${BES.phone} · ${BES.email}<br>Data sourced from NYC Open Data. Report generated ${now}.</div>
</body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, padding: "12px 20px", borderRadius: 8, color: "#fff", fontSize: 16, fontWeight: 600, zIndex: 2000, boxShadow: "0 4px 12px rgba(0,0,0,.15)", background: toast.t === "warn" ? "#f59e0b" : "#10b981" }}>{toast.m}</div>}

      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: "1px solid #e2e8f0", background: "#fff", flexWrap: "wrap", gap: 12, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, fontFamily: "'Playfair Display',serif" }}>🔍 Property Research</h1>
        <nav style={{ display: "flex", gap: 4 }}>
          {[["dashboard", "Dashboard"], ["editor", ac.id ? "Edit Property" : "New Lookup"], ["reports", "Reports"]].map(([v, l]) =>
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? "#eef2ff" : "transparent", color: view === v ? "#4f46e5" : "#64748b", border: view === v ? "1px solid #c7d2fe" : "1px solid transparent", padding: "8px 16px", borderRadius: 8, fontSize: 16, fontWeight: view === v ? 600 : 500, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
          )}
        </nav>
      </header>

      <main style={{ flex: 1, padding: "20px 24px", maxWidth: 1400, width: "100%", margin: "0 auto" }}>

        {/* ═══════ DASHBOARD ═══════ */}
        {view === "dashboard" && <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stat Cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              ["Properties", stats.t, "#4f46e5"],
              ["With Violations", stats.withViol, "#ef4444"],
              ["Active Permits", stats.withPermits, "#10b981"],
              ["Researching", stats.bd["Researching"] || 0, "#3b82f6"],
              ["Non-Compliant", stats.bd["Non-Compliant"] || 0, "#f59e0b"]
            ].map(([l, v, c], i) =>
              <div key={i} style={{ flex: "1 1 130px", background: "#fff", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${c}`, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                <div style={{ fontSize: 25, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                <div style={{ fontSize: 13, opacity: .5, textTransform: "uppercase", letterSpacing: 1 }}>{l}</div>
              </div>
            )}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={S.inp} placeholder="Search address, owner, BIN..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            <select style={{ ...S.inp, width: "auto" }} value={filters.borough} onChange={e => setFilters(f => ({ ...f, borough: e.target.value }))}>
              <option value="">All Boroughs</option>{BOROUGHS.map(b => <option key={b.code} value={b.label}>{b.label}</option>)}
            </select>
            <select style={{ ...S.inp, width: "auto" }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button style={S.pri} onClick={newRecord}>+ New Property</button>
          </div>

          {/* Table */}
          {loading ? <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading...</div> : filtered.length === 0 ?
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 51 }}>🔍</div>
              <p style={{ fontWeight: 600, marginTop: 12 }}>No properties found</p>
              <button style={S.pri} onClick={newRecord}>+ Start Research</button>
            </div>
            :
            <div style={{ borderRadius: 10, overflow: "auto", border: "1px solid #e2e8f0", background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
                <thead><tr>
                  {[["address", "Address"], ["borough", "Boro"], ["block", "Block"], ["lot", "Lot"], ["zoning_district", "Zoning"], ["owner_name", "Owner"], ["status", "Status"]].map(([k, l]) =>
                    <th key={k} onClick={() => toggleSort(k)} style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", borderBottom: "2px solid #e2e8f0", cursor: "pointer", background: "#f8fafc", whiteSpace: "nowrap" }}>{l}{sortBy === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</th>
                  )}
                  <th style={{ padding: "10px", background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>Viols</th>
                </tr></thead>
                <tbody>{filtered.map(r => {
                  const ss = statusStyle(r.status);
                  const vCount = JSON.parse(r.dob_violations || "[]").length + JSON.parse(r.hpd_violations || "[]").length;
                  return <tr key={r.id} onClick={() => openRecord(r)} style={{ cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(79,70,229,.04)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={S.td}>{r.address || "—"}</td>
                    <td style={S.td}>{r.borough ? BOROUGHS.find(b => b.label === r.borough)?.abbr || r.borough : "—"}</td>
                    <td style={{ ...S.td, fontFamily: "'JetBrains Mono',monospace", fontSize: 15 }}>{r.block || "—"}</td>
                    <td style={{ ...S.td, fontFamily: "'JetBrains Mono',monospace", fontSize: 15 }}>{r.lot || "—"}</td>
                    <td style={S.td}><span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 14, fontWeight: 700, color: "#fff", background: zoningColor(r.zoning_district) }}>{r.zoning_district || "—"}</span></td>
                    <td style={{ ...S.td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.owner_name || "—"}</td>
                    <td style={S.td}><span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 14, fontWeight: 700, background: ss.bg, color: ss.c }}>{r.status}</span></td>
                    <td style={S.td}>{vCount > 0 ? <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 14, fontWeight: 700, background: "#fef2f2", color: "#ef4444", border: "1px solid #ef4444" }}>{vCount}</span> : <span style={{ opacity: .3 }}>0</span>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          }
        </div>}

        {/* ═══════ EDITOR ═══════ */}
        {view === "editor" && <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>

          {/* Sidebar */}
          <aside style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e2e8f0", position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#64748b" }}>Quick Links</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {quickLinks.map(ql => (
                <button key={ql.label}
                  onClick={() => ql.url ? window.open(ql.url, "_blank") : flash("Enter BBL or BIN first", "warn")}
                  style={{ ...S.sec, padding: "10px 8px", fontSize: 14, opacity: ql.url ? 1 : .4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: ql.url ? "pointer" : "not-allowed" }}
                  title={ql.tip}
                >
                  <span style={{ fontSize: 20 }}>{ql.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{ql.label}</span>
                </button>
              ))}
            </div>

            {/* Lookup Counts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#64748b" }}>Agency Data</h3>
              {[
                ["DOB Violations", violSummary.dob.length, "#ef4444", "dob"],
                ["HPD Violations", violSummary.hpd.length, "#f59e0b", "hpd"],
                ["ECB Violations", violSummary.ecb.length, "#8b5cf6", "ecb"],
                ["DOB Complaints", violSummary.complaints.length, "#3b82f6", "complaints"],
                ["DOB Permits", violSummary.permits.length, "#10b981", "permits"],
              ].map(([label, count, color, key]) => (
                <div key={key} onClick={() => count > 0 ? setShowViolPanel(showViolPanel === key ? "" : key) : null}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 6, cursor: count > 0 ? "pointer" : "default", background: showViolPanel === key ? "#eef2ff" : "transparent", borderLeft: `3px solid ${color}` }}>
                  <span style={{ fontSize: 14 }}>{label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 16, color: count > 0 ? color : "#94a3b8" }}>{count}</span>
                </div>
              ))}
            </div>

            {/* Compliance Notes */}
            <div>
              <label style={S.lbl}>Compliance Notes</label>
              <textarea style={{ ...S.inp, minHeight: 100, resize: "vertical", fontSize: 14 }} value={ac.compliance_notes || ""} onChange={e => upd("compliance_notes", e.target.value)} placeholder="Zoning analysis, code compliance findings, filing strategy..." />
            </div>

            {ac.last_lookup && <div style={{ fontSize: 12, opacity: .4, textAlign: "center" }}>Last lookup: {new Date(ac.last_lookup).toLocaleString()}</div>}
          </aside>

          {/* Main Editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Action Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, fontFamily: "'Playfair Display',serif" }}>{ac.id ? "Edit Property" : "New Property Lookup"}</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={{ ...S.pri, background: "linear-gradient(135deg,#0ea5e9,#06b6d4)" }} onClick={runFullLookup} disabled={lookupLoading}>
                  {lookupLoading ? `⏳ ${lookupStep}` : "🔍 Lookup NYC Data"}
                </button>
                <button style={S.sec} onClick={generateReport}>📊 Report</button>
                <button style={S.pri} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "💾 Save"}</button>
                {ac.id && <button style={{ ...S.sec, color: "#ef4444" }} onClick={() => setDelId(ac.id)}>🗑</button>}
              </div>
            </div>

            {lookupError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#dc2626", fontSize: 14 }}>⚠ {lookupError}</div>}

            {/* Violation Detail Panel */}
            {showViolPanel && <ViolationPanel type={showViolPanel} data={violSummary[showViolPanel]} onClose={() => setShowViolPanel("")} />}

            {/* Property Identification */}
            <fieldset style={S.fs}><legend style={S.leg}>Property Identification</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={S.lbl}>Address</label>
                  <input style={{ ...S.inp, fontSize: 18, fontWeight: 600 }} value={ac.address || ""} onChange={e => upd("address", e.target.value)} placeholder="123 Main Street" />
                </div>
                <div>
                  <label style={S.lbl}>Borough</label>
                  <select style={S.inp} value={ac.borough || ""} onChange={e => upd("borough", e.target.value)}>
                    <option value="">—</option>{BOROUGHS.map(b => <option key={b.code} value={b.label}>{b.label}</option>)}
                  </select>
                </div>
                <div><label style={S.lbl}>Block</label><input style={{ ...S.inp, fontFamily: "'JetBrains Mono',monospace" }} value={ac.block || ""} onChange={e => upd("block", e.target.value)} placeholder="00000" /></div>
                <div><label style={S.lbl}>Lot</label><input style={{ ...S.inp, fontFamily: "'JetBrains Mono',monospace" }} value={ac.lot || ""} onChange={e => upd("lot", e.target.value)} placeholder="0000" /></div>
                <div><label style={S.lbl}>BIN</label><input style={{ ...S.inp, fontFamily: "'JetBrains Mono',monospace" }} value={ac.bin_number || ""} onChange={e => upd("bin_number", e.target.value)} placeholder="7 digits" /></div>
                <div><label style={S.lbl}>Zip Code</label><input style={S.inp} value={ac.zip_code || ""} onChange={e => upd("zip_code", e.target.value)} /></div>
              </div>
              {bbl && <div style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>BBL: <strong style={{ fontFamily: "'JetBrains Mono',monospace", color: "#4f46e5" }}>{bbl}</strong></div>}
            </fieldset>

            {/* Zoning & Building */}
            <fieldset style={S.fs}><legend style={S.leg}>Zoning & Building Data</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 }}>
                <div>
                  <label style={S.lbl}>Zoning District</label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input style={{ ...S.inp, fontWeight: 700, fontSize: 17 }} value={ac.zoning_district || ""} onChange={e => upd("zoning_district", e.target.value)} />
                    {ac.zoning_district && <span style={{ width: 14, height: 14, borderRadius: "50%", background: zoningColor(ac.zoning_district), flexShrink: 0 }} />}
                  </div>
                </div>
                <div><label style={S.lbl}>Overlay</label><input style={S.inp} value={ac.overlay || ""} onChange={e => upd("overlay", e.target.value)} /></div>
                <div><label style={S.lbl}>Special District</label><input style={S.inp} value={ac.special_district || ""} onChange={e => upd("special_district", e.target.value)} /></div>
                <div><label style={S.lbl}>Landmark</label><input style={S.inp} value={ac.landmark || ""} onChange={e => upd("landmark", e.target.value)} /></div>
                <div><label style={S.lbl}>Building Class</label><input style={{ ...S.inp, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }} value={ac.building_class || ""} onChange={e => upd("building_class", e.target.value)} /></div>
                <div><label style={S.lbl}>Land Use</label><input style={S.inp} value={ac.land_use || ""} onChange={e => upd("land_use", e.target.value)} /></div>
                <div><label style={S.lbl}>Lot Area (sf)</label><input type="number" style={{ ...S.inp, fontFamily: "mono" }} value={ac.lot_area || ""} onChange={e => upd("lot_area", e.target.value)} /></div>
                <div><label style={S.lbl}>Building Area (sf)</label><input type="number" style={{ ...S.inp, fontFamily: "mono" }} value={ac.building_area || ""} onChange={e => upd("building_area", e.target.value)} /></div>
                <div><label style={S.lbl}>Floors</label><input style={S.inp} value={ac.num_floors || ""} onChange={e => upd("num_floors", e.target.value)} /></div>
                <div><label style={S.lbl}>Res. Units</label><input style={S.inp} value={ac.num_units || ""} onChange={e => upd("num_units", e.target.value)} /></div>
                <div><label style={S.lbl}>Year Built</label><input style={{ ...S.inp, fontFamily: "mono" }} value={ac.year_built || ""} onChange={e => upd("year_built", e.target.value)} /></div>
                <div><label style={S.lbl}>Owner</label><input style={S.inp} value={ac.owner_name || ""} onChange={e => upd("owner_name", e.target.value)} /></div>
                <div><label style={S.lbl}>FAR (Built)</label><input style={{ ...S.inp, fontFamily: "mono" }} value={ac.far || ""} onChange={e => upd("far", e.target.value)} /></div>
                <div><label style={S.lbl}>Max FAR</label><input style={{ ...S.inp, fontFamily: "mono" }} value={ac.max_far || ""} onChange={e => upd("max_far", e.target.value)} /></div>
                <div><label style={S.lbl}>Lot Front (ft)</label><input style={{ ...S.inp, fontFamily: "mono" }} value={ac.lot_frontage || ""} onChange={e => upd("lot_frontage", e.target.value)} /></div>
                <div><label style={S.lbl}>Lot Depth (ft)</label><input style={{ ...S.inp, fontFamily: "mono" }} value={ac.lot_depth || ""} onChange={e => upd("lot_depth", e.target.value)} /></div>
                <div><label style={S.lbl}>Zoning Map</label><input style={S.inp} value={ac.zoning_map || ""} onChange={e => upd("zoning_map", e.target.value)} /></div>
                <div><label style={S.lbl}>Community Dist.</label><input style={S.inp} value={ac.comm_dist || ""} onChange={e => upd("comm_dist", e.target.value)} /></div>
              </div>
            </fieldset>

            {/* Client / Engagement */}
            <fieldset style={S.fs}><legend style={S.leg}>Client & Engagement</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 }}>
                <div><label style={S.lbl}>Status</label><select style={S.inp} value={ac.status || "Researching"} onChange={e => upd("status", e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label style={S.lbl}>Engagement Type</label><input style={S.inp} value={ac.engagement_type || ""} onChange={e => upd("engagement_type", e.target.value)} placeholder="Zoning, Filing, Compliance..." /></div>
                <div><label style={S.lbl}>Client Name</label><input style={S.inp} value={ac.client_name || ""} onChange={e => upd("client_name", e.target.value)} /></div>
                <div><label style={S.lbl}>Client Phone</label><input style={S.inp} value={ac.client_phone || ""} onChange={e => upd("client_phone", e.target.value)} /></div>
                <div style={{ gridColumn: "span 2" }}><label style={S.lbl}>Client Email</label><input style={S.inp} value={ac.client_email || ""} onChange={e => upd("client_email", e.target.value)} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={S.lbl}>Research Summary</label>
                <textarea style={{ ...S.inp, minHeight: 70, resize: "vertical" }} value={ac.research_summary || ""} onChange={e => upd("research_summary", e.target.value)} placeholder="Scope of engagement, key findings, next steps..." />
              </div>
            </fieldset>

            {/* Audit Trail */}
            {ac.id && (() => {
              const l = JSON.parse(ac.audit_log || "[]");
              return l.length > 0 ? <fieldset style={S.fs}><legend style={S.leg}>Audit Trail</legend>{l.slice(-10).reverse().map((e, i) => <div key={i} style={{ fontSize: 15, opacity: .6, fontFamily: "mono" }}><span style={{ color: "#4f46e5" }}>{e.a}</span> — {new Date(e.t).toLocaleString()}</div>)}</fieldset> : null;
            })()}
          </div>
        </div>}

        {/* ═══════ REPORTS ═══════ */}
        {view === "reports" && <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, fontFamily: "'Playfair Display',serif" }}>Research Analytics</h2>

          {/* Status Breakdown */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {STATUSES.map(s => {
              const ss = statusStyle(s);
              return <div key={s} style={{ flex: "1 1 100px", background: "#fff", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${ss.bg}`, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                <div style={{ fontSize: 25, fontWeight: 800, fontFamily: "mono" }}>{stats.bd[s] || 0}</div>
                <div style={{ fontSize: 13, opacity: .5, textTransform: "uppercase" }}>{s}</div>
              </div>;
            })}
          </div>

          {/* Borough Breakdown */}
          <fieldset style={S.fs}>
            <legend style={S.leg}>By Borough</legend>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
              {BOROUGHS.map(b => (
                <div key={b.code} style={{ flex: "1 1 80px", textAlign: "center" }}>
                  <div style={{ fontSize: 31, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "#4f46e5" }}>{stats.boroCounts[b.label] || 0}</div>
                  <div style={{ fontSize: 13, opacity: .5, textTransform: "uppercase" }}>{b.abbr}</div>
                </div>
              ))}
            </div>
          </fieldset>

          {/* Summary Stats */}
          <div style={{ ...S.fs, display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, opacity: .5, textTransform: "uppercase", marginBottom: 4 }}>Total Properties</div>
              <div style={{ fontSize: 31, fontWeight: 800, color: "#4f46e5", fontFamily: "mono" }}>{stats.t}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, opacity: .5, textTransform: "uppercase", marginBottom: 4 }}>With Violations</div>
              <div style={{ fontSize: 31, fontWeight: 800, color: "#ef4444", fontFamily: "mono" }}>{stats.withViol}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, opacity: .5, textTransform: "uppercase", marginBottom: 4 }}>Active Permits</div>
              <div style={{ fontSize: 31, fontWeight: 800, color: "#10b981", fontFamily: "mono" }}>{stats.withPermits}</div>
            </div>
          </div>
        </div>}
      </main>

      {/* Delete Modal */}
      {delId && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDelId(null)}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }} onClick={e => e.stopPropagation()}>
          <h3>Delete this property?</h3><p style={{ opacity: .6 }}>Cannot be undone.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button style={S.sec} onClick={() => setDelId(null)}>Cancel</button>
            <button style={{ ...S.pri, background: "#ef4444" }} onClick={() => handleDel(delId)}>Delete</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ─── Violation Detail Panel ──────────────────────────────
function ViolationPanel({ type, data, onClose }) {
  const titles = { dob: "DOB Violations", hpd: "HPD Violations", ecb: "ECB Violations", complaints: "DOB Complaints", permits: "DOB Permits" };
  const colors = { dob: "#ef4444", hpd: "#f59e0b", ecb: "#8b5cf6", complaints: "#3b82f6", permits: "#10b981" };

  return (
    <div style={{ ...S.panel, borderTop: `3px solid ${colors[type]}`, maxHeight: 400, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: colors[type], fontSize: 17, fontWeight: 700 }}>{titles[type]} ({data.length})</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" }}>✕</button>
      </div>
      {data.length === 0 ? <p style={{ opacity: .5 }}>No records found.</p> :
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr>
            {type === "dob" && <><th style={S.th}>Number</th><th style={S.th}>Type</th><th style={S.th}>Date</th><th style={S.th}>Description</th></>}
            {type === "hpd" && <><th style={S.th}>ID</th><th style={S.th}>Class</th><th style={S.th}>Date</th><th style={S.th}>Status</th></>}
            {type === "ecb" && <><th style={S.th}>Number</th><th style={S.th}>Type</th><th style={S.th}>Date</th><th style={S.th}>Penalty</th></>}
            {type === "complaints" && <><th style={S.th}>Number</th><th style={S.th}>Category</th><th style={S.th}>Date</th><th style={S.th}>Status</th></>}
            {type === "permits" && <><th style={S.th}>Job #</th><th style={S.th}>Type</th><th style={S.th}>Date</th><th style={S.th}>Status</th></>}
          </tr></thead>
          <tbody>{data.slice(0, 25).map((v, i) => (
            <tr key={i}>
              {type === "dob" && <><td style={S.td2}>{v.number || v.violation_number || "—"}</td><td style={S.td2}>{v.violation_type || "—"}</td><td style={S.td2}>{v.issue_date ? new Date(v.issue_date).toLocaleDateString() : "—"}</td><td style={{ ...S.td2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.description || v.violation_category || "—"}</td></>}
              {type === "hpd" && <><td style={S.td2}>{v.violationid || "—"}</td><td style={S.td2}>{v.class || v.violationclass || "—"}</td><td style={S.td2}>{v.inspectiondate ? new Date(v.inspectiondate).toLocaleDateString() : "—"}</td><td style={S.td2}>{v.currentstatus || v.violationstatus || "—"}</td></>}
              {type === "ecb" && <><td style={S.td2}>{v.isn_dob_bis_extract || v.ecb_violation_number || "—"}</td><td style={S.td2}>{v.violation_type || "—"}</td><td style={S.td2}>{v.violation_date ? new Date(v.violation_date).toLocaleDateString() : "—"}</td><td style={S.td2}>{v.penalty_balance_due || v.penalty_applied || "—"}</td></>}
              {type === "complaints" && <><td style={S.td2}>{v.complaint_number || "—"}</td><td style={S.td2}>{v.complaint_category || "—"}</td><td style={S.td2}>{v.date_entered ? new Date(v.date_entered).toLocaleDateString() : "—"}</td><td style={S.td2}>{v.status || "—"}</td></>}
              {type === "permits" && <><td style={S.td2}>{v.job__ || v.job_number || "—"}</td><td style={S.td2}>{v.job_type || "—"}</td><td style={S.td2}>{v.filing_date ? new Date(v.filing_date).toLocaleDateString() : "—"}</td><td style={S.td2}>{v.filing_status || v.current_status_date || "—"}</td></>}
            </tr>
          ))}</tbody>
        </table>
      }
    </div>
  );
}

// ─── Shared Styles ───────────────────────────────────────
const S = {
  inp: { width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1e293b", fontSize: 16, fontFamily: "inherit", outline: "none" },
  lbl: { display: "block", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 4 },
  pri: { display: "inline-flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", border: "none", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", boxShadow: "0 2px 4px rgba(79,70,229,.25)" },
  sec: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", color: "#334155", padding: "10px 18px", borderRadius: 8, fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  fs: { border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
  leg: { fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "0 8px", color: "#4f46e5" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9" },
  td2: { padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontSize: 14 },
  th: { padding: "8px 10px", textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
};
