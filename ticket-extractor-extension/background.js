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

// Feedback visual en el icono de la extensión (Badge)
function showBadge(text, color, durationMs = 4000) {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    if (durationMs > 0) {
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, durationMs);
    }
  } catch (e) {}
}

// ── COLA OFFLINE Y REINTENTOS AUTOMÁTICOS ──
async function saveToOfflineQueue(data) {
  const res = await new Promise(r => chrome.storage.local.get(['offlineQueue'], r));
  const queue = res.offlineQueue || [];
  const index = queue.findIndex(item => item.TICKET === data.TICKET);
  if (index >= 0) {
    queue[index] = data;
  } else {
    queue.push(data);
  }
  await new Promise(r => chrome.storage.local.set({ offlineQueue: queue }, r));
  showBadge('QUE', '#f59e0b', 5000);
  console.log(`[OFFLINE QUEUE] ${data.TICKET} guardado localmente para envío posterior.`);
}

async function processOfflineQueue() {
  const res = await new Promise(r => chrome.storage.local.get(['offlineQueue'], r));
  const queue = res.offlineQueue || [];
  if (queue.length === 0) return;

  console.log(`[OFFLINE RECONEXIÓN] Procesando ${queue.length} ticket(s) pendiente(s)...`);
  const remaining = [];
  for (const item of queue) {
    try {
      const success = await uploadToServers(item, true);
      if (!success) remaining.push(item);
    } catch (e) {
      remaining.push(item);
    }
  }
  await new Promise(r => chrome.storage.local.set({ offlineQueue: remaining }, r));
}

// Intentar procesar cola al arrancar service worker o al recuperar red
self.addEventListener('online', () => {
  processOfflineQueue();
});
setTimeout(() => { processOfflineQueue(); }, 3000);

