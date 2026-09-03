// Función genérica para enviar mensaje a content.js
async function runExtraction(actionName) {
  const noteText = document.getElementById('updateNote').value.trim();
  const platform = document.getElementById('platformSelect').value;
  const causa = document.getElementById('causaSelect').value;
  const subidaSolarToggle = document.getElementById('subidaSolarToggle').checked;
  const subidaSolarDate = subidaSolarToggle ? document.getElementById('subidaSolarDate').value : "";
  let responsable = document.getElementById('responsableInput').value.trim();
  if (!responsable) responsable = "DIEGO";

  const statusDiv = document.getElementById('status');
  statusDiv.textContent = actionName === 'updateTicket' ? 'Actualizando y Extrayendo...' : 'Extrayendo...';

  // Copiar al portapapeles desde el popup (tiene foco, no da error)
  if (noteText) {
      navigator.clipboard.writeText(noteText).catch(e => console.log(e));
  }

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
    }
    if (result.savedCausa) {
      document.getElementById('causaSelect').value = result.savedCausa;
    }
    if (result.savedSubidaSolarDate) {
      document.getElementById('subidaSolarDate').value = result.savedSubidaSolarDate;
    }
    
    const isSolarEnabled = result.savedSubidaSolarToggle !== undefined ? result.savedSubidaSolarToggle : false;
    document.getElementById('subidaSolarToggle').checked = isSolarEnabled;
    document.getElementById('subidaSolarDate').disabled = !isSolarEnabled;
    
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

  document.getElementById('subidaSolarDate').addEventListener('change', (e) => {
    chrome.storage.local.set({ savedSubidaSolarDate: e.target.value });
  });

  document.getElementById('subidaSolarToggle').addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.getElementById('subidaSolarDate').disabled = !isChecked;
    chrome.storage.local.set({ savedSubidaSolarToggle: isChecked });
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
});



