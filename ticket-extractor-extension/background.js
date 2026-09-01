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
  const hasNote = String(data.ACTUALIZACION || data.OBSERVACION || '').trim().length > 0;
  const storageKey = `cooldown_${cleanTicket}`;
  
  if (!hasNote) {
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
      `${SUPABASE_URL}/rest/v1/tickets?IM=eq.${cleanTicket}&select=id,OBSERVACION,DESCRIPCION,ACTUALIZACION,CODIGO,PLATAFORMA`,
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
      }
    }

    // ── PASO 2: PATCH si existe, POST si es nuevo ──
    const url = existingId
      ? `${SUPABASE_URL}/rest/v1/tickets?id=eq.${existingId}`
      : `${SUPABASE_URL}/rest/v1/tickets`;
    const method = existingId ? 'PATCH' : 'POST';

    // Mapeo para Supabase (para no obligar a modificar las columnas en la DB)
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
    } else {
      const err = await saveResp.text();
      console.error(`[ERROR] Supabase ${method} falló: ${saveResp.status} - ${err}`);
      
      // Enviar el error a la pestaña para que el usuario lo vea
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'showToastMsg', 
            msg: `Error Supabase (${saveResp.status}): ${err.substring(0, 100)}` 
          }).catch(() => {});
        }
      });
    }



  } catch (error) {
    console.error('[ERROR] Upload falló:', error);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'showToastMsg', 
          msg: `Error interno de Extensión: ${error.message}` 
        }).catch(() => {});
      }
    });
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
});
