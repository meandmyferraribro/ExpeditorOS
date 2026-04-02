import { useState, useEffect, useCallback, useMemo } from 'react';
import { PDFDocument } from 'pdf-lib';
import { createStorage } from '../lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   OATH/ECB Court CRM Widget — ExpeditorOS
   Building Expediting Systems, Inc.
   All data persists via Supabase + localStorage
   ═══════════════════════════════════════════════════════════════ */

const BES = { rep: "SHAHID SIDDIQI", company: "Building Expediting Systems, Inc.", addr: "71-58 Austin St, Suite 207A", city: "Forest Hills, NY", zip: "11375", phone: "718-291-8555", email: "shawn@buildingexpeditingsystems.com", zelle: "917-670-9734" };
const storage = createStorage('ecb_cases');
const DECISIONS = ["Pending", "Granted", "Denied", "Settled", "Adjourned", "Dismissed"];
const AGENCIES = ["DOB", "ECB", "FDNY", "DOT", "DEP", "DSNY", "DOH", "HPD", "Other"];

const EMPTY = { id: null, issuing_agency: "", violation_number: "", respondent_name: "", hearing_date: "", cure_date: "", date_violation_issued: "", section_of_law: "", provision_of_law: "", violation_category: "", violation_description: "", penalty_amount: "", premises_address: "", mailing_address: "", bin_number: "", block: "", lot: "", decision: "Pending", notes: "", defense_notes: "", settlement_amount: "", settlement_notes: "", client_phone: "", client_email: "", invoice_lines: "[]", retainer_amount: "", invoice_due_days: "30", app_links: "[]", photos: "[]", supporting_docs: "[]", audit_log: "[]" };

