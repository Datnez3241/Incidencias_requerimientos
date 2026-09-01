// Función genérica para enviar mensaje a content.js
async function runExtraction(actionName) {
  const noteText = document.getElementById('updateNote').value.trim();
  const platform = document.getElementById('platformSelect').value;
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
          const displayLabel = field === 'TICKET' ? 'IM' : field;
          fieldName.textContent = displayLabel + ':';
          fieldName.style.cssText = 'font-weight: 600; color: #374151; width: 140px; flex-shrink: 0;';
          
          const fieldValueEl = document.createElement('div');
          fieldValueEl.textContent = fieldValue;
          fieldValueEl.style.cssText = 'color: #6b7280; word-break: break-word; white-space: pre-wrap;';
          
          fieldRow.appendChild(fieldName);
          fieldRow.appendChild(fieldValueEl);
          categoryDiv.appendChild(fieldRow);
        }
      }
      
      modalContent.appendChild(categoryDiv);
    }

    // Botones de acción
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '✅ Confirmar y Enviar Automático';
    confirmBtn.style.cssText = `
      flex: 1; min-width: 150px; background: #0f7b3e; color: white; border: none;
      padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    `;
    confirmBtn.onmouseover = () => confirmBtn.style.background = '#0a5c2d';
    confirmBtn.onmouseout = () => confirmBtn.style.background = '#0f7b3e';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copiar Fila (Cuadrícula)';
    copyBtn.style.cssText = `
      flex: 1; min-width: 150px; background: #3b82f6; color: white; border: none;
      padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    `;
    copyBtn.onmouseover = () => copyBtn.style.background = '#2563eb';
    copyBtn.onmouseout = () => copyBtn.style.background = '#3b82f6';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '❌ Cancelar';
    cancelBtn.style.cssText = `
      flex: 1; min-width: 100px; background: #ef4444; color: white; border: none;
      padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    `;
    cancelBtn.onmouseover = () => cancelBtn.style.background = '#dc2626';
    cancelBtn.onmouseout = () => cancelBtn.style.background = '#ef4444';

    buttonContainer.appendChild(confirmBtn);
    buttonContainer.appendChild(copyBtn);
    buttonContainer.appendChild(cancelBtn);
    modalContent.appendChild(buttonContainer);

    // Evento de copia a portapapeles
    copyBtn.onclick = () => {
      // Orden exacto de columnas de SharePoint según los mappings del script
      const cols = [
        '', // RE
        data.TICKET || '', // IM
        data.CODIGO || '',
        data.SERVICIO || '',
        data.RESPONSABLE || '',
        data.OPERACION || '',
        data.CAUSA || '',
        data.ESTADO || '',
        data.DESCRIPCION || '', // Observacion
        data.CIERRE || '',
        data['CREACION TICKET'] || '',
        data.INDISPONIBILIDAD || '',
        data['SUBIDA SOLAR'] || '',
        data['FUERZA MAYOR'] || 'NO',
        data['DOWN TIME CLARO'] || '',
        data['DOWN TIME DAVIVIENDA'] || '',
        data['DOWN TIME TOTAL'] || '',
        '' // FM
      ];
      // Para pegar en cuadrícula, separamos por tabs (\t) y quitamos saltos de línea para evitar que salte de fila
      const rowString = cols.map(c => String(c).replace(/\r?\n/g, '  ')).join('\t');

      navigator.clipboard.writeText(rowString).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '¡Copiado!';
        copyBtn.style.background = '#10b981';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '#3b82f6';
        }, 2000);
      });
    };

    previewModal.appendChild(modalContent);
    document.body.appendChild(previewModal);

    // Evento de confirmación
    confirmBtn.onclick = () => {
      previewModal.remove();
      statusDiv.textContent = 'Abriendo SharePoint...';
      statusDiv.style.color = '#6b7280';

      chrome.runtime.sendMessage({
        action: 'openAndFillSharePoint',
        url: spUrl
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



