// sharepoint_filler.js
// Se inyecta en la página de SharePoint para rellenar el formulario de nueva entrada

(function() {
  // Intentar rellenar un campo por aria-label o por texto del label cercano
  function setFieldValue(labelText, value) {
    if (value === null || value === undefined || value === '') return false;
    const strVal = String(value);

    // 1) Buscar por aria-label directo
    const ariaSelectors = [
      `input[aria-label="${labelText}"]`,
      `textarea[aria-label="${labelText}"]`,
      `[role="textbox"][aria-label="${labelText}"]`,
      `input[aria-label*="${labelText}"]`,
      `textarea[aria-label*="${labelText}"]`,
      `[role="textbox"][aria-label*="${labelText}"]`,
    ];
    for (const sel of ariaSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        reactSet(el, strVal);
        return true;
      }
    }

    // 2) Buscar por title en el label
    const titleEl = document.querySelector(`[title="${labelText}"], [data-automation-id*="${labelText}"]`);
    if (titleEl) {
      const input = findInputNear(titleEl);
      if (input) { reactSet(input, strVal); return true; }
    }

    // 3) Buscar por texto de span/label
    const allSpans = document.querySelectorAll('span, label, div[class*="label"], div[class*="Label"]');
    for (const span of allSpans) {
      if ((span.textContent || '').trim() === labelText) {
        const input = findInputNear(span);
        if (input) { reactSet(input, strVal); return true; }
      }
    }

    return false;
  }

  function findInputNear(el) {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      const input = node.querySelector(
        'input:not([type="hidden"]):not([type="checkbox"]), textarea, [role="textbox"], [contenteditable="true"]'
      );
      if (input) return input;
      node = node.parentElement;
    }
    return null;
  }

  function reactSet(el, value) {
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) {
        setter.set.call(el, value);
      } else {
        el.value = value;
      }
    } catch(e) {
      el.value = value;
    }

    if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value;
    }

    ['input', 'change', 'blur'].forEach(evtName => {
      el.dispatchEvent(new Event(evtName, { bubbles: true }));
    });
  }

  function showToast(msg, ok) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:9999999;
      background:${ok ? '#0f7b3e' : '#ef4444'};
      color:white;padding:14px 20px;border-radius:10px;
      font-family:sans-serif;font-size:14px;font-weight:bold;
      box-shadow:0 4px 12px rgba(0,0,0,.35);max-width:340px;
      transition:opacity .5s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 5000);
    setTimeout(() => toast.remove(), 5500);
  }

  function doFill(data) {
    // RE siempre vacío según lo acordado
    // IM recibe el número de ticket (sea IM o RF)
    const mappings = [
      { label: 'RE',                   value: '' },
      { label: 'IM',                   value: data.TICKET || '' },
      { label: 'Responsable',          value: data.RESPONSABLE || '' },
      { label: 'Codigo',               value: data.CODIGO || '' },
      { label: 'Servicio',             value: data.SERVICIO || '' },
      { label: 'Causa',                value: data.CAUSA || '' },
      { label: 'Estado',               value: data.ESTADO || '' },
      { label: 'Observacion',          value: data.DESCRIPCION || '' },
      { label: 'Cierre',               value: data.CIERRE || '' },
      { label: 'Creacion Ticket',      value: data['CREACION TICKET'] || '' },
      { label: 'Indisponibilidad',     value: data.INDISPONIBILIDAD || '' },
      { label: 'Subida Solar',         value: data['SUBIDA SOLAR'] || '' },
      { label: 'Fuerza Mayor',         value: data['FUERZA MAYOR'] || '' },
      { label: 'Down time claro',      value: data['DOWN TIME CLARO'] ? String(data['DOWN TIME CLARO']) : '' },
      { label: 'Down Time Davivienda', value: data['DOWN TIME DAVIVIENDA'] ? String(data['DOWN TIME DAVIVIENDA']) : '' },
      { label: 'Down Time Total',      value: data['DOWN TIME TOTAL'] ? String(data['DOWN TIME TOTAL']) : '' },
      { label: 'Operacion',            value: data.OPERACION || '' },
      { label: 'FM',                   value: '' },
    ];

    let filled = 0;
    for (const { label, value } of mappings) {
      if (setFieldValue(label, value)) filled++;
    }
    return filled;
  }

  // Usar MutationObserver para esperar que el formulario esté listo
  function waitAndFill(data) {
    let attempts = 0;
    const maxAttempts = 30;

    const tryFill = () => {
      attempts++;
      // Detectar si hay campos de formulario en pantalla
      const inputs = document.querySelectorAll(
        'input[aria-label], textarea[aria-label], [role="textbox"], [contenteditable="true"]'
      );

      if (inputs.length >= 2) {
        const filled = doFill(data);
        if (filled > 0) {
          showToast(`✅ ${filled} campos rellenados. Revisa y haz clic en Guardar.`, true);
        } else {
          showToast('⚠️ No se pudieron rellenar los campos. Los nombres pueden ser distintos.', false);
        }
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(tryFill, 500);
      } else {
        showToast('⚠️ El formulario tardó demasiado en cargar. Rellena manualmente.', false);
      }
    };

    setTimeout(tryFill, 1500); // Primer intento luego de 1.5s
  }

  // Cargar datos y arrancar
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['lastExtractedTicket'], (result) => {
      const data = result.lastExtractedTicket;
      if (!data) {
        showToast('⚠️ No hay datos de ticket. Primero extrae un ticket desde el portal.', false);
        return;
      }
      waitAndFill(data);
    });
  }
})();
