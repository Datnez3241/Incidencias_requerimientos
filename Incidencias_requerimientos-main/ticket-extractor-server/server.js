const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Servir archivos estáticos del Dashboard

// Configuración de Supabase
const SUPABASE_URL = 'https://yjcgklhdoohuoxmifpnw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kCR2lZlyJuzIlwjuXArOLQ_IJ3KXxre';

// El orden de las columnas que definiste
const HEADERS = [
  "TICKET", "OPERACION", "RESPONSABLE", "CODIGO", "SERVICIO", "ESTADO", "CAUSA", "DESCRIPCION",
  "CIERRE", "CREACION TICKET", "INDISPONIBILIDAD", "SUBIDA SOLAR", "FUERZA MAYOR",
  "DOWN TIME CLARO", "DOWN TIME DAVIVIENDA", "DOWN TIME TOTAL"
];

function formatFecha(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}:${ss}`;
}

app.post('/append', async (req, res) => {
  try {
    const data = req.body;

    // Validación de seguridad para evitar guardar basura si se extrae de otra página
    if (!data.TICKET || (!data.TICKET.toUpperCase().startsWith('IM') && !data.TICKET.toUpperCase().startsWith('RF'))) {
      return res.status(400).json({ success: false, error: "Datos inválidos: El ticket debe empezar con IM o RF." });
    }

    // Verificar si el ticket ya existe en Supabase
    const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/tickets?TICKET=eq.${encodeURIComponent(data.TICKET)}&select=id`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const existingTickets = await checkResponse.json();

    if (existingTickets && existingTickets.length > 0) {
      // Actualizar ticket existente
      const existingId = existingTickets[0].id;
      const updateData = {};

      // Solo actualizar campos que tienen valor
      HEADERS.forEach(header => {
        if (data[header] !== undefined && data[header] !== "") {
          updateData[header] = data[header];
        }
      });

      const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/tickets?id=eq.${existingId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (updateResponse.ok) {
        console.log(`✅ Ticket actualizado en Supabase: ${data.TICKET}`);
        res.json({ success: true, message: 'Ticket actualizado correctamente en Supabase' });
      } else {
        const errorText = await updateResponse.text();
        console.error('Error al actualizar en Supabase:', errorText);
        res.status(500).json({ success: false, error: errorText });
      }
    } else {
      // Crear nuevo ticket
      const newTicket = {};
      HEADERS.forEach(header => {
        if (data[header] !== undefined) {
          newTicket[header] = data[header];
        }
      });

      const createResponse = await fetch(`${SUPABASE_URL}/rest/v1/tickets`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTicket)
      });

      if (createResponse.ok) {
        console.log(`✅ Nuevo ticket creado en Supabase: ${data.TICKET}`);
        res.json({ success: true, message: 'Ticket creado correctamente en Supabase' });
      } else {
        const errorText = await createResponse.text();
        console.error('Error al crear en Supabase:', errorText);
        res.status(500).json({ success: false, error: errorText });
      }
    }

  } catch (error) {
    console.error('Error al guardar en Supabase:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para leer los tickets y enviarlos al Dashboard
app.get('/api/tickets', async (req, res) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/tickets?select=*&order=id.desc`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ success: true, data: data });
    } else {
      console.error('Error al leer de Supabase:', await response.text());
      res.status(500).json({ success: false, error: 'Error al leer de Supabase' });
    }
  } catch (error) {
    console.error('Error al leer tickets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📁 Guardando datos en Supabase: ${SUPABASE_URL}`);
  console.log('==================================================');
});
