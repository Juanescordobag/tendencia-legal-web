// ==========================================
// 5. MÓDULO FINANCIERO (CORREGIDO Y COMPLETO)
// ==========================================

// 1. Variable necesaria para el funcionamiento del modal (Faltaba esto)
let deudasClienteCache = [];

function abrirModalTransaccion(tipo) {
    document.getElementById('modalTransaccion').style.display = 'flex';
    document.getElementById('formTransaccion').reset();
    document.getElementById('finTipo').value = tipo;
    
    // Limpiamos campos ocultos y visuales
    document.getElementById('finIdMovimientoExistente').value = ""; 
    document.getElementById('bloqueDeudaPendiente').style.display = 'none';
    
    // Configuración Visual (Títulos y Colores)
    const titulo = document.getElementById('tituloModalFinanzas');
    const bloqueVincular = document.getElementById('bloqueVinculacionCliente');

    if(tipo === 'INGRESO') {
        titulo.innerText = 'Registrar Ingreso / Recaudo';
        titulo.style.color = '#2e7d32';
        bloqueVincular.style.display = 'block'; // Mostrar selector de clientes solo en Ingresos
        
        // Cargar Clientes en el Select (Para poder vincular)
        const select = document.getElementById('finClienteSelect');
        select.innerHTML = '<option value="">-- Ninguno / Ingreso General --</option>';
        // Usamos la variable global clientesCache que viene de config.js/clientes.js
        if(typeof clientesCache !== 'undefined' && clientesCache.length > 0) {
            clientesCache.forEach(c => {
                select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
            });
        }

    } else {
        // Si es GASTO, ocultamos la vinculación de cliente
        titulo.innerText = 'Registrar Gasto Operativo';
        titulo.style.color = '#c62828';
        bloqueVincular.style.display = 'none'; 
    }
    document.getElementById('finFecha').valueAsDate = new Date();
}

// A. DETECTAR CUANDO ELIGEN UN CLIENTE (Para buscar sus deudas)
async function cargarDeudasClienteFinanzas() {
    const clienteId = document.getElementById('finClienteSelect').value;
    const divDeudas = document.getElementById('bloqueDeudaPendiente');
    const selectDeudas = document.getElementById('finDeudaSelect');
    
    // Resetear formulario para no mezclar datos
    document.getElementById('finIdMovimientoExistente').value = "";
    document.getElementById('finDesc').value = "";
    document.getElementById('finMonto').value = "";

    if(!clienteId) {
        divDeudas.style.display = 'none';
        return;
    }

    // Buscar Deudas PENDIENTES de ese cliente en la base de datos
    const { data: deudas } = await clienteSupabase
        .from('finanzas_movimientos')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('estado', 'PENDIENTE')
        .eq('tipo', 'INGRESO');

    deudasClienteCache = deudas || [];

    // Si tiene deudas, mostramos el segundo selector
    if(deudasClienteCache.length > 0) {
        divDeudas.style.display = 'block';
        selectDeudas.innerHTML = '<option value="">-- Selecciona qué deuda paga --</option>';
        selectDeudas.innerHTML += '<option value="NUEVO">✨ Es un ingreso nuevo (No listado)</option>';
        
        deudasClienteCache.forEach(d => {
            // Formato visual: "Honorarios... - $5.000.000"
            const valorFmt = Number(d.monto_esperado).toLocaleString();
            selectDeudas.innerHTML += `<option value="${d.id}">${d.descripcion} ($${valorFmt})</option>`;
        });
    } else {
        divDeudas.style.display = 'none';
        // Si no tiene deudas, asumimos que es un ingreso nuevo automáticamente
        const cliente = clientesCache.find(c => c.id == clienteId);
        if(cliente) document.getElementById('finDesc').value = "Ingreso Adicional - " + cliente.nombre;
    }
}

