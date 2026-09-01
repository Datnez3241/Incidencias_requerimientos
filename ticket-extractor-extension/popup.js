// Función genérica para enviar mensaje a content.js
async function runExtraction(actionName) {
  const noteText = document.getElementById('updateNote').value.trim();
  const platform = document.getElementById('platformSelect').value;
  const causa = document.getElementById('causaSelect').value;
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
          responsable: responsable
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
  chrome.storage.local.get(['savedPlatform', 'savedResponsable', 'savedCausa', 'autoExtractEnabled'], (result) => {
    if (result.savedPlatform) {
      document.getElementById('platformSelect').value = result.savedPlatform;
    }
    if (result.savedCausa) {
      document.getElementById('causaSelect').value = result.savedCausa;
    }
    document.getElementById('responsableInput').value = result.savedResponsable || "DIEGO";
    updateToggleUI(result.autoExtractEnabled !== undefined ? result.autoExtractEnabled : true);
  });

  // Guardar configuración cuando cambie
  document.getElementById('platformSelect').addEventListener('change', (e) => {
    chrome.storage.local.set({ savedPlatform: e.target.value });
  });

  document.getElementById('causaSelect').addEventListener('change', (e) => {
    chrome.storage.local.set({ savedCausa: e.target.value });
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

      statusDiv.textContent = 'Abriendo SharePoint...';
      statusDiv.style.color = '#6b7280';

      // Abrir el formulario de nueva entrada
      const tab = await chrome.tabs.create({ url: SP_NEW_FORM, active: true });

      // Esperar a que cargue la página y luego inyectar el relleno automático
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: fillSharePointForm,
              args: [result.lastExtractedTicket]
            }).catch(err => {
              statusDiv.textContent = 'Error al inyectar: ' + err.message;
              statusDiv.style.color = 'red';
            });
          }, 4000); // Dar tiempo extra para que SharePoint cargue sus controles React/SPFx
        }
      });
    });
  });
});


// ============================================================
// FUNCIÓN QUE SE INYECTA EN SHAREPOINT (func + args)
// Recibe los datos del ticket directamente, sin necesitar storage
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

  function setByLabel(labelText, value) {
    if (value === null || value === undefined || value === '') return false;
    const val = String(value);

    // Buscar inputs con aria-label
    for (const sel of [
      `input[aria-label="${labelText}"]`,
      `textarea[aria-label="${labelText}"]`,
      `[role="textbox"][aria-label="${labelText}"]`,
      `input[aria-label*="${labelText}"]`,
      `textarea[aria-label*="${labelText}"]`,
    ]) {
      const el = document.querySelector(sel);
      if (el) { nativeSet(el, val); return true; }
    }

    // Buscar por texto exacto del label visible
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === labelText) {
        let parent = node.parentElement;
        for (let i = 0; i < 8 && parent; i++) {
          const inp = parent.querySelector(
            'input:not([type=hidden]):not([type=checkbox]), textarea, [role=textbox], [contenteditable=true]'
          );
          if (inp) {
            if (inp.contentEditable === 'true') {
              inp.textContent = val;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              nativeSet(inp, val);
            }
            return true;
          }
          parent = parent.parentElement;
        }
      }
    }
    return false;
  }

  function doFill() {
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
      { label: 'Subida Solar',         value: data['SUBIDA SOLAR'] || 'NO' },
      { label: 'Fuerza Mayor',         value: data['FUERZA MAYOR'] || 'NO' },
      { label: 'Down time claro',      value: data['DOWN TIME CLARO'] ? String(data['DOWN TIME CLARO']) : '' },
      { label: 'Down Time Davivienda', value: data['DOWN TIME DAVIVIENDA'] ? String(data['DOWN TIME DAVIVIENDA']) : '' },
      { label: 'Down Time Total',      value: data['DOWN TIME TOTAL'] ? String(data['DOWN TIME TOTAL']) : '' },
      { label: 'Operacion',            value: data.OPERACION || '' },
      { label: 'FM',                   value: '' },
    ];
    let filled = 0;
    for (const { label, value } of mappings) {
      if (setByLabel(label, value)) filled++;
    }
    return filled;
  }

  // Polling: intentar cada 600ms hasta que haya campos disponibles
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    const inputs = document.querySelectorAll(
      'input[aria-label], textarea[aria-label], [role="textbox"]'
    );
    if (inputs.length >= 2 || attempts >= 25) {
      clearInterval(interval);
      const filled = doFill();
      showToast(
        filled > 0
          ? `✅ ${filled} campos rellenados. Revisa y haz clic en Guardar.`
          : '⚠️ No se pudieron rellenar campos. Verifica los nombres de columnas.',
        filled > 0
      );
    }
  }, 600);
}
