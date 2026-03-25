import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── UUID Generator ───
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

// ─── IndexedDB Layer ───
const DB_NAME = 'bridges_outreach';
const DB_VERSION = 1;
const STORES = ['clients', 'encounters', 'workers', 'sync_queue'];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          const s = db.createObjectStore(store, { keyPath: 'id' });
          if (store === 'clients') {
            s.createIndex('first_name', 'first_name', { unique: false });
            s.createIndex('last_name', 'last_name', { unique: false });
            s.createIndex('alias_street_name', 'alias_street_name', { unique: false });
          }
          if (store === 'encounters') {
            s.createIndex('client_id', 'client_id', { unique: false });
            s.createIndex('worker_id', 'worker_id', { unique: false });
            s.createIndex('encounter_date', 'encounter_date', { unique: false });
          }
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Seed default worker ───
async function ensureDefaultWorker() {
  const workers = await dbGetAll('workers');
  if (workers.length === 0) {
    await dbPut('workers', {
      id: uuid(),
      name: 'Outreach Worker',
      role: 'Outreach Worker',
      active: true,
      created_at: new Date().toISOString()
    });
  }
}

// ─── Enum Constants (from spec) ───
const ENCOUNTER_TYPES = ['Initial Contact', 'Follow-Up', 'Attempted/Not Located', 'Refusal'];

const FOCUS_TODAY_OPTIONS = [
  'Safe sleep tonight', 'Permanent housing', 'Specific problem',
  'Food/clothing', 'Medical/treatment', 'Substance tx',
  'Documents/ID', 'Legal issue', 'Work/income', 'Just talking'
];

const SLEEPING_LOCATIONS = [
  'Street/Sidewalk', 'Encampment', 'Vehicle', 'Abandoned Building',
  'Transit', 'Shelter', 'Doubled Up', 'Hotel (self-pay)',
  'Hotel (voucher)', 'Hotel (agency)', 'Transitional',
  'Institutional', 'Other'
];

const INTEREST_OPTIONS = ['Yes', 'No', 'Not Today', 'Undecided'];

const SERVICES_OPTIONS = [
  'Medical', 'Mental Health', 'Substance Tx', 'Benefits',
  'Employment', 'Legal', 'ID/Docs', 'Food', 'Clothing', 'None'
];

const GENDER_OPTIONS = [
  'Male', 'Female', 'Trans Male', 'Trans Female', 'Non-Binary', 'Other', 'Unknown'
];

const CHRONIC_OPTIONS = ['Yes', 'No', 'Unknown'];

// ─── Icons ───
const Icons = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  list: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  mapPin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  chevDown: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polyline points="6 9 12 15 18 9"/></svg>,
  chevUp: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polyline points="18 15 12 9 6 15"/></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  wifi: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
  wifiOff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
  gps: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="8"/></svg>,
};