// B. CUANDO ELIGEN UNA DEUDA ESPECÍFICA (Autocompletar datos)
function seleccionarDeudaExistente() {
    const deudaId = document.getElementById('finDeudaSelect').value;
    
    if(deudaId && deudaId !== 'NUEVO') {
        // Llenar datos automáticamente con la info de la deuda
        const deuda = deudasClienteCache.find(d => d.id == deudaId);
        if(deuda) {
            document.getElementById('finIdMovimientoExistente').value = deuda.id; // ¡CLAVE PARA ACTUALIZAR!
            document.getElementById('finDesc').value = deuda.descripcion;
            document.getElementById('finMonto').value = deuda.monto_esperado;
            // Sugerir que ya está pagado
            document.getElementById('finEstado').value = 'PAGADO';
        }
    } else {
        // Limpiar para ingreso nuevo
        document.getElementById('finIdMovimientoExistente').value = "";
        document.getElementById('finMonto').value = "";
        const clienteId = document.getElementById('finClienteSelect').value;
        const cliente = clientesCache.find(c => c.id == clienteId);
        if(cliente) document.getElementById('finDesc').value = "Ingreso Extra - " + cliente.nombre;
    }
}

// C. GUARDAR TRANSACCIÓN (Soporta UPDATE o INSERT)
document.getElementById('formTransaccion').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formTransaccion button[type="submit"]');
    btn.innerHTML = 'Guardando...'; btn.disabled = true;

    try {
        const idExistente = document.getElementById('finIdMovimientoExistente').value;
        const tipo = document.getElementById('finTipo').value;
        const monto = parseFloat(document.getElementById('finMonto').value);
        const estado = document.getElementById('finEstado').value;
        const fecha = document.getElementById('finFecha').value;
        const clienteId = document.getElementById('finClienteSelect').value || null;
        
        // Si pagan, la fecha real es hoy (o la que pusieron). Si es pendiente, no hay fecha real.
        const fechaPagoReal = (estado === 'PAGADO') ? fecha : null;

        if (idExistente) {
            // CASO 1: PAGAR UNA DEUDA EXISTENTE (UPDATE)
            // No creamos fila nueva, actualizamos la amarilla a verde
            const { error } = await clienteSupabase
                .from('finanzas_movimientos')
                .update({
                    monto_real: monto, // Ahora sí entró la plata
                    fecha_pago_real: fechaPagoReal,
                    estado: estado, // Pasa de PENDIENTE a PAGADO
                    descripcion: document.getElementById('finDesc').value
                })
                .eq('id', idExistente);
            
            if (error) throw error;

        } else {
            // CASO 2: INGRESO NUEVO O GASTO (INSERT)
            // Se crea una fila nueva en la base de datos
            const { error } = await clienteSupabase
                .from('finanzas_movimientos')
                .insert([{
                    tipo: tipo,
                    descripcion: document.getElementById('finDesc').value,
                    monto_esperado: monto,
                    monto_real: (estado === 'PAGADO') ? monto : 0,
                    fecha_vencimiento: fecha,
                    fecha_pago_real: fechaPagoReal,
                    estado: estado,
                    categoria: (tipo === 'INGRESO') ? 'Honorarios' : 'Gastos Generales',
                    cliente_id: clienteId, // Vinculado al cliente (si seleccionaron uno)
                    user_id: usuarioActual.id
                }]);

            if (error) throw error;
        }

        alert("Movimiento registrado correctamente.");
        document.getElementById('modalTransaccion').style.display = 'none';
        cargarFinanzas(); 

    } catch(err) {
        alert("Error: " + err.message);
    } finally {
        btn.innerHTML = 'Registrar'; btn.disabled = false;
    }
});

