if (typeof window.ticketExtractorInjected === 'undefined') {
window.ticketExtractorInjected = true;
// =========================================================================
// FUNCIONES UTILITARIAS
// =========================================================================

const isTrulyVisible = (elem) => {
  const isDebug = elem.id === 'X40Readonly' || elem.id === 'X40' || elem.getAttribute('name') === 'instance/logical.name' || elem.getAttribute('alias') === 'instance/logical.name';
  
  const rect = elem.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
      if (isDebug) console.log("[DEBUG] Falló por width/height = 0", elem);
      return false;
  }
  if (rect.right < 0 || rect.bottom < 0) {
      if (isDebug) console.log("[DEBUG] Falló por estar fuera de pantalla (arriba/izquierda)", rect);
      return false;
  }
  
  const ownerWin = elem.ownerDocument.defaultView || window;
  const style = ownerWin.getComputedStyle(elem);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
      if (isDebug) console.log("[DEBUG] Falló por CSS oculto (display/visibility)", style.display, style.visibility);
      return false;
  }
  
  try {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    if (x >= 0 && x <= (ownerWin.innerWidth || elem.ownerDocument.documentElement.clientWidth) &&
        y >= 0 && y <= (ownerWin.innerHeight || elem.ownerDocument.documentElement.clientHeight)) {
        
        const elementsAtPoint = elem.ownerDocument.elementsFromPoint(x, y);
        if (!elementsAtPoint || elementsAtPoint.length === 0) {
            if (isDebug) console.log("[DEBUG] Falló porque elementsFromPoint está vacío en", x, y);
            return false;
        }
        
        const isIncluded = elementsAtPoint.slice(0, 10).includes(elem);
        if (isDebug) {
            console.log("[DEBUG] Análisis elementsFromPoint en", x, y);
            console.log("  - ¿Está en las primeras 10 capas?:", isIncluded);
            console.log("  - Elemento real:", elem);
            console.log("  - Capas detectadas:", elementsAtPoint.slice(0, 10));
        }
        return isIncluded;
    } else {
        if (isDebug) console.log("[DEBUG] Falló por coordenadas fuera de ventana", x, y, ownerWin.innerWidth, ownerWin.innerHeight);
    }
  } catch (e) {
      if (isDebug) console.log("[DEBUG] Error al procesar elementsFromPoint", e);
  }

  return true;
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

