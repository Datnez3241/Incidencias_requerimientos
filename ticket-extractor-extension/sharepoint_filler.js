// sharepoint_filler.js
// Se inyecta en la página de SharePoint para rellenar el formulario de nueva entrada

(function() {
  // Esperar a que el formulario esté listo
  function waitForForm(callback, retries = 40) {
    const form = document.querySelector('[data-automation-id="FieldRenderer-title"], canvas[aria-label], [class*="formControl"]');
    const inputs = document.querySelectorAll('input[aria-label], textarea[aria-label], [role="textbox"][aria-label]');
    
    if (inputs.length > 2 || retries <= 0) {
      callback();
    } else {
      setTimeout(() => waitForForm(callback, retries - 1), 300);
    }
  }

  function setFieldValue(labelText, value) {
    if (!value && value !== 0) return false;

    // Buscar por aria-label exacto o que contenga el texto
    const selectors = [
      `input[aria-label="${labelText}"]`,
      `textarea[aria-label="${labelText}"]`,
      `[role="textbox"][aria-label="${labelText}"]`,
      `input[aria-label*="${labelText}"]`,
      `textarea[aria-label*="${labelText}"]`,
      `[role="textbox"][aria-label*="${labelText}"]`,
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Simular entrada de usuario para que React/SPFx detecte el cambio
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
          'value'
        );
        if (nativeInputValueSetter) {
          nativeInputValueSetter.set.call(el, value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }

    // Buscar por label de texto (span/div cerca de input)
    const allLabels = document.querySelectorAll('[class*="label"], [class*="Label"], label, span[title]');
    for (const lbl of allLabels) {
      const txt = (lbl.textContent || lbl.getAttribute('title') || '').trim();
      if (txt === labelText || txt.includes(labelText)) {
        // Buscar el input más cercano
        let parent = lbl.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const input = parent.querySelector('input:not([type="hidden"]), textarea, [role="textbox"], [contenteditable="true"]');
          if (input) {
            if (input.getAttribute('contenteditable') === 'true') {
              input.textContent = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              const nativeSetter = Object.getOwnPropertyDescriptor(
                input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
                'value'
              );
              if (nativeSetter) nativeSetter.set.call(input, value);
              else input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
          }
          parent = parent.parentElement;
        }
      }
    }
    return false;
  }

  chrome.storage.local.get(['lastExtractedTicket'], (result) => {
    const data = result.lastExtractedTicket;
    if (!data) {
      alert('⚠️ No hay datos de ticket recientes. Primero extrae un ticket desde el portal.');
      return;
    }

    waitForForm(() => {
      // Mapeo: nombre de columna SharePoint → valor del ticket
      const mappings = [
        { label: 'RE',                   value: data.TICKET && data.TICKET.startsWith('RF') ? data.TICKET : '' },
        { label: 'IM',                   value: data.TICKET && data.TICKET.startsWith('IM') ? data.TICKET : '' },
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

      // Mostrar aviso flotante
      const toast = document.createElement('div');
      toast.textContent = filled > 0
        ? `✅ Se rellenaron ${filled} campos automáticamente. Revisa y haz clic en Guardar.`
        : '⚠️ No se pudieron rellenar los campos. El formulario puede haber cambiado.';
      toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 9999999;
        background: ${filled > 0 ? '#0f7b3e' : '#ef4444'};
        color: white; padding: 14px 20px; border-radius: 10px;
        font-family: sans-serif; font-size: 14px; font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 320px;
        transition: opacity 0.5s;
      `;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; }, 5000);
      setTimeout(() => toast.remove(), 5500);
    });
  });
})();
