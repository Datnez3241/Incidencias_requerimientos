// sharepoint_filler.js
// Se inyecta en la página de SharePoint para rellenar el formulario de nueva entrada

(function() {
  function showToast(msg, ok) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999999;
      background:${ok ? '#0f7b3e' : '#ef4444'};color:white;padding:14px 20px;
      border-radius:10px;font-family:sans-serif;font-size:14px;font-weight:bold;
      box-shadow:0 4px 12px rgba(0,0,0,.35);max-width:340px;transition:opacity .5s;`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; }, 5000);
    setTimeout(() => t.remove(), 5600);
  }

  const isTrulyVisible = (elem) => {
    const rect = elem.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(elem);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    return true;
  };

  function nativeSet(el, value, sendEnter = true) {
    el.focus();
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    } catch(e) { el.value = value; }
    
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (sendEnter) {
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
      el.blur();
    }
  }

  function simulateMouseClick(element) {
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(ev => {
      const EventClass = ev.startsWith('pointer') ? window.PointerEvent || window.MouseEvent : window.MouseEvent;
      element.dispatchEvent(new EventClass(ev, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1
      }));
    });
    try { element.click(); } catch(e) {}
  }

  function findFieldElement(labelText) {
    // 1. Buscar directamente por aria-label (ej. aria-label="IM Campo obligatorio...")
    const selectors = [
      `input[aria-label^="${labelText} "]`,
      `input[aria-label^="${labelText},"]`,
      `textarea[aria-label^="${labelText} "]`,
      `textarea[aria-label^="${labelText},"]`,
      `div[role="combobox"][aria-label^="${labelText} "]`,
      `div[role="combobox"][aria-label^="${labelText},"]`,
      `input[aria-label="${labelText}"]`,
      `textarea[aria-label="${labelText}"]`,
      `div[role="combobox"][aria-label="${labelText}"]`
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // 2. Fallback: buscar por texto visible (TreeWalker)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent.trim();
      if (txt === labelText || txt === labelText + ' *' || txt === labelText + '*') {
        let el = node.parentElement;
        for (let i = 0; i < 8 && el; i++) {
          if (el.querySelector('input, textarea, [role="textbox"], [placeholder="Escribe para filtrar"]')) {
            return el;
          }
          el = el.parentElement;
        }
      }
    }
    return null;
  }

  function fillTextField(el, value) {
    let inp = el;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.getAttribute('role') !== 'textbox') {
      inp = el.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, [role="textbox"]');
    }
    if (!inp) return false;
    
    if (inp.getAttribute('contenteditable') === 'true') {
      inp.textContent = value;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      nativeSet(inp, value);
    }
    return true;
  }

  function fillChoiceField(el, value) {
    return new Promise((resolve) => {
      let clickable = el;
      if (el.getAttribute('role') !== 'combobox') {
        clickable = el.querySelector('[role="combobox"], [class*="dropdown"], [class*="Dropdown"], [class*="picker"]') || el;
      }
      
      simulateMouseClick(clickable);

      setTimeout(() => {
        let filterInputs = Array.from(document.querySelectorAll('[placeholder="Escribe para filtrar"], input[role="searchbox"]'));
        let filterInput = filterInputs.find(i => i.getBoundingClientRect().width > 0 && i.getBoundingClientRect().height > 0);
        
        if (filterInput) {
          nativeSet(filterInput, value, false); // False para NO enviar Enter
        }

        let attempts = 0;
        const findOptionInterval = setInterval(() => {
          attempts++;
          // Buscar el menú desplegable abierto y REALMENTE visible
          const containers = Array.from(document.querySelectorAll('.ms-Callout, .sp-Callout, [role="listbox"], .ms-Layer, .ms-Dropdown-callout'));
          const visibleContainers = containers.filter(c => isTrulyVisible(c));
          
          let selected = false;
          let clicked = false;
          
          for (const container of visibleContainers) {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
              const removeAccents = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const txt = removeAccents(node.textContent.trim().toLowerCase());
              const val = removeAccents(value.trim().toLowerCase());
              
              if (txt === val) {
                 let parent = node.parentElement;
                 
                 for (let i = 0; i < 4 && parent; i++) {
                   const role = parent.getAttribute('role');
                   if (role === 'option' || role === 'menuitem' || parent.tagName === 'LI' || parent.getAttribute('data-selection-index') || parent.className.includes('choiceItem')) {
                     simulateMouseClick(parent);
                     clicked = true;
                     selected = true;
                     break;
                   }
                   parent = parent.parentElement;
                 }
                 
                 if (!clicked) {
                   simulateMouseClick(node.parentElement);
                   selected = true;
                   clicked = true;
                 }
                 break; // Sale del while
              }
            }
            if (selected) break; // Sale del for
          }
          
          if (!selected) {
             // Si no lo encontramos, intentamos hacer scroll hacia abajo en el contenedor visible
             for (const container of visibleContainers) {
                const scrollContainer = container.querySelector('.ms-ScrollablePane, .ms-Dropdown-items, [role="listbox"]') || container.querySelector('[data-is-scrollable="true"]') || container;
                if (scrollContainer && typeof scrollContainer.scrollTop !== 'undefined') {
                   scrollContainer.scrollTop += 200;
                }
             }
          }
          
          if (selected || attempts >= 10) {
            clearInterval(findOptionInterval);
            if (!selected) {
               document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
            setTimeout(() => resolve(selected), 300);
          }
        }, 300); // Poll every 300ms, up to 10 times
      }, 500); 
    });
  }

  async function fillSharePointForm(data) {
    const mappings = [
      { label: 'RE',                   value: '',                                         type: 'text' },
      { label: 'IM',                   value: data.TICKET || '',                           type: 'text' },
      { label: 'Codigo',               value: data.CODIGO || '',                           type: 'text' },
      { label: 'Servicio',             value: data.SERVICIO || '',                         type: 'text' },
      { label: 'Responsable',          value: data.RESPONSABLE || '',                      type: 'choice' },
      { label: 'Operacion',            value: data.OPERACION || '',                        type: 'choice' },
      { label: 'Causa',                value: data.CAUSA || '',                            type: 'choice' },
      { label: 'Estado',               value: data.ESTADO || '',                           type: 'choice' },
      { label: 'Observacion',          value: data.DESCRIPCION || '',                      type: 'text' },
      { label: 'Cierre',               value: data.CIERRE || '',                           type: 'text' },
      { label: 'Creacion Ticket',      value: data['CREACION TICKET'] || '',               type: 'text' },
      { label: 'Indisponibilidad',     value: data.INDISPONIBILIDAD || '',                 type: 'choice' },
      { label: 'Subida Solar',         value: data['SUBIDA SOLAR'] || '',                 type: 'text' },
      { label: 'Fuerza Mayor',         value: data['FUERZA MAYOR'] || 'NO',               type: 'choice' },
      { label: 'Down time claro',      value: data['DOWN TIME CLARO'] ? String(data['DOWN TIME CLARO']) : '', type: 'text' },
      { label: 'Down Time Davivienda', value: data['DOWN TIME DAVIVIENDA'] ? String(data['DOWN TIME DAVIVIENDA']) : '', type: 'text' },
      { label: 'Down Time Total',      value: data['DOWN TIME TOTAL'] ? String(data['DOWN TIME TOTAL']) : '', type: 'text' },
      { label: 'FM',                   value: '',                                          type: 'text' }
    ];

    let filled = 0;
    for (const { label, value, type } of mappings) {
      if (!value) continue;
      const targetEl = findFieldElement(label);
      if (!targetEl) continue;

      let ok = false;
      if (type === 'choice') {
        ok = await fillChoiceField(targetEl, value);
      } else {
        ok = fillTextField(targetEl, value);
      }
      if (ok) filled++;
    }
    return filled;
  }

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['lastExtractedTicket'], (result) => {
      const data = result.lastExtractedTicket;
      if (!data) {
        showToast('⚠️ No hay datos de ticket. Primero extrae un ticket desde el portal.', false);
        return;
      }
      
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const inputs = document.querySelectorAll(
          'input[aria-label], textarea[aria-label], [role="textbox"], [placeholder="Escribe para filtrar"]'
        );
        if (inputs.length >= 1 || attempts >= 25) {
          clearInterval(interval);
          const filled = await fillSharePointForm(data);
          showToast(
            filled > 0
              ? `✅ ${filled} campos rellenados. Revisa y haz clic en Guardar.`
              : '⚠️ No se pudieron rellenar campos. Los nombres de columnas pueden ser distintos.',
            filled > 0
          );
        }
      }, 700);
    });
  }
})();
