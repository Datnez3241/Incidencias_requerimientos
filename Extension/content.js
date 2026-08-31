if (typeof window.ticketExtractorInjected === 'undefined') {
window.ticketExtractorInjected = true;
// =========================================================================
// FUNCIONES UTILITARIAS
// =========================================================================

const isTrulyVisible = (elem) => {
  const rect = elem.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(elem);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return true;
};

const getActiveContainer = (doc) => {
  let ticketElements = Array.from(doc.querySelectorAll('input[name="instance/number"], input[alias="instance/number"], #X17, #X13'));
  
  if (ticketElements.length === 0) {
      let labels = Array.from(doc.querySelectorAll('label, span, div')).filter(el => el.textContent.trim() === 'ID de incidente:');
      ticketElements = labels;
  }

  let activeEl = ticketElements.find(e => isTrulyVisible(e));
  if (activeEl) {
    const form = activeEl.closest('form');
    if (form) return form;
    const panel = activeEl.closest('[role="tabpanel"], .x-panel');
    if (panel) return panel;
    return doc;
  }
  
  const frames = doc.querySelectorAll('iframe, frame');
  for (let frame of frames) {
    if (!isTrulyVisible(frame)) continue;
    try {
      if (frame.contentDocument) {
        const container = getActiveContainer(frame.contentDocument);
        if (container) return container;
      }
    } catch(e) {}
  }
  return null;
};

const cleanText = (str) => {
  if (!str) return "";
  return str
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
};

function formatFecha(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}:${ss}`;
}

// =========================================================================
// NÚCLEO DE EXTRACCIÓN
// =========================================================================

function extractDataCore(requestNote, responsableConfig) {
  let rootDoc = document;
  try {
      if (window.top && window.top.document) {
          rootDoc = window.top.document;
      }
  } catch(e) {} // Ignorar errores de CORS (cross-origin)
  
  const activeContainer = getActiveContainer(rootDoc) || rootDoc;

  const getValue = (selector) => {
    const el = activeContainer.querySelector(selector);
    if (!el) return "";
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value.trim();
    return el.innerText.trim();
  };

  const getTextByLabel = (labelText) => {
    let elements = Array.from(activeContainer.querySelectorAll('label, div, span, td'));
    let labelEl = elements.find(el => el.textContent.trim().startsWith(labelText) && el.children.length === 0);
    if (!labelEl) return "";
    
    let next = labelEl.nextElementSibling;
    if (!next && labelEl.parentElement) {
        next = labelEl.parentElement.nextElementSibling;
    }
    
    if (next) {
      const inputs = Array.from(next.querySelectorAll('input, textarea'));
      const visibleInput = inputs.find(i => i.type !== 'hidden' && isTrulyVisible(i));
      if (visibleInput) return visibleInput.value.trim();
      if (inputs.length > 0) return inputs[0].value.trim();
      return (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA') ? next.value.trim() : next.textContent.trim();
    }
    return "";
  };

  let codigo = getValue('input[name="instance/number"]') || getValue('input[alias="instance/number"]') || getValue('#X17') || getTextByLabel('ID de incidente:') || getTextByLabel('ID de la petición:');
  let titulo = getValue('input[name="instance/brief.description"]') || getValue('input[alias="instance/brief.description"]') || getValue('#X13') || getTextByLabel('Título:');
  let estado = getValue('input[name="instance/problem.status"]') || getValue('input[alias="instance/problem.status"]') || getValue('input[name="instance/status"]') || getValue('input[alias="instance/status"]') || getValue('#X21') || getTextByLabel('Estado:');
  
  let observacion = requestNote ? cleanText(requestNote) : "";
  if (!observacion) {
      let smNote = getValue('textarea[name="instance/update.action"]') || getValue('#X237View') || getValue('.textareaView') || getTextByLabel('Nueva Nota de Trabajo');
      observacion = cleanText(smNote);
  }

  let cierre = cleanText(getValue('#X102View') || getValue('#X177View') || getValue('textarea[name="instance/resolution"]') || getTextByLabel('Solución:'));
  
  let creacion = getValue('input[name="instance/downtime.start"]') || getValue('input[alias="instance/downtime.start"]') || getValue('#X62') || getValue('input[name="instance/submit.date"]');
  let finInterrupcion = getValue('input[name="instance/downtime.end"]') || getValue('input[alias="instance/downtime.end"]') || getValue('#X66');
  
  let isRF = (codigo || "").toUpperCase().startsWith('RF');
  if (isRF) finInterrupcion = ""; 

  let codigoReal = getValue('input[name="instance/logical.name"]') || getValue('input[alias="instance/logical.name"]');
  if (codigoReal && codigoReal.length > 20) { 
      codigoReal = ""; // Ignorar si es un UUID interno
  }
  if (!codigoReal) {
      codigoReal = getTextByLabel('CI afectado:');
  }
  if (!codigoReal && titulo) {
    const match = titulo.match(/(?:DAVI|RKOL|TIT|CE|DATO)\w*\d+/i);
    if (match) codigoReal = match[0].toUpperCase();
  }

  let responsabilidad = getValue('input[alias="instance/clr.txt.responsabilidad"]');

  const parseSMDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(/[\s/:]+/);
    if (parts.length >= 5) {
      let day = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
      let h = parseInt(parts[3], 10);
      let m = parseInt(parts[4], 10);
      let s = parts.length > 5 ? parseInt(parts[5], 10) : 0;
      return new Date(year, month, day, h, m, s).getTime();
    }
    return new Date(dateStr).getTime();
  };

  let dtClaro = "";
  let dtDavi = "";
  let downtimeTotal = "";
  const estadoLower = (estado || "").toLowerCase();
  let isAbierto = !estadoLower.includes('cerrado') && !estadoLower.includes('resuelto');

  if (creacion && finInterrupcion && !isRF && !isAbierto) {
    const startMs = parseSMDate(creacion);
    const endMs = parseSMDate(finInterrupcion);
    if (startMs && endMs && !isNaN(startMs) && !isNaN(endMs)) {
      let diff = Math.round((endMs - startMs) / 60000); 
      if (diff > 0) {
        downtimeTotal = diff;
        if (responsabilidad && responsabilidad.toLowerCase().includes('claro')) {
          dtClaro = diff;
        } else if (responsabilidad && (responsabilidad.toLowerCase().includes('cliente') || responsabilidad.toLowerCase().includes('davivienda'))) {
          dtDavi = diff;
        } else {
          dtClaro = diff; 
        }
      }
    }
  }

  return {
    "TICKET": codigo || "DESCONOCIDO",
    "RESPONSABLE": responsableConfig || "DIEGO", 
    "CODIGO": codigoReal,
    "SERVICIO": titulo || "SIN SERVICIO",
    "ESTADO": estado || "CERRADO",
    "OBSERVACION": observacion,
    "CIERRE": cierre,
    "CREACION TICKET": creacion || "",
    "INDISPONIBILIDAD": isRF ? "NO" : (finInterrupcion || "NO"),
    "SUBIDA SOLAR": "NO",
    "FUERZA MAYOR": "NO",
    "DOWN TIME CLARO": dtClaro,
    "DOWN TIME DAVIVIENDA": dtDavi,
    "DOWN TIME TOTAL": downtimeTotal
  };
}


// =========================================================================
// FUNCIONES DE NOTIFICACIONES (SEGUNDO PLANO)
// =========================================================================

function showToast(message, isError = false) {
  let toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.backgroundColor = isError ? '#ef4444' : '#10b981';
  toast.style.color = 'white';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
  toast.style.zIndex = '999999';
  toast.style.fontFamily = 'sans-serif';
  toast.style.fontWeight = 'bold';
  toast.style.fontSize = '14px';
  toast.style.transition = 'opacity 0.5s ease-in-out';
  
  document.body.appendChild(toast);
  
  setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  setTimeout(() => { toast.remove(); }, 3500);
}

// =========================================================================
// ESCUCHADOR MANUAL (POPUP)
// =========================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractData") {
    let data = extractDataCore(request.note, request.responsable);
    
    console.log("[DEBUG EXTRACCIÓN] Datos capturados:", data);
    if (data.TICKET === "DESCONOCIDO") {
        showToast("Error: No se encontró el número del ticket.", true);
        sendResponse({ errorMsg: "No se encontró el número del ticket." });
        return true;
    }
    
    if (request.note) {
        navigator.clipboard.writeText(request.note).catch(err => console.log('Error al copiar al portapapeles: ', err));
    }

    data.PLATAFORMA = request.platform || "Telefonía";
    chrome.runtime.sendMessage({ action: "uploadData", data: data }).catch(() => {});
    
    if (request.note) {
        showToast('¡Nube actualizada! (Nota copiada 📋 ctrl+v para pegar)');
    } else {
        showToast('¡Ticket enviado a la nube! ☁️');
    }
    
    sendResponse({ success: true, data: data });
  } else if (request.action === "showToastMsg") {
    showToast(request.msg);
  } else if (request.action === "log") {
    console.log(request.msg, request.data);
  }
  return true;
});


// =========================================================================
// INTERCEPTOR DE CLICS Y TECLADO (SEGUNDO PLANO)
// =========================================================================

function triggerBackgroundExtraction() {
    chrome.storage.local.get(['autoExtractEnabled', 'savedPlatform', 'savedResponsable'], (result) => {
        if (result.autoExtractEnabled === false) return;
        
        let platform = result.savedPlatform || "Telefonía";
        let responsable = result.savedResponsable || "DIEGO";
        
        // ¡Extraer INMEDIATAMENTE antes de que la página recargue o bloquee!
        let data = extractDataCore("", responsable);
        if (data && data.TICKET && (data.TICKET.startsWith('IM') || data.TICKET.startsWith('RF'))) {
            data.PLATAFORMA = platform;
            chrome.runtime.sendMessage({ action: "uploadData", data: data }).catch(() => {});
        } else {
            console.log("[SEGUNDO PLANO] No se detectó un ticket IM o RF válido. Extracción abortada.", data);
        }
    });
}

// Escuchar orden del background para ejecutar la extracción (solo en el frame principal)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "performExtraction") {
        triggerBackgroundExtraction();
    }
});

// 1. Interceptar clics en botones "Guardar" (En cualquier iframe)
document.addEventListener('mousedown', (e) => {
    let btn = e.target.closest('button');
    if (btn) {
        let label = btn.getAttribute('aria-label') || '';
        let text = btn.textContent.trim();
        if (label.startsWith('Guardar') || text === 'Guardar' || text === 'Guardar y salir') {
            chrome.runtime.sendMessage({ action: "triggerSave" });
        }
    }
}, true);

// 2. Interceptar atajo de teclado Ctrl+Shift+F4 (En cualquier iframe)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'F4' || e.keyCode === 115)) {
        chrome.runtime.sendMessage({ action: "triggerSave" });
    }
}, true);


}

