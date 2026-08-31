const express = require('express');
const cors = require('cors');
const fs = require('fs');
const xlsx = require('xlsx');
const XlsxPopulate = require('xlsx-populate');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Servir archivos estáticos del Dashboard

// Ruta al archivo de Bitácora en tu OneDrive (cámbiala si es diferente)
const ONEDRIVE_PATH = 'C:\\Users\\45661892\\Comunicacion Celular S.A.- Comcel S.A\\Operación NOC Clientes Especiales - Davivienda';
const EXCEL_FILE = path.join(ONEDRIVE_PATH, 'Bitacora Davivienda  2026 - Telefonia Diego.xlsm');

// El orden de las columnas que definiste
const HEADERS = [
  "TICKET", "RESPONSABLE", "CODIGO", "SERVICIO", "ESTADO", "OBSERVACION",
  "CIERRE", "CREACION TICKET", "INDISPONIBILIDAD", "SUBIDA SOLAR", "FUERZA MAYOR",
  "DOWN TIME CLARO", "DOWN TIME DAVIVIENDA", "DOWN TIME  TOTAL"
];

app.post('/append', async (req, res) => {
  try {
    const data = req.body;
    
    // Validación de seguridad para evitar guardar basura si se extrae de otra página
    if (!data.TICKET || (!data.TICKET.toUpperCase().startsWith('IM') && !data.TICKET.toUpperCase().startsWith('RF'))) {
      return res.status(400).json({ success: false, error: "Datos inválidos: El ticket debe empezar con IM o RF." });
    }

    if (!fs.existsSync(EXCEL_FILE)) {
      return res.status(404).json({ success: false, error: "El archivo Excel corporativo no se encontró en la ruta." });
    }

    // Usar xlsx-populate para modificar el archivo de forma 100% segura sin tocar las macros ni el formato
    const workbook = await XlsxPopulate.fromFileAsync(EXCEL_FILE);
    const sheet = workbook.sheet('TELEFONIA');
    
    if (!sheet) {
      return res.status(404).json({ success: false, error: "No se encontró la pestaña TELEFONIA en el archivo." });
    }

    // Buscar si el ticket ya existe y encontrar la última fila
    let existingRowIndex = -1;
    let rowNum = 2; // Empezar después de los encabezados
    
    while (true) {
      const cellValue = sheet.cell(`A${rowNum}`).value();
      if (cellValue === undefined || cellValue === null || cellValue === "") {
        break; // Llegamos al final de los datos
      }
      if (String(cellValue).trim() === String(data.TICKET).trim()) {
        existingRowIndex = rowNum;
        break;
      }
      rowNum++;
    }

    const targetRow = existingRowIndex !== -1 ? existingRowIndex : rowNum;
    
    // Columnas mapeadas A-N
    const colMap = {
      "TICKET": "A", "RESPONSABLE": "B", "CODIGO": "C", "SERVICIO": "D", "ESTADO": "E", "OBSERVACION": "F",
      "CIERRE": "G", "CREACION TICKET": "H", "INDISPONIBILIDAD": "I", "SUBIDA SOLAR": "J", "FUERZA MAYOR": "K",
      "DOWN TIME CLARO": "L", "DOWN TIME DAVIVIENDA": "M", "DOWN TIME  TOTAL": "N"
    };

    if (existingRowIndex !== -1) {
      // Actualizar fila existente de forma segura
      HEADERS.forEach(header => {
        const col = colMap[header];
        if (header === 'OBSERVACION') {
          let oldObs = sheet.cell(`${col}${targetRow}`).value() || "";
          let newObs = data[header] || "";
          if (newObs && newObs !== "Sin observación") {
            if (oldObs && oldObs !== "Sin observación") {
              if (!String(oldObs).includes(newObs)) {
                sheet.cell(`${col}${targetRow}`).value(oldObs + " | " + newObs);
              }
            } else {
              sheet.cell(`${col}${targetRow}`).value(newObs);
            }
          }
        } else if (data[header] !== undefined && data[header] !== "") {
          sheet.cell(`${col}${targetRow}`).value(data[header]);
        }
      });
    } else {
      // Agregar nueva fila
      HEADERS.forEach(header => {
        const col = colMap[header];
        if (data[header] !== undefined) {
          sheet.cell(`${col}${targetRow}`).value(data[header]);
        }
      });
    }

    // Guardar los cambios directamente
    await workbook.toFileAsync(EXCEL_FILE);
    
    console.log(`✅ Nuevo ticket guardado seguro en la fila ${targetRow}: ${data.TICKET}`);
    res.json({ success: true, message: 'Fila agregada correctamente con máxima seguridad' });
    
  } catch (error) {
    console.error('Error al guardar en Excel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para leer los tickets y enviarlos al Dashboard
app.get('/api/tickets', (req, res) => {
  try {
    if (fs.existsSync(EXCEL_FILE)) {
      const workbook = xlsx.readFile(EXCEL_FILE);
      const sheetName = workbook.SheetNames.includes('TELEFONIA') ? 'TELEFONIA' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: HEADERS });
      
      // Filtramos la primera fila si es de encabezados puros, aunque si pasamos {header: HEADERS}, xlsx no asume la primera como header sino como dato si coincide
      const cleanData = data.filter(row => row.TICKET && row.TICKET !== 'TICKET');
      
      res.json({ success: true, data: cleanData });
    } else {
      res.json({ success: true, data: [] });
    }
  } catch (error) {
    console.error('Error al leer Excel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📁 Guardando archivos en: ${EXCEL_FILE}`);
  console.log('==================================================');
});