// ─── Styles ───
const CSS = `
  :root {
    --navy: #06487C;
    --red: #DB2416;
    --sky: #73B8D7;
    --navy-light: #E8F0F6;
    --red-light: #FDEAE8;
    --sky-light: #E5F2F8;
    --navy-dark: #043660;
    --text: #1a1a1a;
    --text-secondary: #5a6672;
    --bg: #f5f7fa;
    --white: #ffffff;
    --border: #d8dee6;
    --radius: 10px;
    --radius-sm: 6px;
    --shadow: 0 1px 3px rgba(6,72,124,0.08), 0 1px 2px rgba(6,72,124,0.06);
    --shadow-lg: 0 4px 12px rgba(6,72,124,0.12);
    --font: -apple-system, 'SF Pro Text', Arial, sans-serif;
    --transition: 0.2s ease;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { font-size: 16px; }
  body { font-family: var(--font); background: var(--bg); color: var(--text); overflow-x: hidden; }
  
  .app { 
    max-width: 480px; 
    margin: 0 auto; 
    min-height: 100vh; 
    display: flex; 
    flex-direction: column;
    background: var(--bg);
  }
  
  /* ─── Header ─── */
  .header {
    background: var(--navy);
    color: white;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(6,72,124,0.3);
  }
  .header h1 { font-size: 17px; font-weight: 600; letter-spacing: -0.2px; flex: 1; }
  .header-btn { 
    background: none; border: none; color: white; cursor: pointer; 
    padding: 6px; border-radius: var(--radius-sm); display: flex;
    transition: background var(--transition);
  }
  .header-btn:active { background: rgba(255,255,255,0.15); }
  
  .status-bar {
    display: flex; align-items: center; gap: 4px; font-size: 11px;
    opacity: 0.85; padding: 2px 8px; border-radius: 20px;
  }
  .status-online { background: rgba(115,184,215,0.25); }
  .status-offline { background: rgba(219,36,22,0.25); }
  
  /* ─── Main Content ─── */
  .main { flex: 1; padding: 0 0 90px; overflow-y: auto; }
  
  /* ─── Bottom Nav ─── */
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 480px;
    background: var(--white);
    border-top: 1px solid var(--border);
    display: flex;
    padding: 6px 0 env(safe-area-inset-bottom, 8px);
    z-index: 100;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.06);
  }
  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 10px;
    font-family: var(--font);
    font-weight: 500;
    transition: color var(--transition);
  }
  .nav-item.active { color: var(--navy); }
  .nav-item:active { transform: scale(0.95); }
  
  /* ─── Cards ─── */
  .card {
    background: var(--white);
    border-radius: var(--radius);
    padding: 16px;
    margin: 12px 16px;
    box-shadow: var(--shadow);
  }
  
  /* ─── Dashboard ─── */
  .dash-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 16px;
  }
  .dash-stat {
    background: var(--white);
    border-radius: var(--radius);
    padding: 16px;
    box-shadow: var(--shadow);
    text-align: center;
  }
  .dash-stat .number { font-size: 32px; font-weight: 700; color: var(--navy); line-height: 1.1; }
  .dash-stat .label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-weight: 500; }
  .dash-stat.accent .number { color: var(--red); }
  .dash-stat.sky .number { color: var(--sky); }
  
  .recent-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 16px; margin-top: 8px;
  }
  .recent-header h2 { font-size: 15px; font-weight: 600; color: var(--navy); }
  .recent-header button {
    font-size: 13px; color: var(--sky); background: none; border: none;
    cursor: pointer; font-weight: 500; font-family: var(--font);
  }
  
  /* ─── Encounter List ─── */
  .encounter-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background var(--transition);
    background: var(--white);
  }
  .encounter-item:active { background: var(--navy-light); }
  .encounter-badge {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--navy-light); color: var(--navy);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 15px; flex-shrink: 0;
  }
  .encounter-badge.initial { background: var(--red-light); color: var(--red); }
  .encounter-info { flex: 1; min-width: 0; }
  .encounter-info .name { font-weight: 600; font-size: 15px; color: var(--text); }
  .encounter-info .meta { font-size: 12px; color: var(--text-secondary); margin-top: 2px; display: flex; align-items: center; gap: 6px; }
  .encounter-info .matters { font-size: 13px; color: var(--text-secondary); margin-top: 4px; 
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .encounter-type-tag {
    font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 500;
    background: var(--navy-light); color: var(--navy); white-space: nowrap;
  }
  .encounter-type-tag.initial { background: var(--red-light); color: var(--red); }
  
  /* ─── Form Styles ─── */
  .form-section {
    padding: 16px;
  }
  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: var(--navy); color: white;
    margin: 0 -16px; font-weight: 600; font-size: 14px;
    cursor: pointer; user-select: none;
  }
  .section-header.tier2 { background: var(--sky); }
  .section-header.tier3 { background: var(--text-secondary); }
  .tier-label {
    font-size: 10px; font-weight: 500; opacity: 0.8;
    background: rgba(255,255,255,0.2); padding: 1px 8px; border-radius: 10px;
  }
  
  .form-group { margin-bottom: 16px; }
  .form-group label {
    display: block; font-size: 13px; font-weight: 600;
    color: var(--navy); margin-bottom: 6px;
  }
  .form-group .hint {
    font-size: 11px; color: var(--text-secondary); font-weight: 400;
    font-style: italic; margin-bottom: 6px; display: block;
  }
  
  input[type="text"], input[type="date"], input[type="time"], input[type="number"],
  input[type="tel"], input[type="email"], select, textarea {
    width: 100%;
    padding: 12px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 16px;
    font-family: var(--font);
    background: var(--white);
    color: var(--text);
    transition: border-color var(--transition);
    appearance: none;
    -webkit-appearance: none;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--navy);
    box-shadow: 0 0 0 3px rgba(6,72,124,0.1);
  }
  textarea { min-height: 80px; resize: vertical; }
  select { 
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a6672' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
  }
  
  /* ─── What Matters Box ─── */
  .what-matters-box {
    background: var(--red-light);
    border: 2px solid var(--red);
    border-radius: var(--radius);
    padding: 12px;
  }
  .what-matters-box label { color: var(--red) !important; font-size: 14px !important; }
  .what-matters-box textarea { border-color: var(--red); min-height: 70px; }
  .what-matters-box textarea:focus { box-shadow: 0 0 0 3px rgba(219,36,22,0.12); border-color: var(--red); }
  
  /* ─── Chip Select (multi-select) ─── */
  .chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    padding: 8px 14px;
    border-radius: 20px;
    border: 1.5px solid var(--border);
    background: var(--white);
    font-size: 14px;
    font-family: var(--font);
    cursor: pointer;
    transition: all var(--transition);
    user-select: none;
    color: var(--text);
    font-weight: 500;
  }
  .chip:active { transform: scale(0.96); }
  .chip.selected {
    background: var(--navy);
    border-color: var(--navy);
    color: white;
  }
  .chip.selected-sky {
    background: var(--sky);
    border-color: var(--sky);
    color: white;
  }
  
  /* ─── Radio Pills ─── */
  .radio-pills { display: flex; gap: 8px; flex-wrap: wrap; }
  .radio-pill {
    padding: 10px 16px;
    border-radius: 20px;
    border: 1.5px solid var(--border);
    background: var(--white);
    font-size: 14px;
    font-family: var(--font);
    cursor: pointer;
    transition: all var(--transition);
    user-select: none;
    font-weight: 500;
    color: var(--text);
  }
  .radio-pill:active { transform: scale(0.96); }
  .radio-pill.selected { background: var(--navy); border-color: var(--navy); color: white; }
  
  /* ─── GPS Button ─── */
  .gps-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 20px;
    background: var(--sky-light); color: var(--navy);
    border: 1.5px solid var(--sky);
    font-size: 13px; font-weight: 600; cursor: pointer;
    font-family: var(--font); transition: all var(--transition);
    margin-top: 8px;
  }
  .gps-btn:active { background: var(--sky); color: white; }
  .gps-btn.captured { background: var(--sky); color: white; border-color: var(--sky); }
  
  /* ─── Submit Button ─── */
  .btn-primary {
    width: 100%;
    padding: 16px;
    background: var(--navy);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font);
    cursor: pointer;
    transition: all var(--transition);
    box-shadow: var(--shadow-lg);
    margin-top: 8px;
  }
  .btn-primary:active { transform: scale(0.98); background: var(--navy-dark); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary.danger { background: var(--red); }
  
  .btn-secondary {
    width: 100%;
    padding: 14px;
    background: var(--white);
    color: var(--navy);
    border: 1.5px solid var(--navy);
    border-radius: var(--radius);
    font-size: 15px;
    font-weight: 600;
    font-family: var(--font);
    cursor: pointer;
    transition: all var(--transition);
  }
  .btn-secondary:active { background: var(--navy-light); }
  
  /* ─── Client Search ─── */
  .search-bar {
    display: flex; gap: 8px; padding: 12px 16px;
    background: var(--white); border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 10;
  }
  .search-bar input {
    flex: 1; padding: 12px 14px; border-radius: 24px;
    border: 1.5px solid var(--border); font-size: 16px;
  }
  .search-bar input:focus { border-color: var(--navy); }
  
  .client-item {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
    cursor: pointer; background: var(--white);
    transition: background var(--transition);
  }
  .client-item:active { background: var(--navy-light); }
  .client-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--navy); color: white;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 16px; flex-shrink: 0;
  }
  .client-details { flex: 1; }
  .client-details .name { font-weight: 600; font-size: 15px; }
  .client-details .sub { font-size: 12px; color: var(--text-secondary); margin-top: 1px; }
  .encounter-count {
    background: var(--navy-light); color: var(--navy); font-size: 12px;
    font-weight: 600; padding: 4px 10px; border-radius: 20px;
  }
  
  /* ─── Client Profile ─── */
  .profile-header {
    background: var(--navy);
    color: white;
    padding: 20px 16px;
    text-align: center;
  }
  .profile-avatar {
    width: 64px; height: 64px; border-radius: 50%;
    background: rgba(255,255,255,0.15);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 10px; font-size: 26px; font-weight: 700;
  }
  .profile-header h2 { font-size: 20px; font-weight: 700; }
  .profile-header .sub { font-size: 13px; opacity: 0.8; margin-top: 2px; }
  .profile-actions {
    display: flex; gap: 10px; padding: 12px 16px; margin-top: 4px;
  }
  .profile-action-btn {
    flex: 1; padding: 12px; border-radius: var(--radius);
    font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: var(--font); transition: all var(--transition);
    display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  
  /* ─── Toast ─── */
  .toast {
    position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
    background: var(--navy); color: white; padding: 12px 24px;
    border-radius: 24px; font-size: 14px; font-weight: 500;
    box-shadow: var(--shadow-lg); z-index: 200;
    animation: toastIn 0.3s ease;
    display: flex; align-items: center; gap: 8px;
  }
  .toast.success { background: #1a8754; }
  .toast.error { background: var(--red); }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  
  /* ─── Collapsible ─── */
  .collapsible-content { overflow: hidden; transition: max-height 0.3s ease; }
  
  /* ─── Empty State ─── */
  .empty-state {
    text-align: center; padding: 40px 24px; color: var(--text-secondary);
  }
  .empty-state .icon { opacity: 0.3; margin-bottom: 12px; }
  .empty-state h3 { font-size: 16px; color: var(--text); margin-bottom: 4px; }
  .empty-state p { font-size: 13px; }
  
  /* ─── Divider ─── */
  .section-divider {
    font-size: 12px; font-weight: 600; color: var(--text-secondary);
    text-transform: uppercase; letter-spacing: 0.5px;
    padding: 10px 16px 6px; background: var(--bg);
  }
  
  /* ─── Encounter Detail ─── */
  .detail-field { padding: 10px 16px; border-bottom: 1px solid var(--border); }
  .detail-field .field-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; }
  .detail-field .field-value { font-size: 15px; margin-top: 2px; color: var(--text); }
  .detail-field .field-value.highlight { color: var(--red); font-weight: 600; }
  
  /* ─── Worker select ─── */
  .worker-select-row {
    display: flex; gap: 8px; padding: 12px 16px;
    background: var(--navy-light); align-items: center;
    border-bottom: 1px solid var(--border);
  }
  .worker-select-row label { font-size: 13px; font-weight: 600; color: var(--navy); white-space: nowrap; }
  .worker-select-row select { flex: 1; padding: 8px 12px; font-size: 14px; }
  
  /* ─── Scrollable ─── */
  .scrollable { overflow-y: auto; -webkit-overflow-scrolling: touch; }
`;