// CARGAR DASHBOARD FINANCIERO (Lógica de Gráficos Completa)
async function cargarFinanzas() {
    const anio = document.getElementById('filtroAnioFinanzas').value;
    const fechaInicio = `${anio}-01-01`;
    const fechaFin = `${anio}-12-31`;

    const { data: movimientos, error } = await clienteSupabase
        .from('finanzas_movimientos')
        .select('*')
        .gte('fecha_vencimiento', fechaInicio)
        .lte('fecha_vencimiento', fechaFin)
        .order('fecha_vencimiento', { ascending: true });

    if(error) { console.error(error); return; }

    // Calcular KPIs
    let totalIngresosReales = 0;
    let totalGastos = 0;
    let totalCartera = 0;

    movimientos.forEach(m => {
        if(m.estado === 'PAGADO') {
            if(m.tipo === 'INGRESO') totalIngresosReales += m.monto_real;
            if(m.tipo === 'GASTO') totalGastos += m.monto_real;
        } else if (m.estado === 'PENDIENTE' && m.tipo === 'INGRESO') {
            totalCartera += m.monto_esperado;
        }
    });

    const fmt = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

    document.getElementById('kpiIngresos').innerText = fmt(totalIngresosReales);
    document.getElementById('kpiGastos').innerText = fmt(totalGastos);
    document.getElementById('kpiCartera').innerText = fmt(totalCartera);

    renderizarTimeline(movimientos, fmt);
    
    // Tabla Detalle
    const tbody = document.getElementById('tablaMovimientosBody');
    tbody.innerHTML = '';
    movimientos.slice(0, 10).forEach(m => { 
        let colorEstado = m.estado === 'PAGADO' ? '#2e7d32' : '#f57c00';
        let signo = m.tipo === 'GASTO' ? '-' : '+';
        let colorMonto = m.tipo === 'GASTO' ? '#c62828' : '#2e7d32';

        tbody.innerHTML += `
            <tr>
                <td>${m.fecha_vencimiento}</td>
                <td><span class="badge" style="background:${m.tipo==='INGRESO'?'#e8f5e9':'#ffebee'}; color:${colorMonto}">${m.tipo}</span></td>
                <td>${m.descripcion}</td>
                <td><span style="color:${colorEstado}; font-weight:bold; font-size:11px;">${m.estado}</span></td>
                <td style="color:${colorMonto}; font-weight:bold;">${signo} ${fmt(m.monto_esperado)}</td>
            </tr>
        `;
    });
}

function renderizarTimeline(movimientos, fmt) {
    const contenedor = document.getElementById('timelineFinanciero');
    contenedor.innerHTML = '';

    const meses = Array(12).fill(null).map(() => ({ ingreso: 0, gasto: 0, cartera: 0 }));
    
    movimientos.forEach(m => {
        const mesIndex = new Date(m.fecha_vencimiento).getMonth();
        if(m.tipo === 'GASTO' && m.estado === 'PAGADO') {
            meses[mesIndex].gasto += m.monto_real;
        } else if (m.tipo === 'INGRESO') {
            if(m.estado === 'PAGADO') meses[mesIndex].ingreso += m.monto_real;
            else meses[mesIndex].cartera += m.monto_esperado;
        }
    });

    const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    let maxValor = 0;
    meses.forEach(m => {
        if((m.ingreso + m.cartera) > maxValor) maxValor = m.ingreso + m.cartera;
        if(m.gasto > maxValor) maxValor = m.gasto;
    });
    if(maxValor === 0) maxValor = 1;

    meses.forEach((m, i) => {
        const hIngreso = (m.ingreso / maxValor) * 150;
        const hCartera = (m.cartera / maxValor) * 150;
        const hGasto = (m.gasto / maxValor) * 150;

        contenedor.innerHTML += `
            <div style="flex: 1; min-width: 60px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; border-right: 1px dashed #eee;">
                <div style="display:flex; flex-direction:column-reverse; width: 40%; align-items:center; margin-bottom:2px;">
                    <div title="Recaudado: ${fmt(m.ingreso)}" style="width:100%; height:${hIngreso}px; background:#4caf50; border-radius: 2px 2px 0 0;"></div>
                    <div title="Por Cobrar: ${fmt(m.cartera)}" style="width:100%; height:${hCartera}px; background:#ffb74d; border-radius: 2px 2px 0 0;"></div>
                </div>
                <div title="Gastos: ${fmt(m.gasto)}" style="width: 40%; height:${hGasto}px; background:#ef5350; border-radius: 2px 2px 0 0; opacity:0.8;"></div>
                <div style="margin-top: 10px; font-size: 11px; font-weight: bold; color: #555;">${nombresMeses[i]}</div>
            </div>
        `;
    });
}
