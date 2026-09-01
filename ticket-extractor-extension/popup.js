// Función genérica para enviar mensaje a content.js
async function runExtraction(actionName) {
  const noteText = document.getElementById('updateNote').value.trim();
  const platform = document.getElementById('platformSelectMain').value || document.getElementById('platformSelect').value;
  const causa = document.getElementById('causaSelect').value;
  const subidaSolarDate = document.getElementById('subidaSolarDate').value;
  let responsable = document.getElementById('responsableInput').value.trim();
  if (!responsable) responsable = "DIEGO";

  const statusDiv = document.getElementById('status');
  statusDiv.textContent = actionName === 'updateTicket' ? 'Actualizando y Extrayendo...' : 'Extrayendo...';

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: false },
    files: ['content.js']
  }, () => {
      if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error Inyectando: ' + chrome.runtime.lastError.message;
          statusDiv.style.color = 'red';
          return;
      }
      chrome.tabs.sendMessage(tab.id, {
          action: actionName,
          note: noteText,
          platform: platform,
          causa: causa,
          responsable: responsable,
          subidaSolarDate: subidaSolarDate
      }, { frameId: 0 }, (response) => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Refresca la página y vuelve a intentar.';
          statusDiv.style.color = 'red';
          return;
        }
        if (response && response.success) {
          statusDiv.textContent = '¡Datos enviados al proceso en segundo plano!';
          statusDiv.style.color = 'blue';
          // Guardar el último ticket extraído para SharePoint
          if (response.data) {
            response.data.OPERACION = platform;
            if (causa) response.data.CAUSA = causa;
            if (subidaSolarDate) response.data['SUBIDA SOLAR'] = subidaSolarDate;
            chrome.storage.local.set({ lastExtractedTicket: response.data });
          }
        } else if (response && response.errorMsg) {
          statusDiv.textContent = 'Error: ' + response.errorMsg;
          statusDiv.style.color = 'red';
        }
      });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Lógica del engranaje (mostrar/ocultar panel)
  const settingsBtn = document.getElementById('settingsBtn');
  const configPanel = document.getElementById('configPanel');
  settingsBtn.addEventListener('click', () => {
    if (configPanel.style.display === 'none') {
      configPanel.style.display = 'block';
    } else {
      configPanel.style.display = 'none';
    }
  });

  // Lógica del botón Toggle
  const toggleBtn = document.getElementById('autoExtractToggleBtn');
  let isAutoOn = true;

  const updateToggleUI = (isOn) => {
    isAutoOn = isOn;
    if (isOn) {
      toggleBtn.textContent = 'ACTIVADO';
      toggleBtn.className = 'toggle-btn toggle-on';
    } else {
      toggleBtn.textContent = 'APAGADO';
      toggleBtn.className = 'toggle-btn toggle-off';
    }
  };

  // Cargar configuración guardada
  chrome.storage.local.get(['savedPlatform', 'savedResponsable', 'savedCausa', 'savedSubidaSolarDate', 'autoExtractEnabled'], (result) => {
    if (result.savedPlatform) {
      document.getElementById('platformSelect').value = result.savedPlatform;
      document.getElementById('platformSelectMain').value = result.savedPlatform;
    }
    if (result.savedCausa) {
      document.getElementById('causaSelect').value = result.savedCausa;
    }
    if (result.savedSubidaSolarDate) {
      document.getElementById('subidaSolarDate').value = result.savedSubidaSolarDate;
    }
    document.getElementById('responsableInput').value = result.savedResponsable || "DIEGO";
    updateToggleUI(result.autoExtractEnabled !== undefined ? result.autoExtractEnabled : true);
  });

  // Guardar configuración cuando cambie - sincronizar ambos selects
  document.getElementById('platformSelect').addEventListener('change', (e) => {
    chrome.storage.local.set({ savedPlatform: e.target.value });
    document.getElementById('platformSelectMain').value = e.target.value;
  });

  document.getElementById('platformSelectMain').addEventListener('change', (e) => {
    chrome.storage.local.set({ savedPlatform: e.target.value });
    document.getElementById('platformSelect').value = e.target.value;
  });

  document.getElementById('causaSelect').addEventListener('change', (e) => {
    chrome.storage.local.set({ savedCausa: e.target.value });
  });

  document.getElementById('subidaSolarDate').addEventListener('change', (e) => {
    chrome.storage.local.set({ savedSubidaSolarDate: e.target.value });
  });

  document.getElementById('responsableInput').addEventListener('input', (e) => {
    chrome.storage.local.set({ savedResponsable: e.target.value.trim() });
  });

  toggleBtn.addEventListener('click', () => {
    updateToggleUI(!isAutoOn);
    chrome.storage.local.set({ autoExtractEnabled: isAutoOn });
  });

  document.getElementById('extractBtn').addEventListener('click', () => {
    runExtraction('extractData');
  });

  // Botón de SharePoint
  document.getElementById('sharepointBtn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('status');
    const SP_NEW_FORM = 'https://claromovilco-my.sharepoint.com/personal/45110560_claro_com_co/Lists/Bitacora%202026/NewForm.aspx';

    // Verificar que haya datos recientes
    chrome.storage.local.get(['lastExtractedTicket'], async (result) => {
      if (!result.lastExtractedTicket) {
        statusDiv.textContent = '⚠️ Primero extrae un ticket con el botón azul.';
        statusDiv.style.color = '#d97706';
        return;
      }

      // Mostrar vista previa de datos
      showDataPreview(result.lastExtractedTicket, SP_NEW_FORM, statusDiv);
    });
  });

  // Función para mostrar vista previa de datos
  function showDataPreview(data, spUrl, statusDiv) {
    // Crear modal de vista previa
    const previewModal = document.createElement('div');
    previewModal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 10000; display: flex;
      align-items: center; justify-content: center;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white; width: 90%; max-width: 500px; max-height: 80vh;
      border-radius: 12px; padding: 20px; overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Título del modal
    const title = document.createElement('h3');
    title.textContent = '📋 Vista Previa de Datos';
    title.style.cssText = 'margin: 0 0 15px 0; color: #111827; font-size: 18px; text-align: center;';
    modalContent.appendChild(title);

    // Organizar datos por categorías
    const categories = {
      'IDENTIFICACIÓN': ['TICKET', 'CODIGO', 'SERVICIO'],
      'CLASIFICACIÓN': ['RESPONSABLE', 'OPERACION', 'CAUSA', 'ESTADO'],
      'DETALLES': ['DESCRIPCION', 'CIERRE', 'CREACION TICKET'],
      'IMPACTO': ['INDISPONIBILIDAD', 'SUBIDA SOLAR', 'FUERZA MAYOR'],
      'TIEMPOS': ['DOWN TIME CLARO', 'DOWN TIME DAVIVIENDA', 'DOWN TIME TOTAL']
    };

    for (const [category, fields] of Object.entries(categories)) {
      const categoryDiv = document.createElement('div');
      categoryDiv.style.cssText = 'margin-bottom: 15px;';
      
      const categoryLabel = document.createElement('div');
      categoryLabel.textContent = category;
      categoryLabel.style.cssText = 'font-size: 11px; font-weight: 800; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px;';
      categoryDiv.appendChild(categoryLabel);

      for (const field of fields) {
        const fieldValue = data[field] || '';
        if (fieldValue) {
          const fieldRow = document.createElement('div');
          fieldRow.style.cssText = 'display: flex; margin-bottom: 6px; font-size: 13px;';
          
          const fieldName = document.createElement('div');
          fieldName.textContent = field + ':';
          fieldName.style.cssText = 'font-weight: 600; color: #374151; width: 140px; flex-shrink: 0;';
          
          const fieldValueEl = document.createElement('div');
          fieldValueEl.textContent = fieldValue;
          fieldValueEl.style.cssText = 'color: #6b7280; word-break: break-word;';
          
          fieldRow.appendChild(fieldName);
          fieldRow.appendChild(fieldValueEl);
          categoryDiv.appendChild(fieldRow);
        }
      }
      
      modalContent.appendChild(categoryDiv);
    }

    // Botones de acción
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 20px;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '✅ Confirmar y Enviar';
    confirmBtn.style.cssText = `
      flex: 1; background: #0f7b3e; color: white; border: none;
      padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    `;
    confirmBtn.onmouseover = () => confirmBtn.style.background = '#0a5c2d';
    confirmBtn.onmouseout = () => confirmBtn.style.background = '#0f7b3e';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '❌ Cancelar';
    cancelBtn.style.cssText = `
      flex: 1; background: #ef4444; color: white; border: none;
      padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    `;
    cancelBtn.onmouseover = () => cancelBtn.style.background = '#dc2626';
    cancelBtn.onmouseout = () => cancelBtn.style.background = '#ef4444';

    buttonContainer.appendChild(confirmBtn);
    buttonContainer.appendChild(cancelBtn);
    modalContent.appendChild(buttonContainer);

    previewModal.appendChild(modalContent);
    document.body.appendChild(previewModal);

    // Evento de confirmación
    confirmBtn.onclick = async () => {
      previewModal.remove();
      statusDiv.textContent = 'Abriendo SharePoint...';
      statusDiv.style.color = '#6b7280';

      const tab = await chrome.tabs.create({ url: spUrl, active: true });

      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: fillSharePointForm,
              args: [data]
            }).catch(err => {
              statusDiv.textContent = 'Error al inyectar: ' + err.message;
              statusDiv.style.color = 'red';
            });
          }, 4000);
        }
      });
    };

    // Evento de cancelación
    cancelBtn.onclick = () => {
      previewModal.remove();
    };

    // Cerrar al hacer clic fuera del modal
    previewModal.onclick = (e) => {
      if (e.target === previewModal) {
        previewModal.remove();
      }
    };
  }
});


