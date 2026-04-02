import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import OathEcbCRM from './widgets/OathEcbCRM';
import PropertyResearch from './widgets/PropertyResearch';

const WIDGETS = [
  { path: '/oath-ecb', label: 'OATH/ECB Court', icon: '⚖', component: OathEcbCRM, active: true },
  { path: '/property-research', label: 'Property Research', icon: '🔍', component: PropertyResearch, active: true },
  { path: '/sidewalk', label: 'Sidewalk Violations', icon: '🚧', component: null, active: false },
  { path: '/dob-filings', label: 'DOB Filings', icon: '📋', component: null, active: false },
  { path: '/cert-corrections', label: 'Cert of Corrections', icon: '✅', component: null, active: false },
  { path: '/ecb-settlements', label: 'ECB Settlements', icon: '🤝', component: null, active: false },
  { path: '/permits', label: 'Permits', icon: '📄', component: null, active: false },
];

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={S.shell}>
      {/* Sidebar */}
      <aside style={{ ...S.sidebar, width: sidebarOpen ? 240 : 60 }}>
        <div style={S.brand} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <span style={S.brandIcon}>⚡</span>
          {sidebarOpen && <div>
            <div style={S.brandName}>ExpeditorOS</div>
            <div style={S.brandSub}>Building Expediting Systems</div>
          </div>}
        </div>
        <nav style={S.sideNav}>
          {WIDGETS.map(w => (
            <NavLink key={w.path} to={w.path}
              style={({ isActive }) => ({ ...S.sideLink, ...(isActive ? S.sideLinkActive : {}), ...(w.active ? {} : { opacity: 0.35 }) })}>
              <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{w.icon}</span>
              {sidebarOpen && <span>{w.label}</span>}
              {!w.active && sidebarOpen && <span style={S.comingSoon}>Soon</span>}
            </NavLink>
          ))}
        </nav>
        {sidebarOpen && <div style={S.sideFooter}>
          <div style={{ fontSize: 11, opacity: 0.4 }}>v1.1.0</div>
          <div style={{ fontSize: 10, opacity: 0.3 }}>© {new Date().getFullYear()} BES, Inc.</div>
        </div>}
      </aside>

      {/* Main Content */}
      <main style={S.content}>
        <Routes>
          <Route path="/" element={<Navigate to="/oath-ecb" replace />} />
          <Route path="/oath-ecb/*" element={<OathEcbCRM />} />
          <Route path="/property-research/*" element={<PropertyResearch />} />
          {/* Future widget routes */}
          <Route path="*" element={<ComingSoon />} />
        </Routes>
      </main>
    </div>
  );
}

function ComingSoon() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, opacity: 0.5 }}>
      <span style={{ fontSize: 64 }}>🚧</span>
      <h2 style={{ fontFamily: "'Playfair Display', serif", margin: 0 }}>Coming Soon</h2>
      <p style={{ fontSize: 15 }}>This widget is under development.</p>
    </div>
  );
}

const S = {
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', transition: 'width 0.2s', overflow: 'hidden', flexShrink: 0 },
  brand: { padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' },
  brandIcon: { width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  brandName: { fontSize: 16, fontWeight: 800, fontFamily: "'Playfair Display', serif", color: '#1e293b', whiteSpace: 'nowrap' },
  brandSub: { fontSize: 10, opacity: 0.4, letterSpacing: 0.5, whiteSpace: 'nowrap', textTransform: 'uppercase' },
  sideNav: { flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2 },
  sideLink: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#64748b', textDecoration: 'none', transition: 'all 0.15s', whiteSpace: 'nowrap' },
  sideLinkActive: { background: '#eef2ff', color: '#4f46e5', fontWeight: 600 },
  comingSoon: { marginLeft: 'auto', fontSize: 10, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#94a3b8', fontWeight: 600 },
  sideFooter: { padding: '12px 16px', borderTop: '1px solid #f1f5f9' },
  content: { flex: 1, overflow: 'auto' },
};
