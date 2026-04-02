-- ═══════════════════════════════════════════════════════════
-- ExpeditorOS — Supabase Schema v1.1
-- Building Expediting Systems, Inc.
-- ═══════════════════════════════════════════════════════════

-- OATH/ECB Cases (complete with invoice data)
CREATE TABLE IF NOT EXISTS ecb_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Violation Info
  issuing_agency TEXT,
  violation_number TEXT,
  violation_category TEXT,
  section_of_law TEXT,
  provision_of_law TEXT,
  violation_description TEXT,
  
  -- Respondent Info
  respondent_name TEXT,
  mailing_address TEXT,
  client_phone TEXT,
  client_email TEXT,
  
  -- Dates
  hearing_date DATE,
  cure_date DATE,
  date_violation_issued DATE,
  
  -- Location
  premises_address TEXT,
  bin_number TEXT,
  block TEXT,
  lot TEXT,
  
  -- Financials
  penalty_amount NUMERIC,
  settlement_amount NUMERIC,
  settlement_notes TEXT,
  
  -- Invoice Data (stored as JSON)
  invoice_lines JSONB DEFAULT '[]',
  retainer_amount NUMERIC,
  invoice_due_days INTEGER DEFAULT 30,
  
  -- Case Management
  decision TEXT DEFAULT 'Pending',
  notes TEXT,
  defense_notes TEXT,
  
  -- Documents (JSON arrays)
  app_links JSONB DEFAULT '[]',
  photos JSONB DEFAULT '[]',
  supporting_docs JSONB DEFAULT '[]',
  
  -- Audit
  audit_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ECB Indexes
CREATE INDEX IF NOT EXISTS idx_ecb_hearing ON ecb_cases(hearing_date);
CREATE INDEX IF NOT EXISTS idx_ecb_violation ON ecb_cases(violation_number);
CREATE INDEX IF NOT EXISTS idx_ecb_agency ON ecb_cases(issuing_agency);
CREATE INDEX IF NOT EXISTS idx_ecb_decision ON ecb_cases(decision);
CREATE INDEX IF NOT EXISTS idx_ecb_respondent ON ecb_cases(respondent_name);

ALTER TABLE ecb_cases ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════
-- Property Research
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS property_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Property Identification
  address TEXT,
  borough TEXT,
  block TEXT,
  lot TEXT,
  bin_number TEXT,
  zip_code TEXT,
  
  -- PLUTO / Zoning Data
  zoning_district TEXT,
  overlay TEXT,
  special_district TEXT,
  landmark TEXT,
  building_class TEXT,
  building_class_desc TEXT,
  land_use TEXT,
  lot_area NUMERIC,
  building_area NUMERIC,
  num_floors TEXT,
  num_units TEXT,
  year_built TEXT,
  owner_name TEXT,
  zoning_map TEXT,
  comm_dist TEXT,
  council_dist TEXT,
  far TEXT,
  max_far TEXT,
  lot_frontage TEXT,
  lot_depth TEXT,
  
  -- Research & Compliance
  status TEXT DEFAULT 'Researching',
  compliance_notes TEXT,
  research_summary TEXT,
  
  -- Client / Engagement
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  engagement_type TEXT,
  
  -- API Data Snapshots (JSON)
  dob_violations JSONB DEFAULT '[]',
  hpd_violations JSONB DEFAULT '[]',
  dob_complaints JSONB DEFAULT '[]',
  dob_permits JSONB DEFAULT '[]',
  ecb_violations JSONB DEFAULT '[]',
  last_lookup TIMESTAMPTZ,
  
  -- Audit
  audit_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Property Research Indexes
CREATE INDEX IF NOT EXISTS idx_pr_address ON property_research(address);
CREATE INDEX IF NOT EXISTS idx_pr_borough ON property_research(borough);
CREATE INDEX IF NOT EXISTS idx_pr_bbl ON property_research(borough, block, lot);
CREATE INDEX IF NOT EXISTS idx_pr_bin ON property_research(bin_number);
CREATE INDEX IF NOT EXISTS idx_pr_status ON property_research(status);
CREATE INDEX IF NOT EXISTS idx_pr_owner ON property_research(owner_name);
CREATE INDEX IF NOT EXISTS idx_pr_client ON property_research(client_name);

ALTER TABLE property_research ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════
-- Future widget tables (uncomment when ready)
-- ═══════════════════════════════════════════════════════════

-- Sidewalk Violations
-- CREATE TABLE IF NOT EXISTS sidewalk_violations (...);

-- DOB Filings
-- CREATE TABLE IF NOT EXISTS dob_filings (...);

-- Certificate of Corrections
-- CREATE TABLE IF NOT EXISTS cert_corrections (...);

-- ECB Settlements
-- CREATE TABLE IF NOT EXISTS ecb_settlements (...);

-- Clients (shared across all widgets)
-- CREATE TABLE IF NOT EXISTS clients (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name TEXT NOT NULL,
--   company TEXT,
--   phone TEXT,
--   email TEXT,
--   mailing_address TEXT,
--   city_state TEXT,
--   zip TEXT,
--   notes TEXT,
--   created_at TIMESTAMPTZ DEFAULT now(),
--   updated_at TIMESTAMPTZ DEFAULT now()
-- );