// ─── Helpers ─────────────────────────────────────────────────
const daysUntil = d => { if (!d) return null; return Math.ceil((new Date(d) - new Date()) / 864e5); };
const urgClr = d => d === null ? "#6b7280" : d < 0 ? "#ef4444" : d <= 7 ? "#f59e0b" : d <= 30 ? "#3b82f6" : "#10b981";
const urgLbl = d => d === null ? "No Date" : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "TODAY" : `${d}d left`;
const decStyle = d => ({ Granted:{bg:"#10b981",c:"#fff"}, Dismissed:{bg:"#06b6d4",c:"#fff"}, Denied:{bg:"#ef4444",c:"#fff"}, Settled:{bg:"#3b82f6",c:"#fff"}, Adjourned:{bg:"#f59e0b",c:"#1a1a2e"}, Pending:{bg:"#374151",c:"#d1d5db"} }[d] || {bg:"#374151",c:"#d1d5db"});
const fmtMoney = n => `$${(parseFloat(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// ─── AI Defense (fallback — rule-based) ──────────────────────
function getDefenses(agency) {
  const a = (agency||"").toLowerCase();
  if (a.includes("dob")||a.includes("building")) return [
    { title:"Licensed Contractor", explanation:"Work performed by licensed contractor.", evidence:"License, insurance, contract" },
    { title:"Cure Before Hearing", explanation:"Violation corrected before hearing.", evidence:"Photos, affidavit, sign-off" },
    { title:"Routine Maintenance", explanation:"Work is ordinary maintenance per AC 28-105.4.", evidence:"Scope docs, photos" },
    { title:"Statute of Limitations", explanation:"Issued beyond limitations period.", evidence:"Timeline documentation" },
    { title:"Improper Service", explanation:"Not properly served per OATH rules.", evidence:"Service records" },
    { title:"No Hazard", explanation:"No immediate safety hazard.", evidence:"Engineer report, photos" },
  ];
  return [
    { title:"Improper Respondent", explanation:"Named respondent not responsible.", evidence:"Deed, lease, mgmt agreement" },
    { title:"Self-Corrected", explanation:"Violation cured before enforcement.", evidence:"Cure docs, reports" },
    { title:"Excessive Penalty", explanation:"Penalty disproportionate.", evidence:"Comparable cases" },
    { title:"Good Faith", explanation:"Good faith compliance effort.", evidence:"Permit apps, invoices" },
    { title:"Insufficient Evidence", explanation:"Burden of proof not met.", evidence:"Inspector photos" },
    { title:"Force Majeure", explanation:"Compliance prevented by uncontrollable circumstances.", evidence:"Weather records" },
  ];
}

// ─── Address Parser ──────────────────────────────────────────
// Splits "68-04 79TH ST. FLUSHING, NY 11379-2923" into { street, cityState, zip }
function parseMailingAddress(addr) {
  if (!addr) return { street: "", cityState: "", zip: "" };
  const raw = addr.trim();
  
  // 1. Extract zip code from end (5 digits or 5+4)
  const zipMatch = raw.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
  const zip = zipMatch ? zipMatch[1] : "";
  const noZip = raw.replace(/\s*\d{5}(?:-\d{4})?\s*$/, "").trim();
  
  // 2. Find state abbreviation (2 uppercase letters at end)
  // Handles: "FLUSHING, NY" or "NEW YORK NY" or "KINGSTON, NY"
  const stateMatch = noZip.match(/,?\s*([A-Z]{2})\s*$/);
  if (stateMatch) {
    const state = stateMatch[1];
    const beforeState = noZip.replace(/,?\s*[A-Z]{2}\s*$/, "").trim();
    
    // 3. Find city — last segment before state, separated by comma or period+space
    // "68-04 79TH ST. FLUSHING" → split on ". " or ", "
    // "2-4 KIEFFER LN, KINGSTON" → split on ", "
    const lastSep = Math.max(
      beforeState.lastIndexOf(", "),
      beforeState.lastIndexOf(". "),
      beforeState.lastIndexOf(","),
      beforeState.lastIndexOf(". ")
    );
    
    if (lastSep > 0) {
      const street = beforeState.substring(0, lastSep).trim().replace(/[.,]+$/, "");
      const city = beforeState.substring(lastSep + 1).trim().replace(/^[.,\s]+/, "");
      return { street, cityState: `${city}, ${state}`, zip };
    } else {
      // No separator found — whole thing might be just a city or just a street
      return { street: beforeState, cityState: state, zip };
    }
  }
  
  // 4. Fallback: try splitting on last comma
  const lastComma = noZip.lastIndexOf(",");
  if (lastComma > 0) {
    return {
      street: noZip.substring(0, lastComma).trim(),
      cityState: noZip.substring(lastComma + 1).trim(),
      zip
    };
  }
  
  // 5. No parsing possible — put everything in street
  return { street: noZip, cityState: "", zip };
}

// ═══════════════════════════════════════════════════════════════
export default function OathEcbCRM() {
  const [view, setView] = useState("dashboard");
  const [cases, setCases] = useState([]);
  const [ac, setAc] = useState({...EMPTY});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiDefs, setAiDefs] = useState([]);
  const [filters, setFilters] = useState({ agency: "", decision: "", search: "" });
  const [sortBy, setSortBy] = useState("hearing_date");
  const [sortDir, setSortDir] = useState("asc");
  const [delId, setDelId] = useState(null);
  const [toast, setToast] = useState(null);
  const [showGN4, setShowGN4] = useState(false);
  const [showInv, setShowInv] = useState(false);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfName, setPdfName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [customGN4, setCustomGN4] = useState(null);
  const [showHearingPicker, setShowHearingPicker] = useState(false);

  // Invoice lines from case record
  const invLines = JSON.parse(ac.invoice_lines || "[]");
  const setInvLines = (fn) => {
    const current = JSON.parse(ac.invoice_lines || "[]");
    const updated = typeof fn === "function" ? fn(current) : fn;
    setAc(p => ({...p, invoice_lines: JSON.stringify(updated)}));
  };
  const addInvLine = (desc, amt) => setInvLines(p => [...p, {id:crypto.randomUUID(), description:desc, amount:amt||""}]);
  const updateInvLine = (id, field, val) => setInvLines(p => p.map(l => l.id===id ? {...l,[field]:val} : l));
  const removeInvLine = (id) => setInvLines(p => p.filter(l => l.id !== id));
  const invTotal = invLines.reduce((s,l) => s+(parseFloat(l.amount)||0), 0);

  const addCaseAsLine = () => {
    const parts = [ac.violation_number, ac.issuing_agency, ac.hearing_date ? `Hearing: ${ac.hearing_date}` : "", ac.premises_address].filter(Boolean).join(" | ");
    addInvLine(`Court Appearance — ${parts}`, "");
  };

  // ─── Load cases ────────────────────────────────────────────
  useEffect(() => { (async () => { setCases(await storage.getAll()); setLoading(false); })(); }, []);

  const flash = useCallback((m, t="ok") => { setToast({m,t}); setTimeout(()=>setToast(null), 3000); }, []);

  const filtered = useMemo(() => {
    let l = [...cases];
    if (filters.agency) l = l.filter(c => c.issuing_agency === filters.agency);
    if (filters.decision) l = l.filter(c => c.decision === filters.decision);
    if (filters.search) { const s = filters.search.toLowerCase(); l = l.filter(c => [c.violation_number,c.respondent_name,c.premises_address,c.violation_description].some(v => (v||"").toLowerCase().includes(s))); }
    l.sort((a,b) => { let va=a[sortBy]||"", vb=b[sortBy]||""; return va < vb ? (sortDir==="asc"?-1:1) : va > vb ? (sortDir==="asc"?1:-1) : 0; });
    return l;
  }, [cases, filters, sortBy, sortDir]);

  const stats = useMemo(() => {
    const t=cases.length, bd={}; DECISIONS.forEach(d=>bd[d]=0);
    let tp=0, ts=0, up=0;
    cases.forEach(c => { bd[c.decision]=(bd[c.decision]||0)+1; tp+=parseFloat(c.penalty_amount)||0; ts+=parseFloat(c.settlement_amount)||0; const d=daysUntil(c.hearing_date); if(d!==null&&d>=0&&d<=30)up++; });
    return { t, bd, tp, ts, up, wr: t>0 ? (((bd.Granted||0)+(bd.Dismissed||0))/t*100).toFixed(1) : "0.0" };
  }, [cases]);

  // ─── CRUD — saves EVERYTHING ───────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    const saved = await storage.save({...ac});
    setCases(p => { const i=p.findIndex(c=>c.id===saved.id); if(i>=0){const n=[...p];n[i]=saved;return n;} return [saved,...p]; });
    setAc(saved);
    setSaving(false);
    flash("Case saved — all data persisted");
  };

  const handleDel = async id => { await storage.remove(id); setCases(p=>p.filter(c=>c.id!==id)); setDelId(null); if(ac.id===id){setAc({...EMPTY});setView("dashboard");} flash("Deleted","warn"); };
  const openCase = c => { setAc({...EMPTY,...c}); setAiDefs([]); setShowGN4(false); setShowInv(false); setView("editor"); };
  const newCase = () => { setAc({...EMPTY}); setAiDefs([]); setShowGN4(false); setShowInv(false); setView("editor"); };
  const upd = (f,v) => setAc(p=>({...p,[f]:v}));
  const toggleSort = col => { if(sortBy===col) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortBy(col); setSortDir("asc"); } };

  // ─── Hearing dates for hearing list doc ────────────────────
  const hearingDates = useMemo(() => {
    const dates = {};
    cases.forEach(c => { if(c.hearing_date && c.decision==="Pending"){ if(!dates[c.hearing_date])dates[c.hearing_date]=[]; dates[c.hearing_date].push(c); } });
    return Object.entries(dates).sort((a,b)=>a[0].localeCompare(b[0]));
  }, [cases]);

  function generateHearingDoc(date) {
    const dateCases = cases.filter(c => c.hearing_date === date);
    const formatted = new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
    const filename = `${formatted.replace(/\//g,"_")}_HEARING_REQUESTS.doc`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial;font-size:11pt}table{border-collapse:collapse;width:100%;margin-top:12pt}th{background:#D9E2F3;font-weight:bold;padding:6pt 10pt;border:1px solid #000;text-align:left}td{padding:6pt 10pt;border:1px solid #000}h2{font-size:14pt}</style></head><body><h2>${formatted} HEARING REQUESTS</h2><p style="font-size:10pt;color:#555">OATH Hearings Division — ${BES.company} | Rep: ${BES.rep} | ${BES.phone} | Total: ${dateCases.length}</p><table><tr><th>Summons #</th><th>Respondent Name</th></tr>${dateCases.map(c=>`<tr><td>${c.violation_number||""}</td><td>${c.respondent_name||""}</td></tr>`).join("")}${"<tr><td>&nbsp;</td><td>&nbsp;</td></tr>".repeat(Math.max(0,12-dateCases.length))}</table></body></html>`;
    const blob = new Blob([html],{type:"application/msword"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
    setShowHearingPicker(false); flash(`Downloaded ${filename}`);
  }

  // ─── PDF OCR Parser ────────────────────────────────────────
  async function handlePdfDrop(e) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) { flash("Drop a PDF file","warn"); return; }
    setPdfName(file.name); setPdfParsing(true); setParseStatus("Reading PDF...");
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const arrayBuf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data:new Uint8Array(arrayBuf)}).promise;
      let fullText = "";
      // Try text extraction first
      for (let i=1; i<=pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = content.items.filter(it=>it.str.trim().length>0);
        items.sort((a,b)=>{const yd=b.transform[5]-a.transform[5];if(Math.abs(yd)>3)return yd>0?-1:1;return a.transform[4]-b.transform[4];});
        let lines=[],cur=items.length>0?[items[0]]:[],lastY=items.length>0?items[0].transform[5]:0;
        for(let j=1;j<items.length;j++){if(Math.abs(items[j].transform[5]-lastY)>3){lines.push(cur.map(it=>it.str).join(" "));cur=[items[j]];lastY=items[j].transform[5];}else cur.push(items[j]);}
        if(cur.length>0)lines.push(cur.map(it=>it.str).join(" "));
        fullText+=lines.join("\n")+"\n";
      }
      const meaningful = fullText.replace(/NYCServ.*?Copy/gi,"").replace(/Internet/gi,"").replace(/\d{9,12}[A-Z]?/g,"").trim();
      // OCR fallback if image-based
      if (meaningful.length < 100) {
        setParseStatus("Image PDF — running OCR (15-30s)...");
        const page = await pdf.getPage(1);
        const vp = page.getViewport({scale:2.5});
        const canvas = document.createElement("canvas"); canvas.width=vp.width; canvas.height=vp.height;
        await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
        const Tesseract = (await import('tesseract.js')).default;
        const ocr = await Tesseract.recognize(canvas,"eng",{logger:m=>{if(m.status==="recognizing text")setParseStatus(`OCR: ${Math.round((m.progress||0)*100)}%`);}});
        fullText = ocr.data.text;
      }
      const parsed = parseViolation(fullText);
      const count = Object.values(parsed).filter(v=>v).length;
      if (count === 0) { setAc(p=>({...p,notes:(p.notes?p.notes+"\n\n":"")+"--- RAW PDF ---\n"+fullText.substring(0,3000)})); }
      else { setAc(p=>{const u={...p};Object.entries(parsed).forEach(([k,v])=>{if(v)u[k]=String(v);});return u;}); }
      setPdfParsing(false); setParseStatus("");
      flash(count > 0 ? `Extracted ${count} fields!` : "Text in Notes — check manually", count>0?"ok":"warn");
    } catch(err) { setPdfParsing(false); setParseStatus(""); flash("PDF error: "+(err.message||"unknown"),"warn"); }
  }

  function parseViolation(rawText) {
    const text=rawText.replace(/\r/g,""), flat=text.replace(/\n/g," ").replace(/\s+/g," "), lines=text.split("\n").map(l=>l.trim()).filter(l=>l.length>0);
    const r = {issuing_agency:"",violation_number:"",respondent_name:"",hearing_date:"",cure_date:"",date_violation_issued:"",section_of_law:"",violation_category:"",violation_description:"",penalty_amount:"",premises_address:"",mailing_address:"",bin_number:"",block:"",lot:""};
    // Agency
    if(/dept?\s*\.?\s*of\s*buildings|DOB\b|BUILDINGS/i.test(flat))r.issuing_agency="DOB";
    else if(/environmental\s*control|ECB/i.test(flat))r.issuing_agency="ECB";
    else if(/fire\s*dep|FDNY/i.test(flat))r.issuing_agency="FDNY";
    else if(/dept?\s*\.?\s*of\s*transp|DOT\b/i.test(flat))r.issuing_agency="DOT";
    else if(/environmental\s*protect|DEP\b/i.test(flat))r.issuing_agency="DEP";
    else if(/sanitation|DSNY/i.test(flat))r.issuing_agency="DSNY";
    else if(/health|DOH|DOHMH/i.test(flat))r.issuing_agency="DOH";
    else if(/housing\s*pres|HPD/i.test(flat))r.issuing_agency="HPD";
    // Summons #
    let vm=flat.match(/(?:summons|violation)\s*(?:#|number|no\.?)?\s*[:.]?\s*(\d{8,12}[A-Z]?)/i);
    if(!vm)vm=flat.match(/\b(\d{9,12}[A-Z])\b/); if(!vm)vm=flat.match(/\b(\d{9,12})\b/);
    if(vm)r.violation_number=vm[1];
    // Respondent
    let rm=flat.match(/RESPONDENT\s*[:.]?\s*([A-Z][A-Za-z\s,.\-&'()0-9]+?)(?=\s*\(?FIRST|\s*MAILING|\s*DOB\s*LIC|\s*DATE\s*OF|\s*DBA|\s*ID\s*NUM)/i);
    if(!rm)rm=flat.match(/RESPONDENT\s*[:.]?\s*([A-Z][A-Za-z\s,.\-&'()0-9]{2,60}?)(?=\s{2,}|\n)/i);
    if(rm)r.respondent_name=rm[1].trim().replace(/\s+/g," ");
    // Date helper
    const toDate=s=>{if(!s)return"";let m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);if(m)return`${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;return"";};
    // Dates
    let hm=flat.match(/HEARING\s*DATE\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i); if(hm)r.hearing_date=toDate(hm[1]);
    let cm=flat.match(/(?:CURE\s*DATE|COMPLIANCE\s*DATE)\s*.*?[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i); if(cm)r.cure_date=toDate(cm[1]);
    let dm=flat.match(/DATE\s*OF\s*(?:OCCURRENCE|VIOLATION|INSPECTION)\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i); if(dm)r.date_violation_issued=toDate(dm[1]);
    // Address
    let am=flat.match(/PLACE\s*OF\s*OCCURRENCE\s*[:.]?\s*(.+?)(?=BLOCK|LOT|BIN|BOROUGH|\s{3,}|TIME\s*OF|$)/i);
    if(am){let a=am[1].trim().replace(/\s+/g," ").replace(/\s*(BLOCK|LOT|BIN|BOROUGH|TIME|DATE|HEARING).*$/i,"").trim();if(a.length>3)r.premises_address=a;}
    // Mailing address
    let ma=flat.match(/MAILING\s*ADDRESS\s*[:.]?\s*(.+?)(?=\s*(?:DBA|ACCOUNT|ID\s*NUM|UNIT\s*PHONE|CELL\s*PHONE|DOB\s*LIC|DATE\s*OF|TYPE\s*OF|RESPONDENT))/i);
    if(ma)r.mailing_address=ma[1].trim().replace(/\s+/g," ");
    // Block/Lot/BIN
    let blk=flat.match(/BLOCK\s*[:.]?\s*(\d{3,5})/i);if(blk)r.block=blk[1];
    let lot=flat.match(/LOT\s*[:.]?\s*(\d{2,5})/i);if(lot)r.lot=lot[1];
    let bin=flat.match(/BIN\s*[:.]?\s*(\d{7})/i);if(bin)r.bin_number=bin[1];
    // Borough
    const boroMap={mn:"Manhattan",manhattan:"Manhattan",qn:"Queens",queens:"Queens",bk:"Brooklyn",brooklyn:"Brooklyn",bx:"Bronx",bronx:"Bronx",si:"Staten Island"};
    let boro=flat.match(/BOROUGH\s*[:.]?\s*([A-Za-z\s]+?)(?=\s{2,}|$|\n|DATE|TIME|HEARING)/i);
    if(boro){const bn=boroMap[(boro[1].trim().toLowerCase())]||boro[1].trim();if(r.premises_address&&!r.premises_address.toLowerCase().includes(bn.toLowerCase()))r.premises_address+=", "+bn;}
    // Infraction Code (Provision of Law)
    for(let i=0;i<lines.length;i++){if(/provision\s*of\s*law/i.test(lines[i])){const provLine=lines.slice(i,Math.min(i+3,lines.length)).join(" ");const pc=provLine.match(/\b(\d{1,3}-\d{1,4}\.?\d{0,3})\b/);if(pc)r.section_of_law=pc[1];break;}}
    if(!r.section_of_law){let ic=flat.match(/(?:INFRACTION\s*CODE|Infraction\s*Code)\s*[:.]?\s*([\w\-.\s]+?)(?=\s{2,}|Idling|Failure|Violation|$)/i);if(ic)r.section_of_law=ic[1].trim();}
    let rcny=flat.match(/(\d?\s*RCNY\s*\d+[\-.]?\d*)/i);if(rcny&&!r.section_of_law)r.section_of_law=rcny[1].replace(/\s+/g," ");
    // Violation Category
    const vcCodes=[...flat.matchAll(/\b(VC\d{1,3})\b/gi)];
    if(vcCodes.length>0)r.violation_category=[...new Set(vcCodes.map(m=>m[1].toUpperCase()))].join(", ");
    if(!r.violation_category){let dc=flat.match(/\b([A-Z]\d{3,4})\b(?=\s*Class\s*\d)/i);if(dc)r.violation_category=dc[1].toUpperCase();}
    // Penalty
    let pm=flat.match(/(?:standard|default|scheduled|minimum)\s*penalty\s*[:.]?\s*\$?\s*([\d,]+)/i);
    if(!pm)pm=flat.match(/(?:maximum\s*penalty\s*(?:for\s*each\s*)?(?:first\s*offense)?)\s*[:.]?\s*\$?\s*([\d,]+)/i);
    if(!pm)pm=flat.match(/\$([\d,]+)/);
    if(pm)r.penalty_amount=pm[1].replace(/,/g,"");
    // Description
    let vd=flat.match(/Violation\s*Detail\s*\(s\)\s*[:.]?\s*(.{10,800}?)(?=\s*(?:Remedy|THE\s*COMMISSIONER|I,\s*an|NYC\s*Charter|Page\s*\d))/i);
    if(!vd)vd=flat.match(/DESCRIPTION\s*OF\s*VIOLATION\s*[:.]?\s*(.{10,800}?)(?=\s*(?:EQUIPMENT|SECOND|Note|NYC\s*Charter|I,\s*an|Signature))/i);
    if(!vd)vd=flat.match(/Details\s*of\s*Violation\s*(?:\(s\))?\s*[:.]?\s*(.{10,800}?)(?=\s*(?:Maximum|Signature|Name\s*:|I,\s*an))/i);
    if(vd){let desc=vd[1].trim().replace(/\s+/g," ").replace(/\s*(?:Remedy|EQUIPMENT|Maximum|Signature).*$/i,"").replace(/SEE\s*SUPPLEMENT\s*ATTACHED/gi,"").trim();if(desc.length>5)r.violation_description=desc.substring(0,600);}
    // FDNY VC table details
    if(!r.violation_description||r.violation_description.length<20){const vcs=[];const vr=/\b(VC\d{1,3})\s+([A-Z][A-Z\s,&]+?)(?=\bVC\d|Description|Maximum|Signature|$)/gi;let m2;while((m2=vr.exec(flat))!==null){const d=m2[2].trim();if(d.length>3)vcs.push(`${m2[1]}: ${d}`);}if(vcs.length>0)r.violation_description=vcs.join("; ");}
    // Fallback dates
    if(!r.hearing_date){const all=[...flat.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g)];const future=all.map(m=>({d:`${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`,diff:daysUntil(`${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`)})).filter(x=>x.diff>0).sort((a,b)=>a.diff-b.diff);if(future.length>0)r.hearing_date=future[0].d;}
    return r;
  }

  // ─── GN4 PDF Filler ────────────────────────────────────────
  const fillGN4 = async () => {
    try {
      flash("Generating GN4...");
      const pdfBytes = customGN4 ? new Uint8Array(customGN4) : new Uint8Array(await (await fetch('/gn4-template.pdf')).arrayBuffer());
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      const sf = (id,val) => { try{form.getTextField(id).setText(val||"");}catch(e){} };
      const sr = (id,val) => { try{form.getRadioGroup(id).select(val);}catch(e){} };
      // Notice info
      sf("undefined", ac.respondent_name);
      sr("Group1", "/Choice2");
      // Person authorizing
      sf("Your name", ac.respondent_name);
      const addrParsed = parseMailingAddress(ac.mailing_address || ac.premises_address || "");
      sf("Your mailing address", addrParsed.street);
      sf("City State", addrParsed.cityState);
      sf("Zip Code", addrParsed.zip);
      sf("Telephone Number", ac.client_phone); sf("Email Address", ac.client_email);
      sr("Group2", "/Choice1");
      // Rep info
      sf("Registered Representative or attorney's name", BES.rep);
      sf("Business mailing address", BES.addr.toUpperCase());
      sf("City State_2", BES.city.toUpperCase()); sf("Zip Code_2", BES.zip);
      sf("Telephone Number_2", BES.phone); sf("Email Address_2", BES.email);
      // Auth statement
      sf("your name", ac.respondent_name);
      sf("insert name of registered representative or attorney", BES.rep);
      sf("registered representative or attorney", BES.rep);
      sr("Group4","/Choice1");sr("Group5","/Choice1");sr("Group6","/Choice1");sr("Group7","/Choice1");sr("Group8","/Choice1");sr("Group9","/Choice1");
      sf("Date1_af_date", new Date().toLocaleDateString("en-US"));
      form.flatten();
      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes],{type:"application/pdf"});
      const a = document.createElement("a");
      a.href=URL.createObjectURL(blob);a.download=`GN4_${(ac.respondent_name||"FORM").replace(/[^A-Za-z0-9]/g,"_").substring(0,30)}.pdf`;a.click();
      flash("GN4 downloaded!");
    } catch(err) { flash("GN4 error: "+(err.message||"unknown"),"warn"); }
  };

  // ─── Calendar Sync ─────────────────────────────────────────
  const syncToCalendar = () => {
    if(!ac.hearing_date){flash("Set hearing date first","warn");return;}
    const same=cases.filter(c=>c.hearing_date===ac.hearing_date&&c.decision==="Pending");
    if(!same.find(c=>c.id===ac.id)&&ac.respondent_name)same.push(ac);
    let title,details;
    if(same.length<=1){title=`OATH Hearing: ${ac.respondent_name||"TBD"}`;details=`Respondent: ${ac.respondent_name}\nViolation: ${ac.violation_number}\nAgency: ${ac.issuing_agency}\nPremises: ${ac.premises_address}\nRep: ${BES.rep} ${BES.phone}`;}
    else{title=`OATH Hearings (${same.length}) — ${BES.company}`;details=same.map((c,i)=>`${i+1}. ${c.respondent_name} — ${c.violation_number} (${c.issuing_agency})`).join("\n")+`\n\nRep: ${BES.rep} ${BES.phone}`;}
    const d=ac.hearing_date.replace(/-/g,"");const nd=new Date(ac.hearing_date);nd.setDate(nd.getDate()+1);const d2=nd.toISOString().split("T")[0].replace(/-/g,"");
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${d}/${d2}&details=${encodeURIComponent(details)}&location=${encodeURIComponent("OATH, 66 John St, New York NY 10038")}`,"_blank");
    flash("Calendar opened");
  };

  // ─── Email with .eml attachments ───────────────────────────
  const emailClient = async () => {
    if(!ac.client_email){flash("Enter client email first","warn");return;}
    flash("Building email...");
    try {
      // GN4
      const pdfBytes = customGN4 ? new Uint8Array(customGN4) : new Uint8Array(await (await fetch('/gn4-template.pdf')).arrayBuffer());
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      const sf=(id,v)=>{try{form.getTextField(id).setText(v||"");}catch(e){}};const sr=(id,v)=>{try{form.getRadioGroup(id).select(v);}catch(e){}};
      sf("undefined",ac.respondent_name);sr("Group1","/Choice2");sf("Your name",ac.respondent_name);
      sf("Telephone Number",ac.client_phone);sf("Email Address",ac.client_email);sr("Group2","/Choice1");
      sf("Registered Representative or attorney's name",BES.rep);sf("Business mailing address",BES.addr.toUpperCase());
      sf("City State_2",BES.city.toUpperCase());sf("Zip Code_2",BES.zip);sf("Telephone Number_2",BES.phone);sf("Email Address_2",BES.email);
      sf("your name",ac.respondent_name);sf("insert name of registered representative or attorney",BES.rep);sf("registered representative or attorney",BES.rep);
      sr("Group4","/Choice1");sr("Group5","/Choice1");sr("Group6","/Choice1");sr("Group7","/Choice1");sr("Group8","/Choice1");sr("Group9","/Choice1");
      sf("Date1_af_date",new Date().toLocaleDateString("en-US"));
      form.flatten();
      const gn4B64=btoa(String.fromCharCode(...await pdfDoc.save()));
      // Invoice
      const invNum=`BES-${Date.now().toString(36).toUpperCase()}`;
      const invHtml=buildInvoice(ac,invLines,ac.retainer_amount,ac.invoice_due_days,invNum,ac.client_phone,ac.client_email);
      const invB64=btoa(unescape(encodeURIComponent(invHtml)));
      // .eml
      const safeName=(ac.respondent_name||"Client").replace(/[^A-Za-z0-9 ]/g,"").substring(0,40);
      const boundary="----BES_"+Date.now();
      const body=`Dear ${ac.respondent_name||"Client"},\n\nPlease find attached:\n\n1. GN4 Representative Authorization Form — sign and return.\n2. Invoice for professional services.\n\nHEARING DETAILS:\n  Violation #: ${ac.violation_number||"See attached"}\n  Agency: ${ac.issuing_agency||"N/A"}\n  Hearing Date: ${ac.hearing_date||"TBD"}\n  Premises: ${ac.premises_address||"N/A"}\n\nPlease return the signed GN4 with your retainer payment.\nZelle: ${BES.zelle}\n\nBest regards,\n${BES.rep}\n${BES.company}\n${BES.phone}\n${BES.email}`;
      const eml=`From: ${BES.rep} <${BES.email}>\nTo: ${ac.respondent_name||"Client"} <${ac.client_email}>\nSubject: OATH/ECB Hearing - ${safeName} - Action Required\nDate: ${new Date().toUTCString()}\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="${boundary}"\n\n--${boundary}\nContent-Type: text/plain; charset="UTF-8"\n\n${body}\n\n--${boundary}\nContent-Type: application/pdf; name="GN4_${safeName.replace(/\s/g,"_")}.pdf"\nContent-Disposition: attachment; filename="GN4_${safeName.replace(/\s/g,"_")}.pdf"\nContent-Transfer-Encoding: base64\n\n${gn4B64.match(/.{1,76}/g).join("\n")}\n\n--${boundary}\nContent-Type: text/html; name="Invoice_${invNum}.html"\nContent-Disposition: attachment; filename="Invoice_${invNum}.html"\nContent-Transfer-Encoding: base64\n\n${invB64.match(/.{1,76}/g).join("\n")}\n\n--${boundary}--`;
      const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([eml],{type:"message/rfc822"}));a.download=`OATH_${safeName.replace(/\s/g,"_")}.eml`;a.click();
      flash("Email file downloaded — open to send with attachments!");
    } catch(err) { flash("Email error: "+(err.message||"unknown"),"warn"); }
  };

  // ─── Print Invoice ─────────────────────────────────────────
  const printInv = () => { const n=`BES-${Date.now().toString(36).toUpperCase()}`;const w=window.open("","_blank");w.document.write(buildInvoice(ac,invLines,ac.retainer_amount,ac.invoice_due_days,n,ac.client_phone,ac.client_email));w.document.close();setTimeout(()=>w.print(),500); };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {toast && <div style={{position:"fixed",top:20,right:20,padding:"12px 20px",borderRadius:8,color:"#fff",fontSize:16,fontWeight:600,zIndex:2000,boxShadow:"0 4px 12px rgba(0,0,0,.15)",background:toast.t==="warn"?"#f59e0b":"#10b981"}}>{toast.m}</div>}

      {/* Header */}
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px",borderBottom:"1px solid #e2e8f0",background:"#fff",flexWrap:"wrap",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
        <h1 style={{margin:0,fontSize:21,fontWeight:800,fontFamily:"'Playfair Display',serif"}}>⚖ OATH / ECB Court CRM</h1>
        <nav style={{display:"flex",gap:4}}>
          {[["dashboard","Dashboard"],["editor",ac.id?"Edit Case":"New Case"],["reports","Reports"]].map(([v,l])=>
            <button key={v} onClick={()=>setView(v)} style={{background:view===v?"#eef2ff":"transparent",color:view===v?"#4f46e5":"#64748b",border:view===v?"1px solid #c7d2fe":"1px solid transparent",padding:"8px 16px",borderRadius:8,fontSize:16,fontWeight:view===v?600:500,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
          )}
        </nav>
      </header>

      <main style={{flex:1,padding:"20px 24px",maxWidth:1400,width:"100%",margin:"0 auto"}}>

        {/* DASHBOARD */}
        {view==="dashboard" && <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[["Total",stats.t,"#4f46e5"],["Upcoming",stats.up,"#f59e0b"],["Win Rate",stats.wr+"%","#10b981"],["Penalties",fmtMoney(stats.tp),"#ef4444"],["Settled",fmtMoney(stats.ts),"#3b82f6"]].map(([l,v,c],i)=>
              <div key={i} style={{flex:"1 1 130px",background:"#fff",borderRadius:10,padding:"14px 16px",borderTop:`3px solid ${c}`,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
                <div style={{fontSize:25,fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
                <div style={{fontSize:13,opacity:.5,textTransform:"uppercase",letterSpacing:1}}>{l}</div>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <input style={S.inp} placeholder="Search..." value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} />
            <select style={{...S.inp,width:"auto"}} value={filters.agency} onChange={e=>setFilters(f=>({...f,agency:e.target.value}))}><option value="">All Agencies</option>{AGENCIES.map(a=><option key={a}>{a}</option>)}</select>
            <select style={{...S.inp,width:"auto"}} value={filters.decision} onChange={e=>setFilters(f=>({...f,decision:e.target.value}))}><option value="">All Decisions</option>{DECISIONS.map(d=><option key={d}>{d}</option>)}</select>
            <button style={S.pri} onClick={newCase}>+ New Case</button>
            <div style={{position:"relative"}}>
              <button style={S.sec} onClick={()=>setShowHearingPicker(!showHearingPicker)}>📋 Hearing List</button>
              {showHearingPicker && <div style={{position:"absolute",top:"100%",right:0,marginTop:6,background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 30px rgba(0,0,0,.12)",zIndex:100,minWidth:280,padding:12}}>
                <div style={{fontSize:15,fontWeight:700,color:"#4f46e5",marginBottom:8}}>Generate Hearing Requests (.doc)</div>
                {hearingDates.length===0?<p style={{fontSize:16,color:"#64748b"}}>No pending dates.</p>:hearingDates.map(([date,arr])=>{const d=daysUntil(date);return<div key={date} onClick={()=>generateHearingDoc(date)} style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",borderRadius:6,cursor:"pointer",fontSize:16}} onMouseEnter={e=>e.currentTarget.style.background="#eef2ff"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{fontWeight:600}}>{date} <span style={{color:urgClr(d),fontSize:14}}>({urgLbl(d)})</span></span><span style={{background:"#eef2ff",color:"#4f46e5",padding:"2px 8px",borderRadius:10,fontSize:14,fontWeight:700}}>{arr.length}</span></div>;})}
              </div>}
            </div>
          </div>
          {loading?<div style={{textAlign:"center",padding:60,color:"#94a3b8"}}>Loading...</div>:filtered.length===0?
            <div style={{textAlign:"center",padding:60}}><div style={{fontSize:51}}>⚖</div><p style={{fontWeight:600,marginTop:12}}>No cases found</p><button style={S.pri} onClick={newCase}>+ Add First Case</button></div>:
            <div style={{borderRadius:10,overflow:"auto",border:"1px solid #e2e8f0",background:"#fff"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:16}}>
                <thead><tr>{[["hearing_date","Hearing"],["violation_number","Viol #"],["issuing_agency","Agency"],["respondent_name","Respondent"],["penalty_amount","Penalty"],["decision","Decision"]].map(([k,l])=><th key={k} onClick={()=>toggleSort(k)} style={{padding:"10px 12px",textAlign:"left",fontSize:13,textTransform:"uppercase",letterSpacing:1,color:"#64748b",borderBottom:"2px solid #e2e8f0",cursor:"pointer",background:"#f8fafc"}}>{l}{sortBy===k?(sortDir==="asc"?" ↑":" ↓"):""}</th>)}<th style={{padding:"10px",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>Timer</th></tr></thead>
                <tbody>{filtered.map(c=>{const d=daysUntil(c.hearing_date);const ds=decStyle(c.decision);return<tr key={c.id} onClick={()=>openCase(c)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(79,70,229,.04)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><td style={S.td}>{c.hearing_date||"—"}</td><td style={{...S.td,fontFamily:"'JetBrains Mono',monospace",fontSize:15}}>{c.violation_number||"—"}</td><td style={S.td}><span style={{padding:"3px 10px",borderRadius:6,fontSize:14,fontWeight:700,color:"#fff",background:c.issuing_agency==="DOB"?"#4f46e5":"#0ea5e9"}}>{c.issuing_agency||"—"}</span></td><td style={S.td}>{c.respondent_name||"—"}</td><td style={{...S.td,fontFamily:"mono"}}>{c.penalty_amount?fmtMoney(c.penalty_amount):"—"}</td><td style={S.td}><span style={{padding:"4px 12px",borderRadius:20,fontSize:14,fontWeight:700,background:ds.bg,color:ds.c}}>{c.decision}</span></td><td style={S.td}><span style={{padding:"4px 10px",borderRadius:20,fontSize:14,fontWeight:700,background:urgClr(d)+"22",color:urgClr(d),border:`1px solid ${urgClr(d)}`}}>{urgLbl(d)}</span></td></tr>})}</tbody>
              </table>
            </div>
          }
        </div>}

        {/* EDITOR */}
        {view==="editor" && <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20,alignItems:"start"}}>
          {/* Sidebar */}
          <aside style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid #e2e8f0",position:"sticky",top:20,display:"flex",flexDirection:"column",gap:14}}>
            <h3 style={{margin:0,fontSize:16,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#64748b"}}>Case Strategy</h3>
            {ac.hearing_date&&(()=>{const d=daysUntil(ac.hearing_date);return<div style={{textAlign:"center",padding:14,borderRadius:10,border:`2px solid ${urgClr(d)}`,background:"#f8fafc"}}><span style={{fontSize:31,fontWeight:800,color:urgClr(d),fontFamily:"'JetBrains Mono',monospace"}}>{d<0?Math.abs(d):d}</span><br/><span style={{fontSize:14,opacity:.7,textTransform:"uppercase",letterSpacing:1}}>{d<0?"Days Overdue":d===0?"Today":"Days Left"}</span></div>;})()}
            <div><label style={S.lbl}>Defense Notes</label><textarea style={{...S.inp,minHeight:90,resize:"vertical"}} value={ac.defense_notes||""} onChange={e=>upd("defense_notes",e.target.value)}/></div>
            <button style={{...S.pri,width:"100%",justifyContent:"center"}} onClick={()=>setAiDefs(getDefenses(ac.issuing_agency))}>⚡ AI Defense</button>
            {aiDefs.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{aiDefs.map((d,i)=><div key={i} style={{background:"#f8fafc",borderRadius:8,padding:10,borderLeft:"3px solid #7c3aed"}}><strong style={{color:"#4f46e5",fontSize:16}}>{d.title}</strong><p style={{margin:"4px 0",fontSize:15,opacity:.85}}>{d.explanation}</p><p style={{margin:0,fontSize:14,opacity:.5,fontStyle:"italic"}}>{d.evidence}</p></div>)}</div>}
          </aside>

          {/* Main */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <h2 style={{margin:0,fontSize:25,fontWeight:800,fontFamily:"'Playfair Display',serif"}}>{ac.id?"Edit Violation":"New Violation"}</h2>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button style={S.sec} onClick={syncToCalendar}>📅</button>
                <button style={S.sec} onClick={()=>{setShowGN4(!showGN4);setShowInv(false);}}>📄 GN4</button>
                <button style={S.sec} onClick={()=>{setShowInv(!showInv);setShowGN4(false);}}>🧾 Invoice</button>
                <button style={S.sec} onClick={emailClient}>📧 Email</button>
                <button style={S.sec} onClick={()=>setAc({...EMPTY})}>Clear</button>
                <button style={S.pri} onClick={handleSave} disabled={saving}>{saving?"Saving...":"💾 Save"}</button>
              </div>
            </div>

            {/* PDF Drop */}
            <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handlePdfDrop} onClick={()=>document.getElementById("pdf-input").click()}
              style={{border:`2px dashed ${dragOver?"#4f46e5":"#cbd5e1"}`,borderRadius:12,padding:"28px 20px",textAlign:"center",cursor:"pointer",background:dragOver?"#eef2ff":"#fafbff"}}>
              <input id="pdf-input" type="file" accept=".pdf" style={{display:"none"}} onChange={handlePdfDrop}/>
              {pdfParsing?<><div style={{width:28,height:28,border:"3px solid #e2e8f0",borderTop:"3px solid #4f46e5",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto"}}></div><p style={{marginTop:8,fontWeight:700,color:"#4f46e5"}}>{parseStatus}</p></>:
              pdfName?<p style={{color:"#10b981",fontWeight:600}}>✅ {pdfName} — drop another to replace</p>:
              <><span style={{fontSize:35}}>📄</span><p style={{fontWeight:700,color:"#4f46e5",margin:"8px 0 0"}}>Drop Violation PDF Here</p><p style={{opacity:.5,fontSize:15}}>OCR auto-extracts all fields</p></>}
            </div>
            <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>

            {/* GN4 Panel */}
            {showGN4&&<div style={S.panel}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <h3 style={{margin:0,color:"#4f46e5"}}>📄 GN4 Authorization Form</h3>
                <div style={{display:"flex",gap:8}}>
                  <label style={{...S.sec,cursor:"pointer"}}><input type="file" accept=".pdf" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=()=>{setCustomGN4(r.result);flash("Custom GN4 loaded");};r.readAsArrayBuffer(f);}}}/>📤 Upload Custom</label>
                  <button style={S.pri} onClick={fillGN4}>📥 Download GN4</button>
                </div>
              </div>
              <div style={{background:"#f8fafc",borderRadius:8,padding:14,border:"1px solid #e2e8f0",fontSize:16}}>
                <div style={{fontWeight:700,color:"#4f46e5",marginBottom:6}}>NOTICE INFO</div>
                <div><span style={{opacity:.5,display:"inline-block",width:120}}>Respondent:</span><strong>{ac.respondent_name||"—"}</strong></div>
                <div><span style={{opacity:.5,display:"inline-block",width:120}}>Auth Type:</span>All notices (2-year)</div>
                <div style={{borderTop:"1px solid #e2e8f0",paddingTop:8,marginTop:8,fontWeight:700,color:"#f59e0b",marginBottom:6}}>PERSON AUTHORIZING</div>
                <div><span style={{opacity:.5,display:"inline-block",width:120}}>Address:</span>{ac.mailing_address||ac.premises_address||"—"}</div>
                <div><span style={{opacity:.5,display:"inline-block",width:120}}>Phone:</span>{ac.client_phone||"⚠ Enter in Invoice"}</div>
                <div><span style={{opacity:.5,display:"inline-block",width:120}}>Email:</span>{ac.client_email||"⚠ Enter in Invoice"}</div>
                <div style={{borderTop:"1px solid #e2e8f0",paddingTop:8,marginTop:8,fontWeight:700,color:"#10b981",marginBottom:6}}>REP (BES)</div>
                <div><span style={{opacity:.5,display:"inline-block",width:120}}>Name:</span>{BES.rep}</div>
                <div><span style={{opacity:.5,display:"inline-block",width:120}}>Questions 1-6:</span>All YES ✓</div>
              </div>
            </div>}

            {/* Invoice Panel */}
            {showInv&&<div style={S.panel}>
              <h3 style={{margin:"0 0 12px",color:"#4f46e5"}}>🧾 Invoice</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div><label style={S.lbl}>Client Phone (also for GN4)</label><input style={S.inp} placeholder="(xxx) xxx-xxxx" value={ac.client_phone||""} onChange={e=>upd("client_phone",e.target.value)}/></div>
                <div><label style={S.lbl}>Client Email (also for GN4)</label><input style={S.inp} placeholder="email" value={ac.client_email||""} onChange={e=>upd("client_email",e.target.value)}/></div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <label style={S.lbl}>Line Items</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button style={{...S.sec,padding:"6px 12px"}} onClick={addCaseAsLine}>+ Violation</button>
                  <button style={{...S.sec,padding:"6px 12px"}} onClick={()=>addInvLine("Research & Compliance Analysis","")}>+ Research</button>
                  <button style={{...S.sec,padding:"6px 12px"}} onClick={()=>addInvLine("Document Preparation & Filing","")}>+ Doc Prep</button>
                  <button style={{...S.sec,padding:"6px 12px"}} onClick={()=>addInvLine("","")}>+ Custom</button>
                </div>
              </div>
              {invLines.length===0&&<p style={{textAlign:"center",opacity:.4,fontSize:16}}>No line items</p>}
              {invLines.map(line=><div key={line.id} style={{display:"grid",gridTemplateColumns:"1fr 120px 30px",gap:8,marginBottom:6}}>
                <input style={S.inp} value={line.description} onChange={e=>updateInvLine(line.id,"description",e.target.value)} placeholder="Description"/>
                <input type="number" style={{...S.inp,fontFamily:"mono",fontWeight:700}} value={line.amount} onChange={e=>updateInvLine(line.id,"amount",e.target.value)} placeholder="$0"/>
                <button style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:17}} onClick={()=>removeInvLine(line.id)}>✕</button>
              </div>)}
              {invLines.length>0&&<div style={{textAlign:"right",fontWeight:800,fontSize:19,paddingTop:8,borderTop:"2px solid #e2e8f0"}}>Subtotal: {fmtMoney(invTotal)}</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}>
                <div><label style={S.lbl}>Retainer ($)</label><input type="number" style={{...S.inp,fontFamily:"mono",fontWeight:700}} value={ac.retainer_amount||""} onChange={e=>upd("retainer_amount",e.target.value)} placeholder="0.00"/></div>
                <div><label style={S.lbl}>Terms (days)</label><input type="number" style={S.inp} value={ac.invoice_due_days||30} onChange={e=>upd("invoice_due_days",e.target.value)}/></div>
              </div>
              <button style={{...S.pri,width:"100%",marginTop:14,justifyContent:"center",padding:"14px"}} onClick={printInv} disabled={invLines.length===0}>🖨 Print Invoice</button>
            </div>}

            {/* Form Fields */}
            <fieldset style={S.fs}><legend style={S.leg}>Violation Details</legend>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12}}>
                {[["Agency","issuing_agency","select",AGENCIES],["Violation #","violation_number"],["Respondent","respondent_name"],["Hearing Date","hearing_date","date"],["Cure Date","cure_date","date"],["Date Issued","date_violation_issued","date"],["Infraction Code","section_of_law"],["Violation Category","violation_category"],["Penalty ($)","penalty_amount","number"]].map(([label,key,type,opts])=>
                  <div key={key}>{type==="select"?<><label style={S.lbl}>{label}</label><select style={S.inp} value={ac[key]||""} onChange={e=>upd(key,e.target.value)}><option value="">—</option>{opts.map(o=><option key={o}>{o}</option>)}</select></>:<><label style={S.lbl}>{label}</label><input type={type||"text"} style={{...S.inp,...(key.includes("number")||key.includes("code")||key.includes("category")?{fontFamily:"'JetBrains Mono',monospace",fontSize:15}:{})}} value={ac[key]||""} onChange={e=>upd(key,e.target.value)}/></>}</div>
                )}
                <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Premises Address</label><input style={S.inp} value={ac.premises_address||""} onChange={e=>upd("premises_address",e.target.value)}/></div>
                <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Mailing Address</label><input style={S.inp} value={ac.mailing_address||""} onChange={e=>upd("mailing_address",e.target.value)}/></div>
                {[["BIN","bin_number"],["Block","block"],["Lot","lot"]].map(([l,k])=><div key={k}><label style={S.lbl}>{l}</label><input style={{...S.inp,fontFamily:"mono",fontSize:15}} value={ac[k]||""} onChange={e=>upd(k,e.target.value)}/></div>)}
              </div>
              <div style={{marginTop:12}}><label style={S.lbl}>Violation Details</label><textarea style={{...S.inp,minHeight:70,resize:"vertical"}} value={ac.violation_description||""} onChange={e=>upd("violation_description",e.target.value)}/></div>
            </fieldset>

            <fieldset style={S.fs}><legend style={S.leg}>Decision & Settlement</legend>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={S.lbl}>Decision</label><select style={S.inp} value={ac.decision||"Pending"} onChange={e=>upd("decision",e.target.value)}>{DECISIONS.map(d=><option key={d}>{d}</option>)}</select></div>
                <div><label style={S.lbl}>Settlement ($)</label><input type="number" style={{...S.inp,fontFamily:"mono"}} value={ac.settlement_amount||""} onChange={e=>upd("settlement_amount",e.target.value)}/></div>
              </div>
              <div style={{marginTop:12}}><label style={S.lbl}>Settlement Notes</label><textarea style={{...S.inp,minHeight:50,resize:"vertical"}} value={ac.settlement_notes||""} onChange={e=>upd("settlement_notes",e.target.value)}/></div>
              <div style={{marginTop:12}}><label style={S.lbl}>General Notes</label><textarea style={{...S.inp,minHeight:50,resize:"vertical"}} value={ac.notes||""} onChange={e=>upd("notes",e.target.value)}/></div>
            </fieldset>

            {ac.id&&(()=>{const l=JSON.parse(ac.audit_log||"[]");return l.length>0?<fieldset style={S.fs}><legend style={S.leg}>Audit Trail</legend>{l.slice(-10).reverse().map((e,i)=><div key={i} style={{fontSize:15,opacity:.6,fontFamily:"mono"}}><span style={{color:"#4f46e5"}}>{e.a}</span> — {new Date(e.t).toLocaleString()}</div>)}</fieldset>:null;})()}
          </div>
        </div>}

        {/* REPORTS */}
        {view==="reports"&&<div style={{display:"flex",flexDirection:"column",gap:20}}>
          <h2 style={{margin:0,fontSize:25,fontWeight:800,fontFamily:"'Playfair Display',serif"}}>Case Analytics</h2>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{DECISIONS.map(d=>{const ds=decStyle(d);return<div key={d} style={{flex:"1 1 100px",background:"#fff",borderRadius:10,padding:"14px 16px",borderTop:`3px solid ${ds.bg}`,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}><div style={{fontSize:25,fontWeight:800,fontFamily:"mono"}}>{stats.bd[d]||0}</div><div style={{fontSize:13,opacity:.5,textTransform:"uppercase"}}>{d}</div></div>})}</div>
          <div style={{...S.fs,display:"flex",gap:32,flexWrap:"wrap"}}>
            <div><div style={{fontSize:14,opacity:.5,textTransform:"uppercase",marginBottom:4}}>Penalties</div><div style={{fontSize:31,fontWeight:800,color:"#ef4444",fontFamily:"mono"}}>{fmtMoney(stats.tp)}</div></div>
            <div><div style={{fontSize:14,opacity:.5,textTransform:"uppercase",marginBottom:4}}>Settled</div><div style={{fontSize:31,fontWeight:800,color:"#3b82f6",fontFamily:"mono"}}>{fmtMoney(stats.ts)}</div></div>
            <div><div style={{fontSize:14,opacity:.5,textTransform:"uppercase",marginBottom:4}}>Savings</div><div style={{fontSize:31,fontWeight:800,color:"#10b981",fontFamily:"mono"}}>{fmtMoney(stats.tp-stats.ts)}</div></div>
          </div>
        </div>}
      </main>

      {delId&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setDelId(null)}>
        <div style={{background:"#fff",borderRadius:12,padding:24,maxWidth:400,width:"90%"}} onClick={e=>e.stopPropagation()}>
          <h3>Delete?</h3><p style={{opacity:.6}}>Cannot be undone.</p>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}><button style={S.sec} onClick={()=>setDelId(null)}>Cancel</button><button style={{...S.pri,background:"#ef4444"}} onClick={()=>handleDel(delId)}>Delete</button></div>
        </div>
      </div>}
    </div>
  );
}

// ─── Shared Styles ───────────────────────────────────────────
const S = {
  inp: { width:"100%", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 12px", color:"#1e293b", fontSize:16, fontFamily:"inherit", outline:"none" },
  lbl: { display:"block", fontSize:13, textTransform:"uppercase", letterSpacing:1, color:"#64748b", marginBottom:4 },
  pri: { display:"inline-flex", alignItems:"center", gap:6, background:"linear-gradient(135deg,#4f46e5,#7c3aed)", border:"none", color:"#fff", padding:"10px 18px", borderRadius:8, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", boxShadow:"0 2px 4px rgba(79,70,229,.25)" },
  sec: { display:"inline-flex", alignItems:"center", gap:6, background:"#fff", border:"1px solid #e2e8f0", color:"#334155", padding:"10px 18px", borderRadius:8, fontSize:16, fontWeight:500, cursor:"pointer", fontFamily:"inherit" },
  fs: { border:"1px solid #e2e8f0", borderRadius:12, padding:18, background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,.04)" },
  leg: { fontSize:15, fontWeight:700, textTransform:"uppercase", letterSpacing:1, padding:"0 8px", color:"#4f46e5" },
  td: { padding:"10px 12px", borderBottom:"1px solid #f1f5f9" },
  panel: { background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:18, boxShadow:"0 1px 3px rgba(0,0,0,.04)" },
};

// ─── Invoice Builder ─────────────────────────────────────────
function buildInvoice(c, lines, retainer, dueDays, num, phone, email) {
  const today=new Date(),due=new Date(today.getTime()+(parseInt(dueDays)||30)*864e5);
  const total=lines.reduce((s,l)=>s+(parseFloat(l.amount)||0),0),dep=parseFloat(retainer)||0,balance=total-dep;
  const rows=lines.map((l,i)=>`<tr><td>${i+1}</td><td>${l.description||""}</td><td style="text-align:right;font-family:monospace;font-weight:600">$${(parseFloat(l.amount)||0).toFixed(2)}</td></tr>`).join("");
  return`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${num}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial;color:#1a1a2e;padding:36px 48px;max-width:8.5in}table{width:100%;border-collapse:collapse;margin:18px 0}th{background:#f1f5f9;padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:2px solid #e2e8f0}td{padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:12px}.sub td{background:#f8fafc;font-weight:700;font-size:13px}.dep td{font-weight:700;color:#b45309}.bal td{background:#f0fdf4;font-weight:800;font-size:16px;color:#10b981;border-bottom:3px solid #10b981;padding:14px 12px}.tot td{background:#f0f0ff;font-weight:800;font-size:15px;border-bottom:3px solid #4f46e5;padding:14px 12px}@media print{body{padding:18px 36px}}</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #4f46e5"><div><div style="font-size:18px;font-weight:800">${BES.company}</div><div style="font-size:11px;color:#64748b;margin-top:2px;line-height:1.6">${BES.addr}<br>${BES.city} ${BES.zip}<br>${BES.phone}<br>${BES.email}</div></div><div style="text-align:right"><div style="font-size:32px;font-weight:900;color:#4f46e5;letter-spacing:2px">INVOICE</div><div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.7"><strong style="color:#1a1a2e">Invoice #:</strong> ${num}<br><strong style="color:#1a1a2e">Date:</strong> ${today.toLocaleDateString("en-US")}<br><strong style="color:#1a1a2e">Due:</strong> ${due.toLocaleDateString("en-US")}<br><strong style="color:#1a1a2e">Terms:</strong> Net ${dueDays}</div></div></div>
<div style="display:flex;gap:36px;margin:22px 0"><div style="flex:1"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#4f46e5;font-weight:700;margin-bottom:5px">Bill To</div><div style="font-size:14px;font-weight:700">${c.respondent_name||"Client"}</div><div style="font-size:11px;color:#64748b;line-height:1.6">${c.mailing_address||c.premises_address||""}${phone?"<br>Phone: "+phone:""}${email?"<br>Email: "+email:""}</div></div><div style="flex:1"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#4f46e5;font-weight:700;margin-bottom:5px">Re: Matter</div><div style="font-size:11px;color:#64748b;line-height:1.6"><strong>Violation:</strong> ${c.violation_number||"N/A"}<br><strong>Agency:</strong> ${c.issuing_agency||"N/A"}<br><strong>Hearing:</strong> ${c.hearing_date||"TBD"}<br><strong>Premises:</strong> ${c.premises_address||"N/A"}</div></div></div>
<table><thead><tr><th>#</th><th>Description</th><th style="text-align:right;width:120px">Amount</th></tr></thead><tbody>${rows}<tr class="sub"><td></td><td style="text-align:right">SUBTOTAL</td><td style="text-align:right;font-family:monospace">$${total.toFixed(2)}</td></tr>${dep>0?`<tr class="dep"><td></td><td style="text-align:right">RETAINER DUE UPON SIGNING</td><td style="text-align:right;font-family:monospace">($${dep.toFixed(2)})</td></tr><tr class="bal"><td></td><td style="text-align:right">BALANCE DUE BEFORE HEARING</td><td style="text-align:right;font-family:monospace">$${balance.toFixed(2)}</td></tr>`:`<tr class="tot"><td></td><td style="text-align:right">TOTAL DUE</td><td style="text-align:right;font-family:monospace;color:#4f46e5">$${total.toFixed(2)}</td></tr>`}</tbody></table>
${dep>0?`<div style="border:2px solid #e2e8f0;border-radius:8px;margin:20px 0;overflow:hidden"><div style="background:#f8fafc;padding:12px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4f46e5;border-bottom:1px solid #e2e8f0">Payment Structure</div><div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:12px"><span>1. Non-refundable retainer due upon signing</span><strong style="font-family:monospace">$${dep.toFixed(2)}</strong></div><div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:12px"><span>2. Balance due before hearing${c.hearing_date?" ("+c.hearing_date+")":""}</span><strong style="font-family:monospace">$${balance.toFixed(2)}</strong></div><div style="display:flex;justify-content:space-between;padding:10px 16px;background:#f8fafc;font-weight:700;font-size:12px"><span>Total</span><strong style="font-family:monospace">$${total.toFixed(2)}</strong></div></div>`:``}
<div style="background:#f8fafc;border-radius:8px;padding:16px;margin:20px 0;font-size:11px;color:#64748b"><strong style="color:#1a1a2e">Payment Instructions</strong><br>${dep>0?`<strong style="color:#b45309">Non-refundable retainer of $${dep.toFixed(2)} is due upon execution. Balance of $${balance.toFixed(2)} must be received before hearing.</strong><br><br>`:``}<strong>Zelle:</strong> ${BES.zelle}<br><strong>Check:</strong> Payable to <strong>${BES.company}</strong><br><strong>Mail:</strong> ${BES.addr}, ${BES.city} ${BES.zip}<br>Questions: ${BES.phone} or ${BES.email}</div>
<div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;font-size:10px;color:#475569;line-height:1.7"><strong style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#1a1a2e">Terms & Conditions</strong><br><br><strong>NO REFUND POLICY:</strong> All fees and retainers are non-refundable. The retainer secures availability, time, and resources, and is earned upon receipt.<br><br><strong>SCOPE:</strong> ${BES.company} is retained as a building expediter and code compliance consultant — not a law firm. No legal advice or representation is provided.<br><br><strong>NO GUARANTEE:</strong> No guarantees regarding hearing outcomes. Payment is for services rendered, not results.<br><br><strong>LIMITATION OF LIABILITY:</strong> ${BES.company} shall not be liable for indirect, incidental, or consequential damages. Total liability shall not exceed fees paid.<br><br><strong>HOLD HARMLESS:</strong> Client agrees to indemnify and hold harmless ${BES.company} from claims arising from misrepresentation or undisclosed conditions.<br><br><strong>CLIENT RESPONSIBILITY:</strong> Client must provide accurate, complete, timely information.<br><br><strong>CANCELLATION:</strong> Retainer is forfeited upon cancellation. Client remains liable for work performed.<br><br>By making payment, Client agrees to these terms.</div>
<div style="margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center;line-height:1.6">${BES.company} · ${BES.addr} · ${BES.city} ${BES.zip} · ${BES.phone} · ${BES.email}<br>Thank you for your business.</div>
</body></html>`;
}
