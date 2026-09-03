document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const dateFromInput = document.getElementById('dateFrom');
    const dateToInput = document.getElementById('dateTo');
    const exportBtn = document.getElementById('exportBtn');
    let allTickets = [];
    let currentFilteredTickets = [];
    let currentPlatform = 'Todas';

    // Fetch initial data
    fetchData();

    // Event listeners
    refreshBtn.addEventListener('click', () => {
        const icon = refreshBtn.querySelector('i');
        icon.parentElement.classList.add('spinning');
        fetchData().then(() => {
            setTimeout(() => icon.parentElement.classList.remove('spinning'), 500);
        });
    });

    exportBtn.addEventListener('click', () => {
        exportToCSV(currentFilteredTickets);
    });

    // --- Lógica del Selector de Columnas ---
    const columnBtn = document.getElementById('columnBtn');
    const columnMenu = document.getElementById('columnMenu');
    
    // Generar checkboxes basados en thead (excluyendo la última columna "Acción")
    if (columnMenu) {
        const thElements = document.querySelectorAll('#ticketsTable thead th');
        thElements.forEach((th, index) => {
            if (index < thElements.length - 1) { // No permitir ocultar "Acción"
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = true;
                checkbox.dataset.colIndex = index + 1; // nth-child es 1-based
                
                // Texto limpio sin el ícono
                const text = th.textContent.trim();
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(' ' + text));
                columnMenu.appendChild(label);
                
                checkbox.addEventListener('change', (e) => {
                    const colIdx = e.target.dataset.colIndex;
                    const isHidden = !e.target.checked;
                    
                    // Ocultar/Mostrar TH
                    const targetTh = document.querySelector(`#ticketsTable thead th:nth-child(${colIdx})`);
                    if(targetTh) targetTh.classList.toggle('col-hidden', isHidden);
                    
                    // Ocultar/Mostrar TDs
                    document.querySelectorAll(`#ticketsTable tbody tr`).forEach(tr => {
                        const targetTd = tr.querySelector(`td:nth-child(${colIdx})`);
                        if(targetTd) targetTd.classList.toggle('col-hidden', isHidden);
                    });
                });
            }
        });

        columnBtn.addEventListener('click', () => {
            columnMenu.style.display = columnMenu.style.display === 'none' ? 'flex' : 'none';
        });

        // Cerrar menú si se hace clic fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.column-toggle-container')) {
                columnMenu.style.display = 'none';
            }
        });
    }

    // --- Lógica del Modal de Detalles ---
    const ticketModal = document.getElementById('ticketModal');
    const closeModal = document.getElementById('closeModal');
    const modalBody = document.getElementById('modalBody');
    
    if (closeModal && ticketModal) {
        closeModal.addEventListener('click', () => ticketModal.style.display = 'none');
        ticketModal.addEventListener('click', (e) => {
            if (e.target === ticketModal) ticketModal.style.display = 'none';
        });
    }

    // Sidebar Links & Views
    const platformLinks = document.querySelectorAll('#sidebarNav a[data-platform]');
    const navReportes = document.getElementById('navReportes');
    const tableView = document.getElementById('tableView');
    const chartsView = document.getElementById('chartsView');

    // Switch to Table View
    platformLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Remove active class from all
            platformLinks.forEach(l => l.classList.remove('active'));
            if (navReportes) navReportes.classList.remove('active');
            
            // Add active to clicked
            e.currentTarget.classList.add('active');
            
            // Toggle views
            if (tableView) tableView.style.display = 'flex';
            if (chartsView) chartsView.style.display = 'none';

            currentPlatform = e.currentTarget.getAttribute('data-platform');
            applyFilters();
        });
    });

    // Switch to Charts View
    if (navReportes) {
        navReportes.addEventListener('click', (e) => {
            e.preventDefault();
            platformLinks.forEach(l => l.classList.remove('active'));
            navReportes.classList.add('active');

            if (tableView) tableView.style.display = 'none';
            if (chartsView) chartsView.style.display = 'grid';
        });
    }

    function parseSMDate(dateStr) {
        if (!dateStr) return null;
        // Format expected: DD/MM/YY HH:mm:ss
        const parts = dateStr.split(' ');
        if (parts.length < 1) return null;
        const dateParts = parts[0].split('/');
        if (dateParts.length === 3) {
            let day = parseInt(dateParts[0], 10);
            let month = parseInt(dateParts[1], 10) - 1; // 0-indexed
            let year = parseInt(dateParts[2], 10);
            if (year < 100) year += 2000;
            return new Date(year, month, day);
        }
        return new Date(dateStr);
    }

    const applyFilters = () => {
        const term = searchInput.value.toLowerCase();
        const filterVal = statusFilter.value;
        const dateFromVal = dateFromInput.value;
        const dateToVal = dateToInput.value;

        let dateFrom = dateFromVal ? new Date(dateFromVal + 'T00:00:00') : null;
        let dateTo = dateToVal ? new Date(dateToVal + 'T23:59:59') : null;
        
        const filtered = allTickets.filter(t => {
            // Search filter
            let matchesSearch = true;
            if (term !== '') {
                const imText = t.IM ? String(t.IM).toLowerCase() : '';
                const codText = t.CODIGO ? String(t.CODIGO).toLowerCase() : '';
                matchesSearch = imText.includes(term) || codText.includes(term);
            }
            
            // Status filter
            let matchesStatus = true;
            const estado = (t.ESTADO || '').toLowerCase();
            const isAbierto = !estado.includes('cerrado') && !estado.includes('resuelto');
            
            if (filterVal === 'open' && !isAbierto) matchesStatus = false;
            if (filterVal === 'closed' && isAbierto) matchesStatus = false;

            // Platform filter
            let matchesPlatform = true;
            if (currentPlatform !== 'Todas') {
                matchesPlatform = (t.OPERACION === currentPlatform || t.PLATAFORMA === currentPlatform);
            }

            // Date filter
            let matchesDate = true;
            if (dateFrom || dateTo) {
                const ticketDate = parseSMDate(t["CREACION TICKET"]);
                if (ticketDate && !isNaN(ticketDate.getTime())) {
                    if (dateFrom && ticketDate < dateFrom) matchesDate = false;
                    if (dateTo && ticketDate > dateTo) matchesDate = false;
                }
            }

            return matchesSearch && matchesStatus && matchesPlatform && matchesDate;
        });
        
        // Ordenamiento personalizado: 
        // 1. Abiertos primero, Cerrados después.
        // 2. Si están abiertos, los más antiguos primero (para dar prioridad).
        // 3. Si están cerrados, los más recientes primero.
        filtered.sort((a, b) => {
            const getStatusRank = (statusStr) => {
                const s = (statusStr || '').toLowerCase();
                if (s.includes('cerrado') || s.includes('resuelto')) return 1; // Closed
                return 0; // Open
            };
            const rankA = getStatusRank(a.ESTADO);
            const rankB = getStatusRank(b.ESTADO);
            
            if (rankA !== rankB) {
                return rankA - rankB; // Abiertos (0) antes que Cerrados (1)
            }

            const parseFullDate = (dateStr) => {
                if (!dateStr) return 0;
                const parts = dateStr.trim().split(/[\s/:]+/);
                if (parts.length >= 5) {
                    let d = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, y = parseInt(parts[2], 10);
                    if (y < 100) y += 2000;
                    let hr = parseInt(parts[3], 10), min = parseInt(parts[4], 10), sec = parts.length > 5 ? parseInt(parts[5], 10) : 0;
                    return new Date(y, m, d, hr, min, sec).getTime();
                }
                const d = new Date(dateStr).getTime();
                return isNaN(d) ? 0 : d;
            };

            const timeA = parseFullDate(a["CREACION TICKET"]);
            const timeB = parseFullDate(b["CREACION TICKET"]);

            if (rankA === 0) {
                return timeA - timeB; // Abiertos: más antiguos primero
            } else {
                return timeB - timeA; // Cerrados: más recientes primero
            }
        });

        currentFilteredTickets = filtered;
        renderTable(filtered);
        updateKPIs(filtered);
    };

    searchInput.addEventListener('input', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
    dateFromInput.addEventListener('change', applyFilters);
    dateToInput.addEventListener('change', applyFilters);

    async function fetchData() {
        try {
            const SUPABASE_URL = 'https://yjcgklhdoohuoxmifpnw.supabase.co';
            const SUPABASE_KEY = 'sb_publishable_kCR2lZlyJuzIlwjuXArOLQ_IJ3KXxre';

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
                allTickets = data.map(t => {
                    if (!t.OPERACION && t.PLATAFORMA) {
                        t.OPERACION = t.PLATAFORMA;
                    }
                    // Normalizar FUERZA MAYOR: SI→Si, NO→No
                    const fm = String(t['FUERZA MAYOR'] || '').trim().toUpperCase();
                    t['FUERZA MAYOR'] = fm === 'SI' ? 'Si' : fm === 'NO' ? 'No' : (t['FUERZA MAYOR'] || '');
                    // Normalizar SUBIDA SOLAR: YYYY-MM-DD→DD/MM/YY, SI/NO→vacío
                    const sv = String(t['SUBIDA SOLAR'] || '').trim();
                    if (!sv || sv.toUpperCase() === 'NO' || sv.toUpperCase() === 'SI') {
                        t['SUBIDA SOLAR'] = '';
                    } else {
                        const isoMatch = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        if (isoMatch) t['SUBIDA SOLAR'] = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(2)}`;
                    }
                    return t;
                });
                applyFilters();
            } else {
                console.error("Error from Supabase:", await response.text());
            }
        } catch (error) {
            console.error("Error fetching tickets:", error);
        }
    }

    function parseDescAndAct(t) {
        let causa = String(t.CAUSA || '').trim();
        let desc = String(t.DESCRIPCION || '').trim();
        let obs = String(t.OBSERVACION || '').trim();

        // Compatibilidad hacia atrás: Si no hay CAUSA pero existe ACTUALIZACION,
        // entonces DESCRIPCION (que viene de la base de datos) es en realidad la antigua CAUSA.
        // Y ACTUALIZACION es la nueva DESCRIPCION.
        if (!t.CAUSA && t.ACTUALIZACION) {
            causa = String(t.DESCRIPCION || '').trim();
            desc = String(t.ACTUALIZACION || '').trim();
        }

        if (causa === 'Descripción:' || causa === 'Descripción' || causa.toLowerCase() === 'null') {
            causa = '';
        }

        if ((!causa || causa === 'null') && (!desc || desc === 'null') && obs) {
            // Intentar extraer datos basados en PLANTILLA CIERRE
            const causaMatch = obs.match(/Causa de la falla:\s*([\s\S]*?)(?=\r?\n\s*(?:Soluci[oó]n de la falla:|Falla Atribuible a:|$))/i);
            const solucionMatch = obs.match(/Soluci[oó]n de la falla:\s*([\s\S]*?)(?=\r?\n\s*(?:Falla Atribuible a:|Causa de la falla:|$))/i);

            let extractedCausa = causaMatch ? causaMatch[1].trim() : '';
            let extractedSolucion = solucionMatch ? solucionMatch[1].trim() : '';

            if (extractedCausa || extractedSolucion) {
                causa = extractedCausa;
                // Asignamos la "Solución" como la Descripción del ticket
                desc = extractedSolucion; 
            } else {
                // Lógica original para otros formatos de bitácora
                const parts = obs.split(/(?:\r?\n){2,}/);
                let descBlocks = [];
                let causaLines = [];

                parts.forEach(part => {
                    const trimmed = part.trim();
                    if (trimmed.startsWith('[') || trimmed.match(/^-\s*\[/)) {
                        descBlocks.push(trimmed);
                    } else if (trimmed && trimmed !== 'Descripción:' && trimmed !== 'Descripción') {
                        causaLines.push(trimmed);
                    }
                });

                if (descBlocks.length > 0) desc = descBlocks.join('\n\n');
                if (causaLines.length > 0) causa = causaLines.join('\n\n');
                if (!causa && !desc) causa = obs;
            }
        }

        if (!causa && t.SERVICIO) {
            const parts = String(t.SERVICIO).split('+');
            causa = parts[parts.length - 1].trim();
        }

        return {
            causa: causa && causa !== 'null' ? causa : '-',
            desc: desc && desc !== 'null' ? desc : '-'
        };
    }

    function exportToCSV(tickets) {
        if (!tickets || tickets.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        const allColumns = [
            { header: "IM", key: "IM", index: 1 },
            { header: "OPERACION", key: "OPERACION", index: 2 },
            { header: "RESPONSABLE", key: "RESPONSABLE", index: 3 },
            { header: "CODIGO", key: "CODIGO", index: 4 },
            { header: "SERVICIO", key: "SERVICIO", index: 5 },
            { header: "CAUSA", key: "CAUSA", index: 6 },
            { header: "ESTADO", key: "ESTADO", index: 7 },
            { header: "DESCRIPCION", key: "DESCRIPCION", index: 8 },
            { header: "CIERRE", key: "CIERRE", index: 9 },
            { header: "CREACION TICKET", key: "CREACION TICKET", index: 10 },
            { header: "INDISPONIBILIDAD", key: "INDISPONIBILIDAD", index: 11 },
            { header: "SUBIDA SOLAR", key: "SUBIDA SOLAR", index: 12 },
            { header: "FUERZA MAYOR", key: "FUERZA MAYOR", index: 13 },
            { header: "DOWN TIME CLARO", key: "DOWN TIME CLARO", index: 14 },
            { header: "DOWN TIME DAVIVIENDA", key: "DOWN TIME DAVIVIENDA", index: 15 },
            { header: "DOWN TIME TOTAL", key: "DOWN TIME TOTAL", index: 16 }
        ];

        const columnMenu = document.getElementById('columnMenu');
        let selectedColumns = allColumns;

        if (columnMenu) {
            const checkboxes = Array.from(columnMenu.querySelectorAll('input[type="checkbox"]'));
            if (checkboxes.length > 0) {
                const visibleIndices = checkboxes
                    .filter(cb => cb.checked)
                    .map(cb => parseInt(cb.dataset.colIndex, 10));
                
                if (visibleIndices.length > 0) {
                    selectedColumns = allColumns.filter(col => visibleIndices.includes(col.index));
                }
            }
        }

        const headers = selectedColumns.map(c => c.header);
        const keys = selectedColumns.map(c => c.key);

        let csvContent = "\uFEFFsep=;\n"; // BOM for Excel UTF-8 and force semicolon separator
        csvContent += headers.join(';') + "\n";

        tickets.forEach(t => {
            const parsed = parseDescAndAct(t);
            let row = keys.map(k => {
                let val = t[k];
                if (k === "CAUSA") val = parsed.causa !== '-' ? parsed.causa : '';
                if (k === "DESCRIPCION") val = parsed.desc !== '-' ? parsed.desc : '';
                // Normalizar Fuerza Mayor: SI→Si, NO→No
                if (k === "FUERZA MAYOR") {
                    const fv = String(val || '').trim().toUpperCase();
                    val = fv === 'SI' ? 'Si' : fv === 'NO' ? 'No' : (val || '');
                }
                // Normalizar Subida Solar: fecha DD/MM/YY o vacío
                if (k === "SUBIDA SOLAR") {
                    const sv = String(val || '').trim();
                    if (!sv || sv.toUpperCase() === 'NO' || sv.toUpperCase() === 'SI') {
                        val = '';
                    } else {
                        const isoMatch = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        val = isoMatch ? `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(2)}` : sv;
                    }
                }
                if (!val) val = '';
                // Reemplazar saltos de línea para no romper las filas del CSV
                val = String(val).replace(/\r\n/g, ' | ').replace(/\n/g, ' | ').replace(/\r/g, ' | ');
                val = val.replace(/"/g, '""'); // Escapar comillas dobles
                return `"${val}"`;
            });
            csvContent += row.join(';') + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Reporte_Bitacora_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    function renderTable(tickets) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';

        // Obtenemos las columnas ocultas actuales para mantenerlas ocultas
        let hiddenCols = [];
        const columnMenu = document.getElementById('columnMenu');
        if (columnMenu) {
            hiddenCols = Array.from(columnMenu.querySelectorAll('input[type="checkbox"]'))
                            .filter(cb => !cb.checked)
                            .map(cb => cb.dataset.colIndex);
        }

        tickets.forEach((t, i) => {
            const tr = document.createElement('tr');
            
            // Format Status Badge
            let status = t.ESTADO || 'CERRADO';
            const statusLower = status.toLowerCase();
            let badgeClass = 'abierto'; // Default for any open status
            if (statusLower.includes('cerrado') || statusLower.includes('resuelto')) {
                badgeClass = 'cerrado';
            } else if (statusLower.includes('curso')) {
                badgeClass = 'curso';
            }

            const { causa: causaText, desc: descText } = parseDescAndAct(t);

            tr.innerHTML = `
                <td><strong>${t.IM || '-'}</strong></td>
                <td>${t.OPERACION || '-'}</td>
                <td>${t.RESPONSABLE || '-'}</td>
                <td>${t.CODIGO || '-'}</td>
                <td title="${t.SERVICIO || ''}"><div class="obs-cell text-clamp">${t.SERVICIO || '-'}</div></td>
                <td title="${causaText}"><div class="obs-cell text-clamp">${causaText}</div></td>
                <td><span class="badge ${badgeClass}">${status}</span></td>
                <td title="${descText}"><div class="obs-cell text-clamp">${descText}</div></td>
                <td title="${t.CIERRE || ''}"><div class="obs-cell text-clamp">${t.CIERRE || '-'}</div></td>
                <td>${t["CREACION TICKET"] || '-'}</td>
                <td>${(() => { const iv = (t.INDISPONIBILIDAD||'').trim(); return (!iv || iv === 'PENDIENTE' || iv === 'NO') ? '' : iv; })()}</td>
                <td>${(() => { 
                    const sv = (t['SUBIDA SOLAR']||'').trim(); 
                    if (!sv || sv.toUpperCase() === 'NO' || sv.toUpperCase() === 'SI') return ''; 
                    // Handle YYYY-MM-DD from date input without timezone offset
                    const isoMatch = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(2)}`;
                    const d = new Date(sv); 
                    return isNaN(d.getTime()) ? sv : d.toLocaleDateString('es-CO', {day:'2-digit', month:'2-digit', year:'2-digit'}); 
                })()}</td>
                <td class="td-toggle">
                    <span class="btn-toggle ${(t['FUERZA MAYOR']||'NO').toUpperCase()==='SI'?'toggle-si':'toggle-no'}" 
                          data-id="${t.id}" data-field="FUERZA MAYOR" data-value="${t['FUERZA MAYOR']||'NO'}">
                        ${(t['FUERZA MAYOR']||'NO').toUpperCase()==='SI'?'Si':'No'}
                    </span>
                </td>
                <td>${t["DOWN TIME CLARO"] || '0'}</td>
                <td>${t["DOWN TIME DAVIVIENDA"] || '0'}</td>
                <td><strong>${t["DOWN TIME TOTAL"] || '0'}</strong></td>
                <td style="white-space: nowrap;">
                    <button class="btn-view" data-index="${i}" title="Ver Detalles" style="background: transparent; border: none; color: #10b981; cursor: pointer; padding: 2px;">
                        <i class="ph ph-eye" style="font-size: 14px;"></i>
                    </button>
                    <button class="btn-edit" data-id="${t.id}" data-desc="${descText !== '-' ? descText : ''}" data-obs="${t.OBSERVACION || ''}" title="Editar Descripción" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; padding: 2px;">
                        <i class="ph ph-pencil-simple" style="font-size: 14px;"></i>
                    </button>
                    <button class="btn-delete" data-id="${t.id}" title="Eliminar Ticket" style="background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 2px;">
                        <i class="ph ph-trash" style="font-size: 14px;"></i>
                    </button>
                </td>
            `;
            
            // Ocultar las celdas necesarias
            hiddenCols.forEach(colIdx => {
                const td = tr.querySelector(`td:nth-child(${colIdx})`);
                if (td) td.classList.add('col-hidden');
            });
            
            tbody.appendChild(tr);
        });

        // Dropdown SI/NO para Subida Solar y Fuerza Mayor
        // Eliminar cualquier dropdown previo al re-renderizar
        const existingDropdown = document.getElementById('sinoDropdown');
        if (existingDropdown) existingDropdown.remove();

        // Crear el dropdown compartido (un solo elemento en el DOM)
        const sinoDropdown = document.createElement('div');
        sinoDropdown.id = 'sinoDropdown';
        sinoDropdown.className = 'sino-dropdown';
        sinoDropdown.style.display = 'none';
        sinoDropdown.innerHTML = `
            <label class="sino-option" data-val="SI"><input type="radio" name="sinoval" value="SI"> Si</label>
            <label class="sino-option" data-val="NO"><input type="radio" name="sinoval" value="NO"> No</label>
        `;
        document.body.appendChild(sinoDropdown);

        let activeToggleEl = null;

        async function saveSiNo(el, newVal) {
            const id = el.getAttribute('data-id');
            const field = el.getAttribute('data-field');
            const currentVal = el.getAttribute('data-value').toUpperCase();

            // Actualizar visualmente de inmediato (convirtiendo a Si/No)
            el.textContent = newVal === 'SI' ? 'Si' : 'No';
            el.setAttribute('data-value', newVal);
            el.classList.toggle('toggle-si', newVal === 'SI');
            el.classList.toggle('toggle-no', newVal === 'NO');

            // También actualizar el ticket en memoria para que el CSV refleje el nuevo valor
            const ticketInMemory = currentFilteredTickets.find(t => String(t.id) === String(id));
            if (ticketInMemory) ticketInMemory[field] = newVal;

            try {
                const SUPABASE_URL = 'https://yjcgklhdoohuoxmifpnw.supabase.co';
                const SUPABASE_KEY = 'sb_publishable_kCR2lZlyJuzIlwjuXArOLQ_IJ3KXxre';
                const body = {};
                body[field] = newVal;
                const response = await fetch(`${SUPABASE_URL}/rest/v1/tickets?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                if (!response.ok) {
                    // Revertir si falla
                    el.textContent = currentVal === 'SI' ? 'Si' : 'No';
                    el.setAttribute('data-value', currentVal);
                    el.classList.toggle('toggle-si', currentVal === 'SI');
                    el.classList.toggle('toggle-no', currentVal === 'NO');
                    if (ticketInMemory) ticketInMemory[field] = currentVal;
                    alert('Error al guardar: ' + await response.text());
                }
            } catch (err) {
                alert('Error de conexión.');
            }
        }

        // Listener para cada opción del dropdown
        sinoDropdown.querySelectorAll('.sino-option').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                const chosen = opt.getAttribute('data-val');
                sinoDropdown.style.display = 'none';
                if (activeToggleEl) await saveSiNo(activeToggleEl, chosen);
                activeToggleEl = null;
            });
        });

        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-toggle') && !e.target.closest('#sinoDropdown')) {
                sinoDropdown.style.display = 'none';
                activeToggleEl = null;
            }
        }, { once: false });

        document.querySelectorAll('.btn-toggle').forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const rect = span.getBoundingClientRect();
                const currentVal = span.getAttribute('data-value').toUpperCase();

                // Marcar el radio correspondiente
                sinoDropdown.querySelectorAll('input[type="radio"]').forEach(r => {
                    r.checked = (r.value === currentVal);
                });

                // Posicionar el dropdown debajo del badge
                sinoDropdown.style.left = rect.left + window.scrollX + 'px';
                sinoDropdown.style.top = (rect.bottom + window.scrollY + 2) + 'px';
                sinoDropdown.style.display = 'flex';

                activeToggleEl = span;
            });
        });

        document.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.currentTarget.getAttribute('data-index');
                const t = tickets[idx];
                const { causa: causaVal, desc: descVal } = parseDescAndAct(t);
                
                document.getElementById('modalTitle').textContent = 'Ticket: ' + (t.IM || 'Sin ID');
                
                // --- Extraer el último registro con timestamp [DD/MM/AA HH:mm:ss] ---
                const descText = descVal !== '-' ? descVal : '';
                const timestampRegex = /(?:^|[\s-]+)(\[\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}:\d{2}\][\s\S]*?)(?=(?:\s*-?\s*\[\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}:\d{2}\])|$)/g;
                const matches = [];
                let match;
                while ((match = timestampRegex.exec(descText)) !== null) {
                    matches.push(match[1].trim());
                }
                const lastRecord = matches.length > 0 ? matches[matches.length - 1] : null;

                // Separar el timestamp del texto del último registro para resaltarlos
                let lastRecordHtml = '';
                if (lastRecord) {
                    const tsMatch = lastRecord.match(/^(\[\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}:\d{2}\])([\s\S]*)/);
                    if (tsMatch) {
                        lastRecordHtml = `<span style="color:#777; font-size:11px;">${tsMatch[1]}</span><br><span style="color:#000;">${tsMatch[2].trim()}</span>`;
                    } else {
                        lastRecordHtml = lastRecord;
                    }
                }

                const badgeEl = btn.parentElement.parentElement.querySelector('.badge');
                const badgeClass = badgeEl ? badgeEl.className.split(' ')[1] : '';

                const modalBody = document.getElementById('modalBody');
                modalBody.innerHTML = `
                    <p><strong>Responsable:</strong> ${t.RESPONSABLE || '-'}</p>
                    <p><strong>Código:</strong> ${t.CODIGO || '-'}</p>
                    <p><strong>Estado:</strong> <span class="badge ${badgeClass}">${t.ESTADO || '-'}</span></p>
                    <hr style="border:0; border-top:1px solid #ccc; margin: 10px 0;">
                    <p><strong>Servicio:</strong><br>${t.SERVICIO || '-'}</p>
                    <br>
                    <p><strong>Causa (Antes Descripción):</strong><br><span style="color:#444;">${causaVal}</span></p>
                    <br>
                    <p><strong>Descripción / Actualización (Bitácora):</strong><br><span style="color:#444;">${descVal}</span></p>
                    ${lastRecord ? `
                    <hr style="border:0; border-top:1px solid #ccc; margin: 10px 0;">
                    <div style="background-color:#fffacd; border-left: 3px solid #999; padding: 6px 10px;">
                        <p style="margin:0 0 4px 0;"><strong>⟳ Último Registro de Actualización:</strong></p>
                        <p style="margin:0; user-select:text;">${lastRecordHtml}</p>
                    </div>` : ''}
                    <hr style="border:0; border-top:1px solid #ccc; margin: 10px 0;">
                    <p><strong>Creación:</strong> ${t["CREACION TICKET"] || '-'} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Cierre:</strong> ${t.CIERRE || '-'}</p>
                    <p><strong>DT Claro:</strong> ${t["DOWN TIME CLARO"] || '0'} min &nbsp;&nbsp;|&nbsp;&nbsp; <strong>DT Davivienda:</strong> ${t["DOWN TIME DAVIVIENDA"] || '0'} min</p>
                    <p><strong>Downtime Total:</strong> ${t["DOWN TIME TOTAL"] || '0'} minutos</p>
                `;
                
                document.getElementById('ticketModal').style.display = 'flex';
            });
        });

        // Add event listeners to edit buttons
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const oldDesc = e.currentTarget.getAttribute('data-desc') || e.currentTarget.getAttribute('data-obs') || '';
                const newDesc = prompt('Editar Descripción / Actualización:', oldDesc);
                
                if (newDesc !== null && newDesc !== oldDesc) {
                    try {
                        const SUPABASE_URL = 'https://yjcgklhdoohuoxmifpnw.supabase.co';
                        const SUPABASE_KEY = 'sb_publishable_kCR2lZlyJuzIlwjuXArOLQ_IJ3KXxre';
                        const response = await fetch(`${SUPABASE_URL}/rest/v1/tickets?id=eq.${id}`, {
                            method: 'PATCH',
                            headers: {
                                'apikey': SUPABASE_KEY,
                                'Authorization': `Bearer ${SUPABASE_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ DESCRIPCION: newDesc, OBSERVACION: newDesc })
                        });
                        if (response.ok) {
                            fetchData(); // Recargar datos
                        } else {
                            alert('Error al editar: ' + await response.text());
                        }
                    } catch (err) {
                        alert('Error de conexión.');
                    }
                }
            });
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('¿Estás seguro de que deseas eliminar este registro de la nube?')) {
                    try {
                        const SUPABASE_URL = 'https://yjcgklhdoohuoxmifpnw.supabase.co';
                        const SUPABASE_KEY = 'sb_publishable_kCR2lZlyJuzIlwjuXArOLQ_IJ3KXxre';
                        const response = await fetch(`${SUPABASE_URL}/rest/v1/tickets?id=eq.${id}`, {
                            method: 'DELETE',
                            headers: {
                                'apikey': SUPABASE_KEY,
                                'Authorization': `Bearer ${SUPABASE_KEY}`
                            }
                        });
                        if (response.ok) {
                            fetchData(); // Recargar datos
                        } else {
                            alert('Error al eliminar: ' + await response.text());
                        }
                    } catch (err) {
                        alert('Error de conexión.');
                    }
                }
            });
        });
    }

    function updateKPIs(tickets) {
        const total = tickets.length;
        
        let open = 0;
        let closed = 0;
        let totalDowntime = 0;

        tickets.forEach(t => {
            const status = (t.ESTADO || '').toLowerCase();
            const isAbierto = !status.includes('cerrado') && !status.includes('resuelto');
            
            if (isAbierto) {
                open++;
            } else {
                closed++;
            }

            const dt = parseInt(t["DOWN TIME TOTAL"]);
            if (!isNaN(dt)) {
                totalDowntime += dt;
            }
        });

        document.getElementById('kpiTotal').textContent = total;
        document.getElementById('kpiOpen').textContent = open;
        document.getElementById('kpiClosed').textContent = closed;
        document.getElementById('kpiDowntime').textContent = totalDowntime;
        
        updateCharts(tickets, open, closed);
    }

    let downtimeChartInstance = null;
    let statusChartInstance = null;

    function updateCharts(tickets, openCount, closedCount) {
        // 1. Calcular Downtime (Claro vs Davivienda)
        let dtClaro = 0;
        let dtDavi = 0;

        tickets.forEach(t => {
            const dtC = parseInt(t["DOWN TIME CLARO"]);
            const dtD = parseInt(t["DOWN TIME DAVIVIENDA"]);
            if (!isNaN(dtC)) dtClaro += dtC;
            if (!isNaN(dtD)) dtDavi += dtD;
        });

        const downtimeCtx = document.getElementById('downtimeChart').getContext('2d');
        if (downtimeChartInstance) downtimeChartInstance.destroy();
        
        downtimeChartInstance = new Chart(downtimeCtx, {
            type: 'doughnut',
            data: {
                labels: ['Claro', 'Davivienda'],
                datasets: [{
                    data: [dtClaro, dtDavi],
                    backgroundColor: ['#a4d166', '#36a2eb'], /* Verde y azul tipo imagen */
                    borderWidth: 1,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right', 
                        labels: { color: '#333', font: { family: 'Tahoma, Arial', size: 11 }, boxWidth: 12 } 
                    }
                }
            }
        });

        // 2. Gráfico de Estado de Tickets
        const statusCtx = document.getElementById('statusChart').getContext('2d');
        if (statusChartInstance) statusChartInstance.destroy();

        statusChartInstance = new Chart(statusCtx, {
            type: 'bar',
            data: {
                labels: ['Cerrados', 'Abiertos'],
                datasets: [{
                    label: 'Tickets',
                    data: [closedCount, openCount],
                    backgroundColor: ['#4bc0c0', '#9966ff'], /* Colores de los bloques de la imagen */
                    borderWidth: 0
                }]
            },
            options: {
                indexAxis: 'y', /* Barras horizontales como en la imagen */
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, ticks: { color: '#333', font: { size: 11 } }, grid: { color: '#e0e0e0' } },
                    y: { ticks: { color: '#333', font: { family: 'Tahoma, Arial', size: 11 } }, grid: { display: false } }
                },
                plugins: {
                    legend: { 
                        position: 'right', 
                        labels: { color: '#333', font: { family: 'Tahoma, Arial', size: 11 }, boxWidth: 12 } 
                    }
                }
            }
        });
    }
});
