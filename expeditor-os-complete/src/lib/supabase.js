import { createClient } from '@supabase/supabase-js';

const url = 'https://swojwtinqmjlibapyubz.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b2p3dGlucW1qbGliYXB5dWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYwODksImV4cCI6MjA5MDY2MjA4OX0.ZC3b-7ulNnbsfFopP02uUlM2gwIHFnaoYSbDJn3thL0';

export const supabase = (url && key) ? createClient(url, key) : null;
export const isConnected = () => !!supabase;

// ─── Universal Storage: Supabase primary, localStorage fallback ───
export function createStorage(table) {
  return {
    async getAll() {
      if (supabase) {
        const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
        if (!error && data) return data;
      }
      return JSON.parse(localStorage.getItem(`eos_${table}`) || '[]');
    },

    async save(record) {
      const now = new Date().toISOString();
      record.updated_at = now;
      if (!record.id) {
        record.id = crypto.randomUUID();
        record.created_at = now;
        record.audit_log = JSON.stringify([{ a: 'created', t: now }]);
      } else {
        const log = JSON.parse(record.audit_log || '[]');
        log.push({ a: 'updated', t: now });
        record.audit_log = JSON.stringify(log);
      }
      if (supabase) {
        await supabase.from(table).upsert(record);
      }
      // Always save to localStorage as fallback
      const all = JSON.parse(localStorage.getItem(`eos_${table}`) || '[]');
      const idx = all.findIndex(r => r.id === record.id);
      if (idx >= 0) all[idx] = record; else all.unshift(record);
      localStorage.setItem(`eos_${table}`, JSON.stringify(all));
      return record;
    },

    async remove(id) {
      if (supabase) {
        await supabase.from(table).delete().eq('id', id);
      }
      const all = JSON.parse(localStorage.getItem(`eos_${table}`) || '[]');
      localStorage.setItem(`eos_${table}`, JSON.stringify(all.filter(r => r.id !== id)));
    }
  };
}
