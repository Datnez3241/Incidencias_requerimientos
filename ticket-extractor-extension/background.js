// background.js

const SUPABASE_URL = 'https://yjcgklhdoohuoxmifpnw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kCR2lZlyJuzIlwjuXArOLQ_IJ3KXxre';
const COOLDOWN_MS = 5000;

// Cerrojo en memoria para peticiones simultáneas en el mismo Service Worker
const inMemoryLocks = {};

function formatFecha(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}:${ss}`;
}

async function uploadToServers(data) {
  const cleanTicket = String(data.TICKET).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // ── CERROJO 1: En memoria ──
  if (inMemoryLocks[cleanTicket]) {
    console.log(`[LOCK] ${cleanTicket} ya está procesándose. Ignorando.`);
    return;
  }
  inMemoryLocks[cleanTicket] = true;

  // ── CERROJO 2: En storage (entre reinicios del SW) ──
  // Solo aplica cooldown si NO hay nota nueva — las actualizaciones con nota siempre pasan
  const hasNote = String(data.OBSERVACION || '').trim().length > 0;
  const storageKey = `cooldown_${cleanTicket}`;
  
  if (!hasNote) {
    const stored = await new Promise(r => chrome.storage.local.get([storageKey], r));
    const lastUpload = stored[storageKey] || 0;
    const now = Date.now();
    if (now - lastUpload < COOLDOWN_MS) {
      console.log(`[COOLDOWN] ${cleanTicket} (sin nota) guardado hace ${Math.round((now - lastUpload)/1000)}s. Ignorando.`);
      delete inMemoryLocks[cleanTicket];
      return;
    }
  }

  // Marcar timestamp ANTES de cualquier operación de red
  const now = Date.now();
  await new Promise(r => chrome.storage.local.set({ [storageKey]: now }, r));

  try {
    data.TICKET = cleanTicket;

    // ── PASO 1: Buscar si el ticket ya existe en Supabase ──
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/tickets?TICKET=eq.${cleanTicket}&select=id,OBSERVACION,CODIGO`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );

    let existingId = null;

    if (getResp.ok) {
      const rows = await getResp.json();
      if (rows.length > 0) {
        existingId = rows[0].id;
        const oldObs = String(rows[0].OBSERVACION || '').trim();
        const newObs = String(data.OBSERVACION || '').trim();
        const oldCodigo = String(rows[0].CODIGO || '').trim();

        // Fusionar observaciones: solo agregar si es contenido nuevo
        if (newObs && oldObs && !oldObs.includes(newObs)) {
          data.OBSERVACION = '[' + formatFecha(new Date()) + '] ' + newObs + '\n\n' + oldObs;
        } else if (oldObs && !newObs) {
          data.OBSERVACION = oldObs; // Conservar la observación vieja si no hay nueva
        }

        // Proteger el CÓDIGO si el nuevo es vacío o inválido (UUID) y ya teníamos uno bueno
        if (oldCodigo && oldCodigo.length < 20 && (!data.CODIGO || data.CODIGO.length > 20)) {
          data.CODIGO = oldCodigo;
        }
      }
    }

    // ── PASO 2: PATCH si existe, POST si es nuevo ──
    const url = existingId
      ? `${SUPABASE_URL}/rest/v1/tickets?id=eq.${existingId}`
      : `${SUPABASE_URL}/rest/v1/tickets`;
    const method = existingId ? 'PATCH' : 'POST';

    const saveResp = await fetch(url, {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (saveResp.ok) {
      console.log(`[OK] ${cleanTicket} ${existingId ? 'PATCH' : 'POST'} exitoso.`);
    } else {
      const err = await saveResp.text();
      console.error(`[ERROR] Supabase ${method} falló: ${saveResp.status} - ${err}`);
    }

    // También guardar en servidor local (Excel)
    fetch('http://localhost:3000/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(() => {});

  } catch (error) {
    console.error('[ERROR] Upload falló:', error);
    chrome.storage.local.remove(storageKey);
  } finally {
    setTimeout(() => { delete inMemoryLocks[cleanTicket]; }, COOLDOWN_MS);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'triggerSave') {
    if (sender && sender.tab) {
      chrome.tabs.sendMessage(sender.tab.id, { action: 'performExtraction' }, { frameId: 0 })
        .catch(e => console.log(e));
    }
  } else if (request.action === 'uploadData') {
    uploadToServers(request.data);
    if (sender && sender.tab) {
      chrome.tabs.sendMessage(sender.tab.id, { action: 'showToastMsg', msg: 'Guardando en nube... ☁️' }, { frameId: 0 })
        .catch(e => console.log(e));
    }
  }
});
