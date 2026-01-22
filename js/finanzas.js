// ==========================================
// 5. MÓDULO FINANCIERO
// ==========================================
function abrirModalTransaccion(tipo) {
    document.getElementById('modalTransaccion').style.display = 'flex';
    document.getElementById('formTransaccion').reset();
    document.getElementById('finTipo').value = tipo;
    document.getElementById('finIdMovimientoExistente').value = ""; 
    document.getElementById('bloqueDeudaPendiente').style.display = 'none';
    
    const titulo = document.getElementById('tituloModalFinanzas');
    if(tipo === 'INGRESO') {
        titulo.innerText = 'Registrar Ingreso'; titulo.style.color = '#2e7d32';
        document.getElementById('bloqueVinculacionCliente').style.display = 'block';
        const select = document.getElementById('finClienteSelect');
        select.innerHTML = '<option value="">-- Ninguno / Ingreso General --</option>';
        if(clientesCache) clientesCache.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    } else {
        titulo.innerText = 'Registrar Gasto'; titulo.style.color = '#c62828';
        document.getElementById('bloqueVinculacionCliente').style.display = 'none'; 
    }
    document.getElementById('finFecha').valueAsDate = new Date();
}

async function cargarDeudasClienteFinanzas() {
    const clienteId = document.getElementById('finClienteSelect').value;
    const divDeudas = document.getElementById('bloqueDeudaPendiente');
    const selectDeudas = document.getElementById('finDeudaSelect');
    
    document.getElementById('finIdMovimientoExistente').value = "";
    document.getElementById('finDesc').value = ""; document.getElementById('finMonto').value = "";

    if(!clienteId) { divDeudas.style.display = 'none'; return; }

    const { data: deudas } = await clienteSupabase.from('finanzas_movimientos').select('*').eq('cliente_id', clienteId).eq('estado', 'PENDIENTE').eq('tipo', 'INGRESO');
    deudasClienteCache = deudas || [];

    if(deudasClienteCache.length > 0) {
        divDeudas.style.display = 'block';
        selectDeudas.innerHTML = '<option value="">-- Selecciona deuda --</option><option value="NUEVO">✨ Ingreso Nuevo</option>';
        deudasClienteCache.forEach(d => selectDeudas.innerHTML += `<option value="${d.id}">${d.descripcion} ($${Number(d.monto_esperado).toLocaleString()})</option>`);
    } else {
        divDeudas.style.display = 'none';
        const c = clientesCache.find(x => x.id == clienteId);
        if(c) document.getElementById('finDesc').value = "Ingreso - " + c.nombre;
    }
}

function seleccionarDeudaExistente() {
    const deudaId = document.getElementById('finDeudaSelect').value;
    if(deudaId && deudaId !== 'NUEVO') {
        const d = deudasClienteCache.find(x => x.id == deudaId);
        if(d) {
            document.getElementById('finIdMovimientoExistente').value = d.id;
            document.getElementById('finDesc').value = d.descripcion;
            document.getElementById('finMonto').value = d.monto_esperado;
            document.getElementById('finEstado').value = 'PAGADO';
        }
    } else {
        document.getElementById('finIdMovimientoExistente').value = "";
        document.getElementById('finMonto').value = "";
    }
}

document.getElementById('formTransaccion').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formTransaccion button[type="submit"]');
    btn.disabled = true; btn.innerHTML = 'Guardando...';

    try {
        const idExistente = document.getElementById('finIdMovimientoExistente').value;
        const datos = {
            tipo: document.getElementById('finTipo').value,
            descripcion: document.getElementById('finDesc').value,
            monto_real: parseFloat(document.getElementById('finMonto').value),
            fecha_pago_real: document.getElementById('finFecha').value,
            estado: document.getElementById('finEstado').value,
            user_id: usuarioActual.id
        };

        if (idExistente) {
            // Pagar deuda existente
            await clienteSupabase.from('finanzas_movimientos').update(datos).eq('id', idExistente);
        } else {
            // Nuevo ingreso/gasto
            datos.monto_esperado = datos.monto_real;
            datos.fecha_vencimiento = datos.fecha_pago_real;
            datos.cliente_id = document.getElementById('finClienteSelect').value || null;
            await clienteSupabase.from('finanzas_movimientos').insert([datos]);
        }

        alert("Registrado."); document.getElementById('modalTransaccion').style.display = 'none'; cargarFinanzas(); 
    } catch(err) { alert("Error: " + err.message); } finally { btn.disabled = false; btn.innerHTML = 'Registrar'; }
});

async function cargarFinanzas() {
    const anio = document.getElementById('filtroAnioFinanzas').value;
    const { data: movs } = await clienteSupabase.from('finanzas_movimientos').select('*')
        .gte('fecha_vencimiento', `${anio}-01-01`).lte('fecha_vencimiento', `${anio}-12-31`).order('fecha_vencimiento', { ascending: true });

    let ingresos = 0, gastos = 0, cartera = 0;
    movs.forEach(m => {
        if(m.estado === 'PAGADO') { if(m.tipo === 'INGRESO') ingresos += m.monto_real; else gastos += m.monto_real; }
        else if (m.tipo === 'INGRESO') cartera += m.monto_esperado;
    });

    const fmt = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
    document.getElementById('kpiIngresos').innerText = fmt(ingresos);
    document.getElementById('kpiGastos').innerText = fmt(gastos);
    document.getElementById('kpiCartera').innerText = fmt(cartera);

    // Timeline simple
    const timeline = document.getElementById('timelineFinanciero');
    timeline.innerHTML = '';
    const meses = Array(12).fill(0).map(() => ({i:0, g:0}));
    movs.forEach(m => {
        const mes = new Date(m.fecha_vencimiento).getMonth();
        if(m.estado==='PAGADO') { if(m.tipo==='INGRESO') meses[mes].i += m.monto_real; else meses[mes].g += m.monto_real; }
    });
    
    // Dibujo simplificado de barras
    meses.forEach((m, idx) => {
        let hI = Math.min(m.i / 100000, 100); let hG = Math.min(m.g / 100000, 100); // Escala simple
        timeline.innerHTML += `<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end;">
            <div style="width:10px; height:${hI}px; background:green;" title="Ingreso"></div>
            <div style="width:10px; height:${hG}px; background:red;" title="Gasto"></div>
            <small>${idx+1}</small>
        </div>`;
    });

    // Tabla
    const tbody = document.getElementById('tablaMovimientosBody');
    tbody.innerHTML = '';
    movs.slice(0, 10).forEach(m => {
        tbody.innerHTML += `<tr><td>${m.fecha_vencimiento}</td><td>${m.tipo}</td><td>${m.descripcion}</td><td>${m.estado}</td><td>${fmt(m.monto_esperado)}</td></tr>`;
    });
}
