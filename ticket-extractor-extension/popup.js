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

async function updatePreviewCard() {
  const previewTicketNum = document.getElementById('previewTicketNum');
  const previewStatusBadge = document.getElementById('previewStatusBadge');
  const previewDetails = document.getElementById('previewDetails');

  if (!previewTicketNum) return;

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      previewTicketNum.textContent = '❌ Sin pestaña activa';
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        previewTicketNum.textContent = '⚠️ Página no conectada';
        previewDetails.textContent = 'Abre una ventana de ticket en HPSM';
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'previewData' }, { frameId: 0 }, (response) => {
        if (chrome.runtime.lastError || !response || !response.data) {
          previewTicketNum.textContent = '❓ Sin ticket detectado';
          previewDetails.textContent = 'Navega a un ticket IM o RF';
          return;
        }

        const data = response.data;
        if (data.TICKET && data.TICKET !== 'DESCONOCIDO') {
          previewTicketNum.textContent = `📋 ${data.TICKET}`;
          
          const isClosed = (data.ESTADO || '').toLowerCase().includes('cerrad');
          previewStatusBadge.textContent = isClosed ? 'CERRADO' : 'ABIERTO';
          previewStatusBadge.style.background = isClosed ? '#ef4444' : '#10b981';

          let detailsText = '';
          if (data.CODIGO) detailsText += `CI: ${data.CODIGO} | `;
          detailsText += data.SERVICIO || 'Sin servicio';
          previewDetails.textContent = detailsText;
        } else {
          previewTicketNum.textContent = '❓ Sin ticket en pantalla';
          previewDetails.textContent = 'Abre un caso IM o RF en la página';
          previewStatusBadge.textContent = '--';
          previewStatusBadge.style.background = '#9ca3af';
        }
      });
    });
  } catch (err) {
    previewTicketNum.textContent = '⚠️ Error al escanear';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Escanear e intentar mostrar vista previa inmediatamente
  updatePreviewCard();

  // Plantillas de notas rápidas
  const quickNotesSelect = document.getElementById('quickNotesSelect');
  if (quickNotesSelect) {
    quickNotesSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        const updateArea = document.getElementById('updateNote');
        if (updateArea.value.trim()) {
          updateArea.value = val + '\n\n' + updateArea.value.trim();
        } else {
          updateArea.value = val;
        }
      }
    });
  }

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



