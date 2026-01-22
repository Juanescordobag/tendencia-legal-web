// ==========================================
// 4. AGENDA Y CALCULADORA
// ==========================================
let calendarioInstancia = null;
const festivosColombia = ["2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18", "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20", "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17", "2025-12-08", "2025-12-25", "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25"];

function abrirModalEvento() {
    document.getElementById('modalEvento').style.display = 'flex';
    document.getElementById('formEvento').reset();
    const select = document.getElementById('evtProcesoId');
    select.innerHTML = '<option value="">-- Ninguno / Evento General --</option>';
    if(procesosCache) procesosCache.forEach(p => select.innerHTML += `<option value="${p.id}">${p.clientes ? p.clientes.nombre : 'Cliente'} - ${p.tipo}</option>`);
}
function cerrarModalEvento() { document.getElementById('modalEvento').style.display = 'none'; }

document.getElementById('formEvento').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formEvento button[type="submit"]');
    btn.disabled = true; btn.innerHTML = 'Guardando...';
    try {
        const pid = document.getElementById('evtProcesoId').value;
        const { error } = await clienteSupabase.from('agenda').insert([{
            titulo: document.getElementById('evtTitulo').value, fecha_inicio: document.getElementById('evtFecha').value,
            tipo_evento: document.getElementById('evtTipo').value, proceso_id: pid || null,
            descripcion: document.getElementById('evtDescripcion').value, user_id: usuarioActual.id
        }]);
        if(error) throw error;
        alert("Agendado."); cerrarModalEvento(); calendarioInstancia.refetchEvents();
    } catch(err) { alert("Error: "+err.message); } finally { btn.disabled = false; btn.innerHTML = 'Guardar'; }
});

function cargarAgenda() {
    const calendarEl = document.getElementById('calendar');
    if (calendarioInstancia) { setTimeout(() => window.dispatchEvent(new Event('resize')), 100); return; }
    
    calendarioInstancia = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'es',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Lista' },
        events: async function(info, successCallback, failureCallback) {
            try {
                const { data, error } = await clienteSupabase.from('agenda').select('*');
                if(error) throw error;
                
                const misEventos = data.map(evt => ({
                    title: evt.titulo, start: evt.fecha_inicio,
                    color: evt.tipo_evento === 'Audiencia' ? '#B68656' : (evt.tipo_evento === 'Vencimiento' ? '#c62828' : '#162F45'),
                    extendedProps: { descripcion: evt.descripcion }
                }));
                const festivos = festivosColombia.map(f => ({ start: f, display: 'background', backgroundColor: '#ffcdd2', title: 'FESTIVO' }));
                successCallback([...misEventos, ...festivos]);
            } catch(err) { failureCallback(err); }
        },
        eventClick: function(info) { alert('Evento: ' + info.event.title + '\n\n' + (info.event.extendedProps.descripcion || '')); }
    });
    calendarioInstancia.render();
}

// CALCULADORA
function abrirModalCalculadora() { document.getElementById('modalCalculadora').style.display = 'flex'; document.getElementById('calcFechaInicio').valueAsDate = new Date(); document.getElementById('resultadoCalculo').style.display = 'none'; }
function cerrarModalCalculadora() { document.getElementById('modalCalculadora').style.display = 'none'; }

function realizarCalculo() {
    const fechaInput = document.getElementById('calcFechaInicio').value;
    const diasInput = parseInt(document.getElementById('calcDias').value);
    const tipo = document.getElementById('calcTipo').value;
    
    if (!fechaInput || !diasInput) return alert("Faltan datos");
    
    let fechaActual = new Date(fechaInput + 'T00:00:00');
    let diasContados = 0;
    
    while (diasContados < diasInput) {
        fechaActual.setDate(fechaActual.getDate() + 1);
        if (tipo === 'Calendario') { diasContados++; } 
        else {
            const diaSemana = fechaActual.getDay();
            const fechaStr = fechaActual.toISOString().split('T')[0];
            if (diaSemana !== 0 && diaSemana !== 6 && !festivosColombia.includes(fechaStr)) diasContados++;
        }
    }
    
    const textoFecha = fechaActual.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const div = document.getElementById('resultadoCalculo');
    div.innerHTML = `<div style="font-size:14px;color:#666;">Vence el:</div><div style="font-size:18px;font-weight:bold;color:#c62828;text-transform:capitalize;">${textoFecha}</div>`;
    div.style.display = 'block';
}