async function uploadToServers(data, isRetry = false) {
  const cleanTicket = String(data.TICKET).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // ── CERROJO 1: En memoria ──
  if (inMemoryLocks[cleanTicket] && !isRetry) {
    console.log(`[LOCK] ${cleanTicket} ya está procesándose. Ignorando.`);
    return false;
  }
  inMemoryLocks[cleanTicket] = true;

  // ── CERROJO 2: En storage (entre reinicios del SW) ──
  const hasNote = String(data.DESCRIPCION || data.ACTUALIZACION || data.OBSERVACION || '').trim().length > 0;
  const storageKey = `cooldown_${cleanTicket}`;
  
  if (!hasNote && !isRetry) {
    const stored = await new Promise(r => chrome.storage.local.get([storageKey], r));
    const lastUpload = stored[storageKey] || 0;
    const now = Date.now();
    if (now - lastUpload < COOLDOWN_MS) {
      console.log(`[COOLDOWN] ${cleanTicket} (sin nota) guardado hace ${Math.round((now - lastUpload)/1000)}s. Ignorando.`);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'showToastMsg', 
            msg: `Espera unos segundos antes de volver a subir este ticket.` 
          }).catch(() => {});
        }
      });
      delete inMemoryLocks[cleanTicket];
      return false;
    }
  }

  const now = Date.now();
  await new Promise(r => chrome.storage.local.set({ [storageKey]: now }, r));

  try {
    data.TICKET = cleanTicket;

    // ── PASO 1: Buscar si el ticket ya existe en Supabase ──
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/tickets?IM=eq.${cleanTicket}&select=id,OBSERVACION,DESCRIPCION,ACTUALIZACION,CODIGO,PLATAFORMA,ESTADO,CIERRE,INDISPONIBILIDAD`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );

    let existingId = null;

    if (getResp.ok) {
      const rows = await getResp.json();
      if (rows.length > 0) {
        existingId = rows[0].id;
        const oldObs = String(rows[0].OBSERVACION || '').trim();
        let oldCausa = String(rows[0].DESCRIPCION || '').trim();
        let oldDesc = String(rows[0].ACTUALIZACION || '').trim();
        const newCausa = String(data.CAUSA || '').trim();
        const newDesc = String(data.DESCRIPCION || '').trim();
        const oldCodigo = String(rows[0].CODIGO || '').trim();

        // Si oldCausa u oldDesc vienen nulos de Supabase pero existe oldObs, extraerlos
        if (!oldCausa && oldObs) {
          const parts = oldObs.split(/\n\n|\r\n\r\n/);
          const nonNotes = parts.filter(p => !p.trim().startsWith('[') && !p.trim().match(/^-\s*\[/));
          oldCausa = nonNotes.join('\n\n');
        }
        if (!oldDesc && oldObs) {
          const parts = oldObs.split(/\n\n|\r\n\r\n/);
          const notes = parts.filter(p => p.trim().startsWith('[') || p.trim().match(/^-\s*\[/));
          oldDesc = notes.join('\n\n');
        }

        // ── DETECCIÓN INTELIGENTE DE CAMBIOS (DIFFING) ──
        if (!newDesc) {
          const fieldsToCompare = [
            ['ESTADO', data.ESTADO, rows[0].ESTADO],
            ['CIERRE', data.CIERRE, rows[0].CIERRE],
            ['INDISPONIBILIDAD', data.INDISPONIBILIDAD, rows[0].INDISPONIBILIDAD],
            ['CODIGO', data.CODIGO, rows[0].CODIGO]
          ];
          const hasChanges = fieldsToCompare.some(([k, newVal, oldVal]) => {
            return String(newVal || '').trim() !== String(oldVal || '').trim() && String(newVal || '').trim() !== '';
          });

          if (!hasChanges && (newCausa === '' || newCausa === oldCausa)) {
            console.log(`[DIFFING] ${cleanTicket}: No se detectaron cambios con respecto a Supabase. Omitiendo PATCH.`);
            showBadge('OK', '#10b981', 3000);
            delete inMemoryLocks[cleanTicket];
            return true;
          }
        }

        // 1. CAUSA: Usar la nueva extraída o conservar la previa
        data.CAUSA = newCausa || oldCausa || "";

        // 2. DESCRIPCION (Notas): Fusionar con fecha si hay nota nueva
        if (newDesc) {
          const timestampNote = '[' + formatFecha(new Date()) + '] ' + newDesc;
          if (oldDesc && !oldDesc.includes(newDesc)) {
            data.DESCRIPCION = timestampNote + '\n\n' + oldDesc;
          } else if (!oldDesc) {
            data.DESCRIPCION = timestampNote;
          } else {
            data.DESCRIPCION = oldDesc;
          }
        } else {
          data.DESCRIPCION = oldDesc || "";
        }

        // Mantener OBSERVACION sincronizada para retrocompatibilidad
        data.OBSERVACION = data.DESCRIPCION 
          ? (data.CAUSA ? data.DESCRIPCION + '\n\n' + data.CAUSA : data.DESCRIPCION)
          : data.CAUSA;

        // Proteger CÓDIGO
        if (oldCodigo && oldCodigo.length < 20 && (!data.CODIGO || data.CODIGO.length > 20)) {
          data.CODIGO = oldCodigo;
        }
      } else {
        // ES UN TICKET NUEVO
        const newCausa = String(data.CAUSA || '').trim();
        const newDesc = String(data.DESCRIPCION || '').trim();
        
        data.CAUSA = newCausa;
        if (newDesc) {
          data.DESCRIPCION = '[' + formatFecha(new Date()) + '] ' + newDesc;
        } else {
          data.DESCRIPCION = "";
        }
        
        data.OBSERVACION = data.DESCRIPCION 
          ? (data.CAUSA ? data.DESCRIPCION + '\n\n' + data.CAUSA : data.DESCRIPCION)
          : data.CAUSA;
      }
    }

    // ── PASO 2: PATCH si existe, POST si es nuevo ──
    const url = existingId
      ? `${SUPABASE_URL}/rest/v1/tickets?id=eq.${existingId}`
      : `${SUPABASE_URL}/rest/v1/tickets`;
    const method = existingId ? 'PATCH' : 'POST';

    // Mapeo para Supabase
    const supabaseData = { ...data };
    supabaseData.IM = data.TICKET;
    supabaseData.DESCRIPCION = data.CAUSA;
    supabaseData.ACTUALIZACION = data.DESCRIPCION;
    supabaseData.PLATAFORMA = data.OPERACION;
    delete supabaseData.CAUSA;
    delete supabaseData.OPERACION;
    delete supabaseData.TICKET;

    let saveResp = await fetch(url, {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(supabaseData)
    });

    if (!saveResp.ok && saveResp.status === 400) {
      console.warn('[WARN] Reintentando guardar sin DESCRIPCION/ACTUALIZACION/PLATAFORMA por si no se han creado en Supabase');
      const fallbackData = { ...supabaseData };
      delete fallbackData.DESCRIPCION;
      delete fallbackData.ACTUALIZACION;
      delete fallbackData.PLATAFORMA;
      saveResp = await fetch(url, {
        method,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(fallbackData)
      });
    }

    if (saveResp.ok) {
      console.log(`[OK] ${cleanTicket} ${existingId ? 'PATCH' : 'POST'} exitoso.`);
      showBadge('OK', '#10b981', 4000);
      return true;
    } else {
      const err = await saveResp.text();
      console.error(`[ERROR] Supabase ${method} falló: ${saveResp.status} - ${err}`);
      showBadge('ERR', '#ef4444', 5000);
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'showToastMsg', 
            msg: `Error Supabase (${saveResp.status}): ${err.substring(0, 100)}` 
          }).catch(() => {});
        }
      });
      return false;
    }

  } catch (error) {
    console.error('[ERROR] Upload falló (red o sistema):', error);
    showBadge('QUE', '#f59e0b', 5000);
    saveToOfflineQueue(data);
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'showToastMsg', 
          msg: `Sin conexión a nube. Ticket guardado localmente (Offline) 📥` 
        }).catch(() => {});
      }
    });
    chrome.storage.local.remove(storageKey);
    return false;
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