function extractDataCore(requestNote, responsableConfig, subidaSolarDate) {
  // Buscar recursivamente en el documento principal y todos los iframes visibles
  const querySelectorAllVisible = (selector) => {
    let results = [];
    const searchDoc = (d) => {
      try {
        const els = d.querySelectorAll(selector);
        for (let el of els) {
          if (isTrulyVisible(el)) results.push(el);
        }
        const frames = d.querySelectorAll('iframe, frame');
        for (let frame of frames) {
          if (!isTrulyVisible(frame)) continue;
          try {
            if (frame.contentDocument) searchDoc(frame.contentDocument);
          } catch(e) {}
        }
      } catch(e) {}
    };
    searchDoc(document);
    return results;
  };

  function getValue(selector) {
    const extractText = (el) => {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return (el.value || "").trim();
      let text = el.innerText ? el.innerText.trim() : el.textContent.trim();
      if (text && text.includes('hpsm.widgets')) text = text.replace(/hpsm\.widgets\.wrapWidget\([^)]*\)/g, '').trim();
      return text;
    };
    
    const visibleEls = querySelectorAllVisible(selector);
    for (let el of visibleEls) {
        let text = extractText(el);
        if (text) return text;
    }
    return "";
  }

  // Busca por atributo name o alias en todos los iframes, sin filtro de visibilidad
  // Útil para inputs readonly (fechas, campos bloqueados en ExtJS)
  function getValueByName(attrName) {
    let result = "";
    const searchDoc = (d) => {
      try {
        const selectors = [
          `input[name="${attrName}"]`,
          `input[alias="${attrName}"]`,
          `textarea[name="${attrName}"]`
        ];
        for (const sel of selectors) {
          const els = d.querySelectorAll(sel);
          for (const el of els) {
            const v = (el.value || el.getAttribute('value') || "").trim();
            if (v && !v.includes('hpsm')) { result = v; return; }
          }
        }
        const frames = d.querySelectorAll('iframe, frame');
        for (let frame of frames) {
          try {
            if (frame.contentDocument) searchDoc(frame.contentDocument);
          } catch(e) {}
          if (result) return;
        }
      } catch(e) {}
    };
    searchDoc(document);
    return result;
  }


  const getTextByLabel = (labelText) => {
    let result = "";
    const searchDoc = (d) => {
      try {
        let elements = Array.from(d.querySelectorAll('label, div, span, td, a'));
        let labelEl = elements.find(el => el.textContent.trim().startsWith(labelText) && el.children.length === 0 && isTrulyVisible(el));
        
        if (labelEl) {
          let next = labelEl.nextElementSibling;
          if (!next && labelEl.parentElement) {
              next = labelEl.parentElement.nextElementSibling;
          }
          if (next) {
            const inputs = Array.from(next.querySelectorAll('input, textarea, div'));
            const visibleInput = inputs.find(i => i.type !== 'hidden' && isTrulyVisible(i));
            if (visibleInput) {
                let val = visibleInput.value ? visibleInput.value.trim() : visibleInput.textContent.trim();
                result = val.replace(/hpsm\.widgets\.wrapWidget\([^)]*\)/g, '').trim();
                return;
            }
            if (inputs.length > 0) {
                let val = inputs[0].value ? inputs[0].value.trim() : inputs[0].textContent.trim();
                result = val.replace(/hpsm\.widgets\.wrapWidget\([^)]*\)/g, '').trim();
                return;
            }
            let nextVal = (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA') ? (next.value || "").trim() : next.textContent.trim();
            result = nextVal.replace(/hpsm\.widgets\.wrapWidget\([^)]*\)/g, '').trim();
            return;
          }
        }
        
        if (result) return;
        
        const frames = d.querySelectorAll('iframe, frame');
        for (let frame of frames) {
          if (!isTrulyVisible(frame)) continue;
          try {
            if (frame.contentDocument) searchDoc(frame.contentDocument);
          } catch(e) {}
        }
      } catch(e) {}
    };
    searchDoc(document);
    return result;
  };

  const parseSMWorkNotes = (rawText) => {
    if (!rawText) return "";
    const cleaned = cleanText(rawText);
    if (!cleaned) return "";

    const noteRegex = /----\s*(\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}:\d{2})[^\n]*\n([\s\S]*?)(?=(?:----\s*\d{2}\/\d{2}\/\d{2,4}|$))/g;
    let matches = [];
    let m;
    while ((m = noteRegex.exec(cleaned)) !== null) {
      let dateStr = m[1].trim();
      let content = m[2].replace(/^[-=]+\s*/, '').trim();
      if (content && content !== '.') {
        matches.push(`[${dateStr}] ${content}`);
      }
    }

    if (matches.length > 0) {
      return matches.join('\n\n');
    }

    return cleaned;
  };

  const getAnyTextByLabel = (labelText) => {
    let val = getTextByLabel(labelText);
    if (!val) {
      // Intentar directamente en ticketDoc si es diferente del contexto ya buscado
      try {
        let elements = Array.from(ticketDoc.querySelectorAll('label, div, span, td'));
        let labelEl = elements.find(el => el.textContent.trim().startsWith(labelText) && el.children.length === 0 && isTrulyVisible(el));
        if (labelEl) {
          let next = labelEl.nextElementSibling || (labelEl.parentElement ? labelEl.parentElement.nextElementSibling : null);
          if (next) {
            const inputs = Array.from(next.querySelectorAll('input, textarea, div'));
            const visibleInput = inputs.find(i => i.type !== 'hidden' && isTrulyVisible(i));
            if (visibleInput) {
                let v = visibleInput.value ? visibleInput.value.trim() : visibleInput.textContent.trim();
                return v.replace(/hpsm\.widgets\.wrapWidget\([^)]*\)/g, '').trim();
            }
            if (inputs.length > 0) {
                let v = inputs[0].value ? inputs[0].value.trim() : inputs[0].textContent.trim();
                return v.replace(/hpsm\.widgets\.wrapWidget\([^)]*\)/g, '').trim();
            }
            let nextVal = (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA') ? (next.value || "").trim() : next.textContent.trim();
            return nextVal.replace(/hpsm\.widgets\.wrapWidget\([^)]*\)/g, '').trim();
          }
        }
      } catch(e) {}
    }
    return val;
  };


  let codigo = getValue('input[name="instance/number"]') 
             || getValue('input[alias="instance/number"]') 
             || getValue('#X17') 
             || getValue('#X18')
             || getAnyTextByLabel('ID de incidente:') 
             || getAnyTextByLabel('ID de la petición:')
             || getAnyTextByLabel('ID de incidente')
             || getAnyTextByLabel('ID de la petición');

  // Fallback 0: buscar cualquier input visible cuyo valor empiece por IM o RF
  if (!codigo || codigo.length < 5) {
    const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const inp of allInputs) {
      const v = (inp.value || '').trim();
      if (/^(IM|RF)\d{5,}/i.test(v) && isTrulyVisible(inp)) {
        codigo = v.toUpperCase();
        break;
      }
    }
  }

  // Fallback 1: buscar en el encabezado visible (h1, h2, title del panel)
  if (!codigo || codigo === 'DESCONOCIDO') {
    const headings = document.querySelectorAll('h1, h2, h3, [class*="title"], [class*="Title"]');
    for (const h of headings) {
      const txt = h.textContent || '';
      const m = txt.match(/\b(IM|RF)\d{6,}/i);
      if (m) { codigo = m[0].toUpperCase(); break; }
    }
  }

  // Fallback 2: buscar en la URL
  if (!codigo || codigo === 'DESCONOCIDO') {
    const urlMatch = (window.location.href || '').match(/\b(IM|RF)\d{6,}/i);
    if (urlMatch) codigo = urlMatch[0].toUpperCase();
  }

  // Fallback 3: buscar en todo el texto visible de la pestaña activa
  if (!codigo || codigo === 'DESCONOCIDO') {
    const allText = document.body ? document.body.innerText || '' : '';
    const m = allText.match(/\bID de incidente[:\s]+([A-Z]{2}\d{6,})/i)
           || allText.match(/\bID de la petición[:\s]+([A-Z]{2}\d{6,})/i);
    if (m) codigo = m[1].toUpperCase();
  }

  let titulo = getValue('input[name="instance/brief.description"]') || getValue('input[alias="instance/brief.description"]') || getValue('#X13') || getAnyTextByLabel('Título:');
  let estadoRaw = getValue('input[name="instance/problem.status"]') || getValue('input[alias="instance/problem.status"]') || getValue('input[name="instance/status"]') || getValue('input[alias="instance/status"]') || getValue('#X21') || getAnyTextByLabel('Estado:');
  let estadoLowerStr = (estadoRaw || "").toLowerCase();
  let estado = estadoLowerStr.includes('cerrado') ? "Cerrado" : "Abierto";
  
  let descripcionRaw = getValue('#X15View') ||
                       getValue('textarea[name="instance/description"]') ||
                       getValue('#X15') ||
                       getAnyTextByLabel('Descripción:') ||
                       getAnyTextByLabel('Descripción');
                       
  let descripcion = cleanText(descripcionRaw);
  if (descripcion === "Descripción:" || descripcion === "Descripción" || descripcion.toLowerCase().startsWith("descripción:")) {
      descripcion = cleanText(descripcion.replace(/^descripción:\s*/i, ''));
  }

  let actualizacion = requestNote ? cleanText(requestNote) : "";
  if (!actualizacion) {
      let smNote = getValue('#X237View') ||
                   getValue('textarea[name="instance/update.action"]') ||
                   getAnyTextByLabel('Nueva Nota de Trabajo') ||
                   getAnyTextByLabel('Actualizar acción:');
      actualizacion = cleanText(smNote);
  }

  if (!actualizacion) {
      let historialNotas = getAnyTextByLabel('Notas de Trabajo:') ||
                           getAnyTextByLabel('Notas de Trabajo') ||
                           getValue('#X364View') ||
                           getValue('textarea[name="instance/action"]');
      if (historialNotas) {
          actualizacion = parseSMWorkNotes(historialNotas);
      }
  }

  let cierre = cleanText(getValue('#X102View') || getValue('#X177View') || getValue('textarea[name="instance/resolution"]') || getTextByLabel('Solución:'));
  
  let creacion = getValueByName('instance/downtime.start')
              || getValueByName('instance/submit.date')
              || getValueByName('instance/open.time')
              || getValue('#X62') 
              || getValue('#X63')
              || getValue('#X64')
              || getTextByLabel('Inicio de la interrupción:')
              || getTextByLabel('Inicio de interrupción:')
              || getTextByLabel('Fecha de apertura:')
              || getTextByLabel('Fecha de inicio:');
  let finInterrupcion = getValue('input[name="instance/downtime.end"]') || getValue('input[alias="instance/downtime.end"]') || getValue('#X66');
  if (finInterrupcion && (finInterrupcion.includes('Fin de la interrupción') || finInterrupcion.includes('Fin de Interrupción'))) {
    finInterrupcion = ""; // Prevent grabbing the label text by mistake
  }
  
  let isRF = (codigo || "").toUpperCase().startsWith('RF');
  if (isRF) finInterrupcion = ""; 

  let codigoReal = getValue('input[name="instance/logical.name"]') 
                || getValue('input[alias="instance/logical.name"]')
                || getValue('#X40Readonly')
                || getValue('#X40');
  if (!codigoReal) {
      codigoReal = getTextByLabel('CI afectado:');
  }
  if (codigoReal && codigoReal.length > 20) { 
      codigoReal = ""; // Ignorar si es un UUID interno
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
  let isAbierto = estado === "Abierto";

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
    "CAUSA": descripcion,
    "DESCRIPCION": actualizacion,
    "CIERRE": cierre || "PENDIENTE",
    "CREACION TICKET": creacion || "",
    "INDISPONIBILIDAD": isRF ? "" : (finInterrupcion || ""),
    "SUBIDA SOLAR": subidaSolarDate || "",
    "FUERZA MAYOR": "No",
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
  if (request.action === "previewData") {
    let data = extractDataCore("", request.responsable, request.subidaSolarDate);
    sendResponse({ success: true, data: data });
  } else if (request.action === "extractData") {
    let data = extractDataCore(request.note, request.responsable, request.subidaSolarDate);
    
    console.log("[DEBUG EXTRACCIÓN] Datos capturados:", data);
    if (data.TICKET === "DESCONOCIDO") {
        showToast("Error: No se encontró el número del ticket.", true);
        sendResponse({ errorMsg: "No se encontró el número del ticket." });
        return true;
    }
    
    // La copia al portapapeles ahora se maneja en popup.js para evitar errores de foco
    data.OPERACION = request.platform || "Telefonia";
    // Si el usuario seleccionó una causa en el popup, tiene prioridad
    if (request.causa) {
        data.CAUSA = request.causa;
    }
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
    chrome.storage.local.get(['autoExtractEnabled', 'savedPlatform', 'savedResponsable', 'savedCausa', 'savedSubidaSolarDate'], (result) => {
        if (result.autoExtractEnabled === false) return;

        let platform = result.savedPlatform || "Telefonia";
        let responsable = result.savedResponsable || "DIEGO";
        let savedCausa = result.savedCausa || "";
        let savedSubidaSolarDate = result.savedSubidaSolarDate || "";

        // ¡Extraer INMEDIATAMENTE antes de que la página recargue o bloquee!
        let data = extractDataCore("", responsable, savedSubidaSolarDate);
        if (data && data.TICKET && (data.TICKET.startsWith('IM') || data.TICKET.startsWith('RF'))) {
            data.OPERACION = platform;
            // Si hay causa guardada en el popup, tiene prioridad sobre la extraída
            if (savedCausa) data.CAUSA = savedCausa;
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
    let el = e.target;
    while (el && el !== document && el.nodeType === 1) {
        let label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
        let text = (el.innerText || el.textContent || '').trim().toLowerCase();
        let val = (el.value || '').trim().toLowerCase();
        
        if (
            label.includes('guardar') || 
            text === 'guardar' || text === 'guardar y salir' ||
            val === 'guardar' || val === 'guardar y salir'
        ) {
            chrome.runtime.sendMessage({ action: "triggerSave" });
            break;
        }
        el = el.parentNode;
    }
}, true);

// 2. Interceptar atajo de teclado Ctrl+Shift+F4 (En cualquier iframe)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'F4' || e.keyCode === 115)) {
        chrome.runtime.sendMessage({ action: "triggerSave" });
    }
}, true);


}