// ─── Helper Components ───

function ChipSelect({ options, selected, onChange, colorClass = 'selected' }) {
  const toggle = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(s => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };
  return (
    <div className="chip-group">
      {options.map(opt => (
        <button key={opt} type="button" className={`chip ${selected.includes(opt) ? colorClass : ''}`}
          onClick={() => toggle(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function RadioPills({ options, value, onChange }) {
  return (
    <div className="radio-pills">
      {options.map(opt => (
        <button key={opt} type="button" className={`radio-pill ${value === opt ? 'selected' : ''}`}
          onClick={() => onChange(value === opt ? '' : opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function CollapsibleSection({ title, tier, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const tierClass = tier === 2 ? 'tier2' : tier === 3 ? 'tier3' : '';
  return (
    <div>
      <div className={`section-header ${tierClass}`} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tier && <span className="tier-label">Tier {tier}</span>}
          {open ? Icons.chevUp : Icons.chevDown}
        </span>
      </div>
      <div className="collapsible-content" style={{ maxHeight: open ? '2000px' : '0' }}>
        <div style={{ padding: '12px 0' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`toast ${type}`}>
      {type === 'success' ? Icons.check : Icons.alert}
      {message}
    </div>
  );
}

// ─── Main App ───

export default function App() {
  const [view, setView] = useState('dashboard');
  const [viewStack, setViewStack] = useState([]);
  const [clients, setClients] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedEncounter, setSelectedEncounter] = useState(null);
  const [toast, setToast] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [activeWorker, setActiveWorker] = useState(null);

  // Load data from IndexedDB
  const loadData = useCallback(async () => {
    try {
      await ensureDefaultWorker();
      const [c, e, w] = await Promise.all([
        dbGetAll('clients'),
        dbGetAll('encounters'),
        dbGetAll('workers'),
      ]);
      setClients(c);
      setEncounters(e);
      setWorkers(w);
      if (w.length > 0 && !activeWorker) setActiveWorker(w[0].id);
    } catch (err) {
      console.error('DB load error:', err);
    }
  }, [activeWorker]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const navigate = (newView, params = {}) => {
    setViewStack(prev => [...prev, { view, selectedClient, selectedEncounter }]);
    if (params.client) setSelectedClient(params.client);
    if (params.encounter) setSelectedEncounter(params.encounter);
    setView(newView);
  };

  const goBack = () => {
    const stack = [...viewStack];
    const prev = stack.pop();
    if (prev) {
      setViewStack(stack);
      setView(prev.view);
      setSelectedClient(prev.selectedClient);
      setSelectedEncounter(prev.selectedEncounter);
    } else {
      setView('dashboard');
    }
  };

  const showToast = (message, type = 'success') => setToast({ message, type });

  // Helpers
  const getClientEncounters = (clientId) => 
    encounters.filter(e => e.client_id === clientId).sort((a, b) => 
      new Date(b.encounter_date) - new Date(a.encounter_date));

  const getClientName = (client) => {
    if (!client) return 'Unknown';
    const parts = [];
    if (client.first_name) parts.push(client.first_name);
    if (client.last_name) parts.push(client.last_name);
    if (parts.length === 0 && client.alias_street_name) return `"${client.alias_street_name}"`;
    const name = parts.join(' ') || 'Unknown';
    if (client.alias_street_name) return `${name} ("${client.alias_street_name}")`;
    return name;
  };

  const getInitials = (client) => {
    if (!client) return '?';
    if (client.first_name && client.last_name) 
      return (client.first_name[0] + client.last_name[0]).toUpperCase();
    if (client.first_name) return client.first_name[0].toUpperCase();
    if (client.alias_street_name) return client.alias_street_name[0].toUpperCase();
    return '?';
  };

  // Stats
  const today = new Date().toISOString().split('T')[0];
  const thisWeekStart = (() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  })();
  const todayEncounters = encounters.filter(e => e.encounter_date === today);
  const weekEncounters = encounters.filter(e => e.encounter_date >= thisWeekStart);
  const newClientsThisWeek = clients.filter(c => c.created_at >= thisWeekStart);

  // ─── Title for current view ───
  const viewTitles = {
    dashboard: 'Bridges Outreach',
    clients: 'Clients',
    newEncounter: selectedClient ? 'New Encounter' : 'New Encounter',
    clientProfile: selectedClient ? getClientName(selectedClient) : 'Client',
    encounterDetail: 'Encounter Detail',
    recentEncounters: 'Recent Encounters',
    selectClient: 'Select Client',
  };

  const showBack = view !== 'dashboard' && view !== 'clients' && view !== 'recentEncounters';

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* Header */}
        <div className="header">
          {showBack && (
            <button className="header-btn" onClick={goBack}>{Icons.back}</button>
          )}
          <h1>{viewTitles[view] || 'Bridges Outreach'}</h1>
          <div className={`status-bar ${online ? 'status-online' : 'status-offline'}`}>
            {online ? Icons.wifi : Icons.wifiOff}
            {online ? 'Online' : 'Offline'}
          </div>
        </div>

        {/* Worker selector (persistent) */}
        {workers.length > 0 && (view === 'dashboard' || view === 'newEncounter') && (
          <div className="worker-select-row">
            <label>Worker:</label>
            <select value={activeWorker || ''} onChange={e => setActiveWorker(e.target.value)}>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        {/* Main Content */}
        <div className="main scrollable">
          {view === 'dashboard' && (
            <DashboardView
              todayCount={todayEncounters.length}
              weekCount={weekEncounters.length}
              totalClients={clients.length}
              newThisWeek={newClientsThisWeek.length}
              recentEncounters={encounters.sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)}
              clients={clients}
              navigate={navigate}
              getClientName={getClientName}
              getInitials={getInitials}
            />
          )}
          {view === 'clients' && (
            <ClientSearchView
              clients={clients}
              encounters={encounters}
              navigate={navigate}
              getClientName={getClientName}
              getInitials={getInitials}
              getClientEncounters={getClientEncounters}
            />
          )}
          {view === 'newEncounter' && (
            <EncounterFormView
              client={selectedClient}
              workerId={activeWorker}
              workers={workers}
              clients={clients}
              onSave={async (encounter, client, isNew) => {
                if (isNew) {
                  await dbPut('clients', client);
                }
                await dbPut('encounters', encounter);
                await loadData();
                showToast('Encounter saved');
                goBack();
              }}
              navigate={navigate}
              getClientName={getClientName}
              getInitials={getInitials}
              getClientEncounters={getClientEncounters}
            />
          )}
          {view === 'clientProfile' && selectedClient && (
            <ClientProfileView
              client={selectedClient}
              encounters={getClientEncounters(selectedClient.id)}
              navigate={navigate}
              getClientName={getClientName}
              getInitials={getInitials}
            />
          )}
          {view === 'encounterDetail' && selectedEncounter && (
            <EncounterDetailView
              encounter={selectedEncounter}
              client={clients.find(c => c.id === selectedEncounter.client_id)}
              workers={workers}
              goBack={goBack}
              getClientName={getClientName}
            />
          )}
          {view === 'recentEncounters' && (
            <RecentEncountersView
              encounters={encounters}
              clients={clients}
              navigate={navigate}
              getClientName={getClientName}
              getInitials={getInitials}
            />
          )}
          {view === 'selectClient' && (
            <SelectClientView
              clients={clients}
              navigate={navigate}
              getClientName={getClientName}
              getInitials={getInitials}
              getClientEncounters={getClientEncounters}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setViewStack([]); setView('dashboard'); }}>
            {Icons.home}<span>Home</span>
          </button>
          <button className={`nav-item ${view === 'clients' ? 'active' : ''}`}
            onClick={() => { setViewStack([]); setView('clients'); }}>
            {Icons.search}<span>Clients</span>
          </button>
          <button className={`nav-item ${view === 'newEncounter' || view === 'selectClient' ? 'active' : ''}`}
            onClick={() => { 
              setViewStack([]); setSelectedClient(null); setView('selectClient'); 
            }}>
            <div style={{ 
              background: 'var(--red)', borderRadius: '50%', width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', marginTop: -14, boxShadow: '0 2px 8px rgba(219,36,22,0.35)'
            }}>
              {Icons.plus}
            </div>
            <span style={{ marginTop: 2 }}>Encounter</span>
          </button>
          <button className={`nav-item ${view === 'recentEncounters' ? 'active' : ''}`}
            onClick={() => { setViewStack([]); setView('recentEncounters'); }}>
            {Icons.list}<span>Recent</span>
          </button>
          <button className="nav-item" onClick={() => {
            const name = prompt('Add worker name:');
            if (name) {
              const w = { id: uuid(), name, role: 'Outreach Worker', active: true, created_at: new Date().toISOString() };
              dbPut('workers', w).then(loadData);
              showToast(`Added ${name}`);
            }
          }}>
            {Icons.user}<span>Team</span>
          </button>
        </div>

        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// VIEW: Dashboard
// ═══════════════════════════════════════════
function DashboardView({ todayCount, weekCount, totalClients, newThisWeek, recentEncounters, clients, navigate, getClientName, getInitials }) {
  return (
    <>
      <div className="dash-grid">
        <div className="dash-stat accent">
          <div className="number">{todayCount}</div>
          <div className="label">Encounters Today</div>
        </div>
        <div className="dash-stat">
          <div className="number">{weekCount}</div>
          <div className="label">This Week</div>
        </div>
        <div className="dash-stat sky">
          <div className="number">{totalClients}</div>
          <div className="label">Total Clients</div>
        </div>
        <div className="dash-stat">
          <div className="number">{newThisWeek}</div>
          <div className="label">New This Week</div>
        </div>
      </div>

      <div className="recent-header">
        <h2>Recent Encounters</h2>
        <button onClick={() => navigate('recentEncounters')}>See All</button>
      </div>

      {recentEncounters.length === 0 ? (
        <div className="empty-state">
          <div className="icon" style={{ fontSize: 48 }}>📋</div>
          <h3>No encounters yet</h3>
          <p>Tap the + button to log your first street encounter</p>
        </div>
      ) : (
        recentEncounters.map(enc => {
          const client = clients.find(c => c.id === enc.client_id);
          return (
            <div key={enc.id} className="encounter-item" onClick={() => navigate('encounterDetail', { encounter: enc })}>
              <div className={`encounter-badge ${enc.encounter_type === 'Initial Contact' ? 'initial' : ''}`}>
                {getInitials(client)}
              </div>
              <div className="encounter-info">
                <div className="name">{getClientName(client)}</div>
                <div className="meta">
                  {Icons.clock}<span>{enc.encounter_date}</span>
                  <span>·</span>
                  {Icons.mapPin}<span>{enc.location_text || '—'}</span>
                </div>
                {enc.what_matters && <div className="matters">"{enc.what_matters}"</div>}
              </div>
              <span className={`encounter-type-tag ${enc.encounter_type === 'Initial Contact' ? 'initial' : ''}`}>
                {enc.encounter_type === 'Initial Contact' ? 'New' : 
                 enc.encounter_type === 'Attempted/Not Located' ? 'Missed' : 
                 enc.encounter_type === 'Follow-Up' ? 'F/U' : 'Ref'}
              </span>
            </div>
          );
        })
      )}
    </>
  );
}

// ═══════════════════════════════════════════
// VIEW: Client Search
// ═══════════════════════════════════════════
function ClientSearchView({ clients, encounters, navigate, getClientName, getInitials, getClientEncounters }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!query.trim()) return clients.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    const q = query.toLowerCase();
    return clients.filter(c =>
      (c.first_name || '').toLowerCase().includes(q) ||
      (c.last_name || '').toLowerCase().includes(q) ||
      (c.alias_street_name || '').toLowerCase().includes(q)
    );
  }, [clients, query]);

  return (
    <>
      <div className="search-bar">
        <input type="text" placeholder="Search by name or alias..." value={query}
          onChange={e => setQuery(e.target.value)} autoFocus />
      </div>
      <div className="section-divider">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</div>
      {filtered.map(client => (
        <div key={client.id} className="client-item" onClick={() => navigate('clientProfile', { client })}>
          <div className="client-avatar">{getInitials(client)}</div>
          <div className="client-details">
            <div className="name">{getClientName(client)}</div>
            <div className="sub">
              {client.reliable_location ? `📍 ${client.reliable_location}` : 'No location recorded'}
            </div>
          </div>
          <span className="encounter-count">{getClientEncounters(client.id).length}</span>
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>No clients found</h3>
          <p>Try a different search or create a new encounter</p>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════
// VIEW: Select Client (before encounter)
// ═══════════════════════════════════════════
function SelectClientView({ clients, navigate, getClientName, getInitials, getClientEncounters }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!query.trim()) return clients.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    const q = query.toLowerCase();
    return clients.filter(c =>
      (c.first_name || '').toLowerCase().includes(q) ||
      (c.last_name || '').toLowerCase().includes(q) ||
      (c.alias_street_name || '').toLowerCase().includes(q)
    );
  }, [clients, query]);

  return (
    <>
      <div style={{ padding: 16 }}>
        <button className="btn-primary" style={{ background: 'var(--red)' }}
          onClick={() => navigate('newEncounter', { client: null })}>
          + New Person (First Contact)
        </button>
      </div>
      <div className="section-divider">Or select existing client</div>
      <div className="search-bar">
        <input type="text" placeholder="Search by name or alias..." value={query}
          onChange={e => setQuery(e.target.value)} />
      </div>
      {filtered.map(client => (
        <div key={client.id} className="client-item" onClick={() => navigate('newEncounter', { client })}>
          <div className="client-avatar">{getInitials(client)}</div>
          <div className="client-details">
            <div className="name">{getClientName(client)}</div>
            <div className="sub">{client.reliable_location || 'No location'}</div>
          </div>
          <span className="encounter-count">{getClientEncounters(client.id).length}</span>
        </div>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════
// VIEW: Encounter Form (THE CORE)
// ═══════════════════════════════════════════
function EncounterFormView({ client, workerId, workers, clients, onSave, navigate, getClientName, getInitials, getClientEncounters }) {
  const isNewClient = !client;
  const [saving, setSaving] = useState(false);

  // Client fields (for new client)
  const [firstName, setFirstName] = useState(client?.first_name || '');
  const [lastName, setLastName] = useState(client?.last_name || '');
  const [alias, setAlias] = useState(client?.alias_street_name || '');
  const [reliableLocation, setReliableLocation] = useState(client?.reliable_location || '');
  const [dob, setDob] = useState(client?.date_of_birth || '');
  const [gender, setGender] = useState(client?.gender || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [trustedName, setTrustedName] = useState(client?.trusted_contact_name || '');
  const [trustedPhone, setTrustedPhone] = useState(client?.trusted_contact_phone || '');

  // Encounter fields
  const [encounterDate, setEncounterDate] = useState(new Date().toISOString().split('T')[0]);
  const [encounterTime, setEncounterTime] = useState(new Date().toTimeString().slice(0, 5));
  const [encounterType, setEncounterType] = useState(isNewClient ? 'Initial Contact' : 'Follow-Up');
  const [locationText, setLocationText] = useState('');
  const [locationLat, setLocationLat] = useState(null);
  const [locationLng, setLocationLng] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [whatMatters, setWhatMatters] = useState('');
  const [focusToday, setFocusToday] = useState([]);
  const [sleepingLocation, setSleepingLocation] = useState('');
  const [sleepingOther, setSleepingOther] = useState('');
  const [timeAtLocation, setTimeAtLocation] = useState('');
  const [totalHomelessDuration, setTotalHomelessDuration] = useState('');
  const [homelessnessStart, setHomelessnessStart] = useState('');
  const [meetsChronic, setMeetsChronic] = useState('');
  const [priorEpisodes, setPriorEpisodes] = useState('');
  const [interestHousing, setInterestHousing] = useState('');
  const [interestShelter, setInterestShelter] = useState('');
  const [servicesOfInterest, setServicesOfInterest] = useState([]);
  const [housingPrefStated, setHousingPrefStated] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpActions, setFollowUpActions] = useState('');
  const [safetyConcerns, setSafetyConcerns] = useState('');

  const captureGPS = () => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }
    setGpsStatus('capturing');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationLat(pos.coords.latitude);
        setLocationLng(pos.coords.longitude);
        setGpsStatus('captured');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const canSubmit = firstName.trim() && encounterDate && locationText.trim();

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      let clientRecord = client;
      let isNew = false;

      if (isNewClient) {
        clientRecord = {
          id: uuid(),
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          alias_street_name: alias.trim() || null,
          date_of_birth: dob || null,
          gender: gender || null,
          phone: phone.trim() || null,
          email: null,
          ssn_last4: null,
          reliable_location: reliableLocation.trim() || null,
          trusted_contact_name: trustedName.trim() || null,
          trusted_contact_phone: trustedPhone.trim() || null,
          race: null,
          ethnicity: null,
          hmis_client_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        isNew = true;
      } else {
        // Update client record with any new info
        clientRecord = { ...client };
        if (lastName.trim() && !client.last_name) clientRecord.last_name = lastName.trim();
        if (alias.trim()) clientRecord.alias_street_name = alias.trim();
        if (dob && !client.date_of_birth) clientRecord.date_of_birth = dob;
        if (gender && !client.gender) clientRecord.gender = gender;
        if (phone.trim() && !client.phone) clientRecord.phone = phone.trim();
        if (reliableLocation.trim()) clientRecord.reliable_location = reliableLocation.trim();
        if (trustedName.trim() && !client.trusted_contact_name) clientRecord.trusted_contact_name = trustedName.trim();
        if (trustedPhone.trim() && !client.trusted_contact_phone) clientRecord.trusted_contact_phone = trustedPhone.trim();
        clientRecord.updated_at = new Date().toISOString();
        // For existing clients, still write to DB
        isNew = false;
        await dbPut('clients', clientRecord);
      }

      const encounter = {
        id: uuid(),
        client_id: clientRecord.id,
        worker_id: workerId,
        encounter_date: encounterDate,
        encounter_time: encounterTime || null,
        encounter_type: encounterType,
        location_text: locationText.trim(),
        location_lat: locationLat,
        location_lng: locationLng,
        what_matters: whatMatters.trim() || null,
        focus_today: focusToday.length > 0 ? focusToday : null,
        sleeping_location: sleepingLocation || null,
        sleeping_location_other: sleepingOther.trim() || null,
        time_at_location: timeAtLocation.trim() || null,
        total_homeless_duration: totalHomelessDuration.trim() || null,
        homelessness_start_date: homelessnessStart || null,
        meets_chronic_criteria: meetsChronic || null,
        prior_episodes_3yr: priorEpisodes ? parseInt(priorEpisodes) : null,
        interest_housing: interestHousing || null,
        interest_shelter: interestShelter || null,
        services_of_interest: servicesOfInterest.length > 0 ? servicesOfInterest : null,
        housing_preference_stated: housingPrefStated.trim() || null,
        notes: notes.trim() || null,
        follow_up_actions: followUpActions.trim() || null,
        safety_concerns: safetyConcerns.trim() || null,
        created_at: new Date().toISOString(),
      };

      await onSave(encounter, clientRecord, isNew);
    } catch (err) {
      console.error('Save error:', err);
      setSaving(false);
    }
  };

  return (
    <div className="form-section">
      {/* Existing client banner */}
      {client && (
        <div style={{ 
          background: 'var(--sky-light)', border: '1.5px solid var(--sky)', 
          borderRadius: 'var(--radius)', padding: 12, marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <div className="client-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
            {getInitials(client)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{getClientName(client)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {getClientEncounters(client.id).length} prior encounter{getClientEncounters(client.id).length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {/* ── TIER 1: Every Encounter ── */}
      <CollapsibleSection title="Encounter Basics" tier={1} defaultOpen={true}>
        {isNewClient && (
          <>
            <div className="form-group">
              <label>First Name *</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="Required — even just a first name" autoFocus />
            </div>
            <div className="form-group">
              <label>Alias / Street Name</label>
              <span className="hint">Often more useful than legal name</span>
              <input type="text" value={alias} onChange={e => setAlias(e.target.value)}
                placeholder="How they're known on the street" />
            </div>
          </>
        )}

        <div className="form-group">
          <label>Date & Time</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={encounterDate} onChange={e => setEncounterDate(e.target.value)} 
              style={{ flex: 2 }} />
            <input type="time" value={encounterTime} onChange={e => setEncounterTime(e.target.value)} 
              style={{ flex: 1 }} />
          </div>
        </div>

        <div className="form-group">
          <label>Encounter Type</label>
          <RadioPills options={ENCOUNTER_TYPES} value={encounterType} onChange={setEncounterType} />
        </div>

        <div className="form-group">
          <label>Location *</label>
          <span className="hint">Cross streets or description</span>
          <input type="text" value={locationText} onChange={e => setLocationText(e.target.value)}
            placeholder="e.g., Broad & Market, under NJ Transit bridge" />
          <button className={`gps-btn ${gpsStatus === 'captured' ? 'captured' : ''}`} onClick={captureGPS}
            disabled={gpsStatus === 'capturing'}>
            {Icons.gps}
            {gpsStatus === 'idle' && 'Capture GPS'}
            {gpsStatus === 'capturing' && 'Getting location...'}
            {gpsStatus === 'captured' && `✓ ${locationLat?.toFixed(4)}, ${locationLng?.toFixed(4)}`}
            {gpsStatus === 'error' && 'GPS failed — try again'}
            {gpsStatus === 'unavailable' && 'GPS not available'}
          </button>
        </div>

        <div className="form-group what-matters-box">
          <label>✦ "What Matters to You?"</label>
          <span className="hint" style={{ color: 'var(--red)' }}>Lead with this. The person's own words about what they want.</span>
          <textarea value={whatMatters} onChange={e => setWhatMatters(e.target.value)}
            placeholder="In their own words — what do they want right now? What are they working toward?" />
        </div>

        <div className="form-group">
          <label>Focus Today</label>
          <span className="hint">What does the person want to work on right now?</span>
          <ChipSelect options={FOCUS_TODAY_OPTIONS} selected={focusToday} onChange={setFocusToday} />
        </div>

        <div className="form-group">
          <label>Sleeping Location Tonight</label>
          <select value={sleepingLocation} onChange={e => setSleepingLocation(e.target.value)}>
            <option value="">— Select —</option>
            {SLEEPING_LOCATIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {sleepingLocation === 'Other' && (
            <input type="text" value={sleepingOther} onChange={e => setSleepingOther(e.target.value)}
              placeholder="Describe" style={{ marginTop: 8 }} />
          )}
        </div>

        <div className="form-group">
          <label>Interest in Housing</label>
          <RadioPills options={INTEREST_OPTIONS} value={interestHousing} onChange={setInterestHousing} />
        </div>

        <div className="form-group">
          <label>Interest in Shelter</label>
          <RadioPills options={INTEREST_OPTIONS} value={interestShelter} onChange={setInterestShelter} />
        </div>

        {isNewClient && (
          <div className="form-group">
            <label>Reliable Location to Find Them</label>
            <input type="text" value={reliableLocation} onChange={e => setReliableLocation(e.target.value)}
              placeholder="Where to find them between encounters" />
          </div>
        )}
      </CollapsibleSection>

      {/* ── TIER 2: Capture When Possible ── */}
      <CollapsibleSection title="Additional Info — When Possible" tier={2}>
        {isNewClient && (
          <>
            <div className="form-group">
              <label>Last Name</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={gender} onChange={e => setGender(e.target.value)}>
                <option value="">— Select —</option>
                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="If they have one" />
            </div>
            <div className="form-group">
              <label>Trusted Contact</label>
              <input type="text" value={trustedName} onChange={e => setTrustedName(e.target.value)}
                placeholder="Name" style={{ marginBottom: 8 }} />
              <input type="tel" value={trustedPhone} onChange={e => setTrustedPhone(e.target.value)}
                placeholder="Phone" />
            </div>
          </>
        )}
        {!isNewClient && (
          <>
            {!client.last_name && (
              <div className="form-group">
                <label>Last Name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            )}
            {!client.date_of_birth && (
              <div className="form-group">
                <label>Date of Birth</label>
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} />
              </div>
            )}
            {!client.gender && (
              <div className="form-group">
                <label>Gender</label>
                <select value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="">— Select —</option>
                  {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
            {!client.phone && (
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            )}
          </>
        )}

        <div className="form-group">
          <label>Time at Current Location</label>
          <input type="text" value={timeAtLocation} onChange={e => setTimeAtLocation(e.target.value)}
            placeholder="e.g., 3 months, since last winter" />
        </div>
        <div className="form-group">
          <label>Total Duration of Homelessness</label>
          <input type="text" value={totalHomelessDuration} onChange={e => setTotalHomelessDuration(e.target.value)}
            placeholder="e.g., 2 years, off and on for 5 years" />
        </div>
        <div className="form-group">
          <label>Approximate Start Date</label>
          <input type="date" value={homelessnessStart} onChange={e => setHomelessnessStart(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Meets Chronic Criteria?</label>
          <RadioPills options={CHRONIC_OPTIONS} value={meetsChronic} onChange={setMeetsChronic} />
        </div>
        <div className="form-group">
          <label>Prior Episodes (Last 3 Years)</label>
          <input type="number" value={priorEpisodes} onChange={e => setPriorEpisodes(e.target.value)}
            placeholder="Number of episodes" min="0" />
        </div>
        <div className="form-group">
          <label>Services of Interest</label>
          <ChipSelect options={SERVICES_OPTIONS} selected={servicesOfInterest} 
            onChange={setServicesOfInterest} colorClass="selected-sky" />
        </div>
      </CollapsibleSection>

      {/* ── TIER 3: Build Over Time ── */}
      <CollapsibleSection title="Deep Context — Build Over Time" tier={3}>
        <div className="form-group">
          <label>Housing Preference (Stated)</label>
          <span className="hint">What do they actually want? This is a real constraint, not a wish list.</span>
          <textarea value={housingPrefStated} onChange={e => setHousingPrefStated(e.target.value)}
            placeholder="Own apartment near family, shared housing okay, needs ground floor, etc." />
        </div>
      </CollapsibleSection>

      {/* ── Engagement Notes ── */}
      <CollapsibleSection title="Engagement Notes" defaultOpen={false}>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Engagement observations, rapport notes, context..." />
        </div>
        <div className="form-group">
          <label>Follow-Up Actions</label>
          <textarea value={followUpActions} onChange={e => setFollowUpActions(e.target.value)}
            placeholder="What needs to happen next?" />
        </div>
        <div className="form-group">
          <label>Safety Concerns</label>
          <textarea value={safetyConcerns} onChange={e => setSafetyConcerns(e.target.value)}
            placeholder="DV, exploitation, medical emergency, environmental..." />
        </div>
      </CollapsibleSection>

      <div style={{ padding: '16px 0' }}>
        <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit || saving}>
          {saving ? 'Saving...' : `Save Encounter${isNewClient ? ' + New Client' : ''}`}
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          * Only first name and location are required. Everything else builds over time.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// VIEW: Client Profile
// ═══════════════════════════════════════════
function ClientProfileView({ client, encounters, navigate, getClientName, getInitials }) {
  // Compute completeness
  const fields = ['first_name', 'last_name', 'date_of_birth', 'gender', 'phone', 'reliable_location', 'trusted_contact_name'];
  const filled = fields.filter(f => client[f]).length;
  const pct = Math.round((filled / fields.length) * 100);

  return (
    <>
      <div className="profile-header">
        <div className="profile-avatar">{getInitials(client)}</div>
        <h2>{getClientName(client)}</h2>
        <div className="sub">
          {client.reliable_location && `📍 ${client.reliable_location}`}
          {client.date_of_birth && ` · DOB: ${client.date_of_birth}`}
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ 
            width: 120, height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden'
          }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--sky)', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{pct}% complete</span>
        </div>
      </div>

      <div className="profile-actions">
        <button className="profile-action-btn" 
          style={{ background: 'var(--red)', color: 'white', border: 'none' }}
          onClick={() => navigate('newEncounter', { client })}>
          {Icons.plus} New Encounter
        </button>
      </div>

      {/* Client details */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Client Details</div>
        {client.alias_street_name && (
          <div className="detail-field" style={{ padding: '6px 0' }}>
            <div className="field-label">Alias / Street Name</div>
            <div className="field-value">{client.alias_street_name}</div>
          </div>
        )}
        {client.gender && (
          <div className="detail-field" style={{ padding: '6px 0' }}>
            <div className="field-label">Gender</div>
            <div className="field-value">{client.gender}</div>
          </div>
        )}
        {client.phone && (
          <div className="detail-field" style={{ padding: '6px 0' }}>
            <div className="field-label">Phone</div>
            <div className="field-value">{client.phone}</div>
          </div>
        )}
        {client.trusted_contact_name && (
          <div className="detail-field" style={{ padding: '6px 0' }}>
            <div className="field-label">Trusted Contact</div>
            <div className="field-value">{client.trusted_contact_name} {client.trusted_contact_phone ? `— ${client.trusted_contact_phone}` : ''}</div>
          </div>
        )}
      </div>

      {/* Encounter History */}
      <div className="section-divider">
        ENCOUNTER HISTORY ({encounters.length})
      </div>
      {encounters.length === 0 ? (
        <div className="empty-state">
          <h3>No encounters recorded</h3>
        </div>
      ) : (
        encounters.map(enc => (
          <div key={enc.id} className="encounter-item" onClick={() => navigate('encounterDetail', { encounter: enc })}>
            <div className={`encounter-badge ${enc.encounter_type === 'Initial Contact' ? 'initial' : ''}`}>
              {enc.encounter_type === 'Initial Contact' ? 'IC' : 
               enc.encounter_type === 'Follow-Up' ? 'FU' : 
               enc.encounter_type === 'Attempted/Not Located' ? 'NL' : 'RF'}
            </div>
            <div className="encounter-info">
              <div className="name">{enc.encounter_type}</div>
              <div className="meta">
                {Icons.clock}<span>{enc.encounter_date}</span>
                <span>·</span>
                {Icons.mapPin}<span>{enc.location_text || '—'}</span>
              </div>
              {enc.what_matters && <div className="matters">"{enc.what_matters}"</div>}
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ═══════════════════════════════════════════
// VIEW: Encounter Detail
// ═══════════════════════════════════════════
function EncounterDetailView({ encounter, client, workers, goBack, getClientName }) {
  const worker = workers.find(w => w.id === encounter.worker_id);
  const e = encounter;

  return (
    <div>
      {/* Type banner */}
      <div style={{ 
        background: e.encounter_type === 'Initial Contact' ? 'var(--red-light)' : 'var(--navy-light)',
        padding: '12px 16px', fontWeight: 600, fontSize: 14,
        color: e.encounter_type === 'Initial Contact' ? 'var(--red)' : 'var(--navy)',
      }}>
        {e.encounter_type} · {e.encounter_date} {e.encounter_time ? `at ${e.encounter_time}` : ''}
      </div>

      <div className="detail-field">
        <div className="field-label">Client</div>
        <div className="field-value">{getClientName(client)}</div>
      </div>
      <div className="detail-field">
        <div className="field-label">Worker</div>
        <div className="field-value">{worker?.name || 'Unknown'}</div>
      </div>
      <div className="detail-field">
        <div className="field-label">Location</div>
        <div className="field-value">
          {e.location_text}
          {e.location_lat && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> ({e.location_lat.toFixed(4)}, {e.location_lng.toFixed(4)})</span>}
        </div>
      </div>

      {e.what_matters && (
        <div className="detail-field" style={{ background: 'var(--red-light)' }}>
          <div className="field-label" style={{ color: 'var(--red)' }}>✦ What Matters to You</div>
          <div className="field-value highlight">"{e.what_matters}"</div>
        </div>
      )}

      {e.focus_today && e.focus_today.length > 0 && (
        <div className="detail-field">
          <div className="field-label">Focus Today</div>
          <div className="field-value">{e.focus_today.join(', ')}</div>
        </div>
      )}

      {e.sleeping_location && (
        <div className="detail-field">
          <div className="field-label">Sleeping Location</div>
          <div className="field-value">{e.sleeping_location}{e.sleeping_location_other ? ` — ${e.sleeping_location_other}` : ''}</div>
        </div>
      )}

      {e.interest_housing && (
        <div className="detail-field">
          <div className="field-label">Interest in Housing</div>
          <div className="field-value">{e.interest_housing}</div>
        </div>
      )}
      {e.interest_shelter && (
        <div className="detail-field">
          <div className="field-label">Interest in Shelter</div>
          <div className="field-value">{e.interest_shelter}</div>
        </div>
      )}

      {e.time_at_location && (
        <div className="detail-field">
          <div className="field-label">Time at Location</div>
          <div className="field-value">{e.time_at_location}</div>
        </div>
      )}
      {e.total_homeless_duration && (
        <div className="detail-field">
          <div className="field-label">Total Homeless Duration</div>
          <div className="field-value">{e.total_homeless_duration}</div>
        </div>
      )}
      {e.meets_chronic_criteria && (
        <div className="detail-field">
          <div className="field-label">Meets Chronic Criteria</div>
          <div className="field-value">{e.meets_chronic_criteria}</div>
        </div>
      )}

      {e.services_of_interest && e.services_of_interest.length > 0 && (
        <div className="detail-field">
          <div className="field-label">Services of Interest</div>
          <div className="field-value">{e.services_of_interest.join(', ')}</div>
        </div>
      )}

      {e.housing_preference_stated && (
        <div className="detail-field">
          <div className="field-label">Housing Preference (Stated)</div>
          <div className="field-value">{e.housing_preference_stated}</div>
        </div>
      )}

      {e.notes && (
        <div className="detail-field">
          <div className="field-label">Notes</div>
          <div className="field-value">{e.notes}</div>
        </div>
      )}
      {e.follow_up_actions && (
        <div className="detail-field">
          <div className="field-label">Follow-Up Actions</div>
          <div className="field-value">{e.follow_up_actions}</div>
        </div>
      )}
      {e.safety_concerns && (
        <div className="detail-field" style={{ background: 'var(--red-light)' }}>
          <div className="field-label" style={{ color: 'var(--red)' }}>Safety Concerns</div>
          <div className="field-value">{e.safety_concerns}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// VIEW: Recent Encounters
// ═══════════════════════════════════════════
function RecentEncountersView({ encounters, clients, navigate, getClientName, getInitials }) {
  const sorted = [...encounters].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  // Group by date
  const groups = {};
  sorted.forEach(enc => {
    const d = enc.encounter_date;
    if (!groups[d]) groups[d] = [];
    groups[d].push(enc);
  });

  if (sorted.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon" style={{ fontSize: 48 }}>📋</div>
        <h3>No encounters yet</h3>
        <p>Tap the + button to log your first encounter</p>
      </div>
    );
  }

  return (
    <>
      {Object.entries(groups).map(([date, encs]) => (
        <div key={date}>
          <div className="section-divider">
            {date === new Date().toISOString().split('T')[0] ? 'Today' : date} · {encs.length} encounter{encs.length !== 1 ? 's' : ''}
          </div>
          {encs.map(enc => {
            const client = clients.find(c => c.id === enc.client_id);
            return (
              <div key={enc.id} className="encounter-item" onClick={() => navigate('encounterDetail', { encounter: enc })}>
                <div className={`encounter-badge ${enc.encounter_type === 'Initial Contact' ? 'initial' : ''}`}>
                  {getInitials(client)}
                </div>
                <div className="encounter-info">
                  <div className="name">{getClientName(client)}</div>
                  <div className="meta">
                    {enc.encounter_time && <><span>{enc.encounter_time}</span><span>·</span></>}
                    {Icons.mapPin}<span>{enc.location_text || '—'}</span>
                  </div>
                  {enc.what_matters && <div className="matters">"{enc.what_matters}"</div>}
                </div>
                <span className={`encounter-type-tag ${enc.encounter_type === 'Initial Contact' ? 'initial' : ''}`}>
                  {enc.encounter_type === 'Initial Contact' ? 'New' : 
                   enc.encounter_type === 'Attempted/Not Located' ? 'Missed' : 
                   enc.encounter_type === 'Follow-Up' ? 'F/U' : 'Ref'}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