// ============================================================
// FUNCIÓN QUE SE INYECTA EN SHAREPOINT (func + args)
// Recibe los datos del ticket directamente, sin necesitar storage
// Maneja tanto campos de texto como menús desplegables (Choice/Lookup)
// ============================================================
function fillSharePointForm(data) {

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

  function nativeSet(el, value) {
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    } catch(e) { el.value = value; }
    ['input','change','blur'].forEach(n => el.dispatchEvent(new Event(n, { bubbles: true })));
  }

  // Encontrar el contenedor de un campo por su label visible
  function findFieldContainer(labelText) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent.trim();
      // Coincidencia exacta o sin asterisco (campo obligatorio)
      if (txt === labelText || txt === labelText + ' *' || txt === labelText + '*') {
        let el = node.parentElement;
        // Subir hasta encontrar el contenedor del campo completo
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

  // Rellenar campo de TEXTO simple
  function fillTextField(container, value) {
    const inp = container.querySelector(
      'input:not([type=hidden]):not([type=checkbox]), textarea, [role="textbox"]'
    );
    if (!inp) return false;
    if (inp.getAttribute('contenteditable') === 'true') {
      inp.textContent = value;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      nativeSet(inp, value);
    }
    return true;
  }

  // Rellenar campo DESPLEGABLE (Choice/Lookup) - tipo "Escribe para filtrar"
  function fillChoiceField(container, value) {
    return new Promise((resolve) => {
      // Buscar el input de filtro o el contenedor clickeable
      let filterInput = container.querySelector('[placeholder="Escribe para filtrar"]');

      const trySelect = () => {
        filterInput = container.querySelector('[placeholder="Escribe para filtrar"]');
        if (!filterInput) { resolve(false); return; }

        nativeSet(filterInput, value);

        // Esperar a que aparezcan las opciones filtradas
        setTimeout(() => {
          // Buscar la opción que coincida (chip/span con ese texto)
          const allOptions = document.querySelectorAll(
            '[role="option"], [class*="itemCell"], [class*="choiceItem"], span[title]'
          );
          for (const opt of allOptions) {
            const optText = (opt.textContent || opt.getAttribute('title') || '').trim();
            if (optText.toLowerCase() === value.toLowerCase() || optText.toLowerCase().includes(value.toLowerCase())) {
              opt.click();
              resolve(true);
              return;
            }
          }
          // Si no se encontró opción exacta, al menos el valor quedó en el filtro
          resolve(true);
        }, 600);
      };

      if (filterInput) {
        trySelect();
      } else {
        // Hacer clic en el campo para abrirlo
        const clickable = container.querySelector('[role="combobox"], [class*="dropdown"], [class*="Dropdown"], [class*="picker"]')
          || container;
        clickable.click();
        setTimeout(trySelect, 500);
      }
    });
  }

  // Mapeo organizado por categorías: label → valor, tipo (text | choice)
  const mappings = [
    // === IDENTIFICACIÓN DEL TICKET ===
    { label: 'RE',                   value: '',                                         type: 'text',   category: 'identificación' },
    { label: 'IM',                   value: data.TICKET || '',                           type: 'text',   category: 'identificación' },
    { label: 'Codigo',               value: data.CODIGO || '',                           type: 'text',   category: 'identificación' },
    { label: 'Servicio',             value: data.SERVICIO || '',                         type: 'text',   category: 'identificación' },
    
    // === CLASIFICACIÓN ===
    { label: 'Responsable',          value: data.RESPONSABLE || '',                      type: 'choice', category: 'clasificación' },
    { label: 'Operacion',            value: data.OPERACION || '',                        type: 'choice', category: 'clasificación' },
    { label: 'Causa',                value: data.CAUSA || '',                            type: 'choice', category: 'clasificación' },
    { label: 'Estado',               value: data.ESTADO || '',                           type: 'choice', category: 'clasificación' },
    
    // === DETALLES DEL INCIDENTE ===
    { label: 'Observacion',          value: data.DESCRIPCION || '',                      type: 'text',   category: 'detalles' },
    { label: 'Cierre',               value: data.CIERRE || '',                           type: 'text',   category: 'detalles' },
    { label: 'Creacion Ticket',      value: data['CREACION TICKET'] || '',               type: 'text',   category: 'detalles' },
    
    // === INDICADORES DE IMPACTO ===
    { label: 'Indisponibilidad',     value: data.INDISPONIBILIDAD || '',                 type: 'choice', category: 'impacto' },
    { label: 'Subida Solar',         value: data['SUBIDA SOLAR'] || '',                 type: 'text',   category: 'impacto' },
    { label: 'Fuerza Mayor',         value: data['FUERZA MAYOR'] || 'NO',               type: 'choice', category: 'impacto' },
    
    // === TIEMPOS DE INACTIVIDAD ===
    { label: 'Down time claro',      value: data['DOWN TIME CLARO'] ? String(data['DOWN TIME CLARO']) : '', type: 'text', category: 'tiempos' },
    { label: 'Down Time Davivienda', value: data['DOWN TIME DAVIVIENDA'] ? String(data['DOWN TIME DAVIVIENDA']) : '', type: 'text', category: 'tiempos' },
    { label: 'Down Time Total',      value: data['DOWN TIME TOTAL'] ? String(data['DOWN TIME TOTAL']) : '', type: 'text', category: 'tiempos' },
    
    // === CAMPOS ADICIONALES ===
    { label: 'FM',                   value: '',                                          type: 'text',   category: 'adicional' },
  ];

  async function doFill() {
    let filled = 0;
    for (const { label, value, type } of mappings) {
      if (!value) continue;
      const container = findFieldContainer(label);
      if (!container) continue;

      let ok = false;
      if (type === 'choice') {
        ok = await fillChoiceField(container, value);
      } else {
        ok = fillTextField(container, value);
      }
      if (ok) filled++;
    }
    return filled;
  }

  // Polling: esperar que el formulario cargue
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    const inputs = document.querySelectorAll(
      'input[aria-label], textarea[aria-label], [role="textbox"], [placeholder="Escribe para filtrar"]'
    );
    if (inputs.length >= 1 || attempts >= 25) {
      clearInterval(interval);
      const filled = await doFill();
      showToast(
        filled > 0
          ? `✅ ${filled} campos rellenados. Revisa y haz clic en Guardar.`
          : '⚠️ No se pudieron rellenar campos. Los nombres de columnas pueden ser distintos.',
        filled > 0
      );
    }
  }, 700);
}
