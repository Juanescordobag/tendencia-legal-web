// ==========================================
// 5. MÓDULO FINANCIERO (CORREGIDO)
// ==========================================

// Variable global para este módulo
let deudasClienteCache = [];

// --- ABRIR MODAL (Ingreso o Gasto) ---
function abrirModalTransaccion(tipo) {
    const modal = document.getElementById('modalTransaccion');
    if(!modal) return; // Seguridad por si no ha cargado el HTML

    modal.style.display = 'flex';
    document.getElementById('formTransaccion').reset();
    document.getElementById('finTipo').value = tipo;
    
    // Limpiar estados ocultos
    const inputId = document.getElementById('finIdMovimientoExistente');
    if(inputId) inputId.value = ""; 
    
    document.getElementById('bloqueDeudaPendiente').style.display = 'none';
    
    // Configurar Títulos y Colores
    const titulo = document.getElementById('tituloModalFinanzas');
    const bloqueVincular = document.getElementById('bloqueVinculacionCliente');

    if(tipo === 'INGRESO') {
        titulo.innerText = 'Registrar Ingreso / Recaudo';
        titulo.style.color = '#2e7d32';
        if(bloqueVincular) bloqueVincular.style.display = 'block'; 
        
        // Cargar Clientes en el Select
        const select = document.getElementById('finClienteSelect');
        select.innerHTML = '<option value="">-- Ninguno / Ingreso General --</option>';
        
        // Usamos la variable global 'clientesCache' que viene de clientes.js/config.js
        if(typeof clientesCache !== 'undefined' && clientesCache.length > 0) {
            clientesCache.forEach(c => {
                select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
            });
        }
    } else {
        titulo.innerText = 'Registrar Gasto Operativo';
        titulo.style.color = '#c62828';
        if(bloqueVincular) bloqueVincular.style.display = 'none'; 
    }
    
    // Poner fecha de hoy
    const fechaInput = document.getElementById('finFecha');
    if(fechaInput) fechaInput.valueAsDate = new Date();
}

// --- DETECTAR CLIENTE PARA BUSCAR DEUDAS ---
async function cargarDeudasClienteFinanzas() {
    const clienteId = document.getElementById('finClienteSelect').value;
    const divDeudas = document.getElementById('bloqueDeudaPendiente');
    const selectDeudas = document.getElementById('finDeudaSelect');
    
    // Resetear formulario
    const inputId = document.getElementById('finIdMovimientoExistente');
    if(inputId) inputId.value = "";
    document.getElementById('finDesc').value = "";
    document.getElementById('finMonto').value = "";

    if(!clienteId) {
        divDeudas.style.display = 'none';
        return;
    }

    // Buscar Deudas PENDIENTES
    try {
        const { data: deudas, error } = await clienteSupabase
            .from('finanzas_movimientos')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('estado', 'PENDIENTE')
            .eq('tipo', 'INGRESO');

        if(error) throw error;

        deudasClienteCache = deudas || [];

        if(deudasClienteCache.length > 0) {
            divDeudas.style.display = 'block';
            selectDeudas.innerHTML = '<option value="">-- Selecciona qué deuda paga --</option>';
            selectDeudas.innerHTML += '<option value="NUEVO">✨ Es un ingreso nuevo (No listado)</option>';
            
            deudasClienteCache.forEach(d => {
                const valorFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(d.monto_esperado);
                selectDeudas.innerHTML += `<option value="${d.id}">${d.descripcion} (${valorFmt})</option>`;
            });
        } else {
            divDeudas.style.display = 'none';
            // Autocompletar descripción si es cliente sin deuda
            if(typeof clientesCache !== 'undefined') {
                const cliente = clientesCache.find(c => c.id == clienteId);
                if(cliente) document.getElementById('finDesc').value = "Ingreso Adicional - " + cliente.nombre;
            }
        }
    } catch (err) {
        console.error("Error buscando deudas:", err);
    }
}

// --- SELECCIONAR DEUDA ESPECÍFICA ---
function seleccionarDeudaExistente() {
    const deudaId = document.getElementById('finDeudaSelect').value;
    
    if(deudaId && deudaId !== 'NUEVO') {
        const deuda = deudasClienteCache.find(d => d.id == deudaId);
        if(deuda) {
            document.getElementById('finIdMovimientoExistente').value = deuda.id;
            document.getElementById('finDesc').value = deuda.descripcion;
            document.getElementById('finMonto').value = deuda.monto_esperado;
            document.getElementById('finEstado').value = 'PAGADO';
        }
    } else {
        document.getElementById('finIdMovimientoExistente').value = "";
        document.getElementById('finMonto').value = "";
        
        const clienteId = document.getElementById('finClienteSelect').value;
        if(typeof clientesCache !== 'undefined') {
            const cliente = clientesCache.find(c => c.id == clienteId);
            if(cliente) document.getElementById('finDesc').value = "Ingreso Extra - " + cliente.nombre;
        }
    }
}

// --- GUARDAR TRANSACCIÓN ---
const formTransaccion = document.getElementById('formTransaccion');
if(formTransaccion) {
    formTransaccion.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.querySelector('#formTransaccion button[type="submit"]');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = 'Guardando...'; btn.disabled = true;

        try {
            const idExistente = document.getElementById('finIdMovimientoExistente').value;
            const tipo = document.getElementById('finTipo').value;
            const monto = parseFloat(document.getElementById('finMonto').value);
            const estado = document.getElementById('finEstado').value;
            const fecha = document.getElementById('finFecha').value;
            const clienteId = document.getElementById('finClienteSelect').value || null;
            
            const fechaPagoReal = (estado === 'PAGADO') ? fecha : null;

            if (idExistente) {
                // UPDATE (Pagar deuda)
                const { error } = await clienteSupabase
                    .from('finanzas_movimientos')
                    .update({
                        monto_real: monto,
                        fecha_pago_real: fechaPagoReal,
                        estado: estado,
                        descripcion: document.getElementById('finDesc').value
                    })
                    .eq('id', idExistente);
                if (error) throw error;
            } else {
                // INSERT (Nuevo)
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
                        cliente_id: clienteId,
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
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    });
}

// --- CARGAR DASHBOARD (GRÁFICOS Y TABLA) ---
async function cargarFinanzas() {
    const filtroAnio = document.getElementById('filtroAnioFinanzas');
    if(!filtroAnio) return;
    
    const anio = filtroAnio.value;
    const fechaInicio = `${anio}-01-01`;
    const fechaFin = `${anio}-12-31`;

    // Indicador visual de carga
    const timeline = document.getElementById('timelineFinanciero');
    if(timeline) timeline.innerHTML = '<div style="text-align:center; width:100%; color:#999; padding-top:20px;">Cargando datos...</div>';

    try {
        const { data: movimientos, error } = await clienteSupabase
            .from('finanzas_movimientos')
            .select('*')
            .gte('fecha_vencimiento', fechaInicio)
            .lte('fecha_vencimiento', fechaFin)
            .order('fecha_vencimiento', { ascending: true });

        if(error) throw error;

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
        
        // Llenar Tabla
        const tbody = document.getElementById('tablaMovimientosBody');
        if(tbody) {
            tbody.innerHTML = '';
            // Mostrar los últimos 15 movimientos
            const ultimosMovimientos = [...movimientos].reverse().slice(0, 15);
            
            if(ultimosMovimientos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay movimientos este año.</td></tr>';
            } else {
                ultimosMovimientos.forEach(m => {
                    let colorEstado = m.estado === 'PAGADO' ? '#2e7d32' : '#f57c00';
                    let signo = m.tipo === 'GASTO' ? '-' : '+';
                    let colorMonto = m.tipo === 'GASTO' ? '#c62828' : '#2e7d32';

                    tbody.innerHTML += `
                        <tr>
                            <td>${m.fecha_vencimiento}</td>
                            <td><span class="status" style="background:${m.tipo==='INGRESO'?'#e8f5e9':'#ffebee'}; color:${colorMonto}; font-size:10px;">${m.tipo}</span></td>
                            <td>${m.descripcion}</td>
                            <td><span style="color:${colorEstado}; font-weight:bold; font-size:11px;">${m.estado}</span></td>
                            <td style="color:${colorMonto}; font-weight:bold;">${signo} ${fmt(m.monto_esperado)}</td>
                        </tr>
                    `;
                });
            }
        }

    } catch (err) {
        console.error("Error cargando finanzas:", err);
        if(timeline) timeline.innerHTML = '<div style="color:red; text-align:center;">Error de conexión.</div>';
    }
}

// --- DIBUJAR BARRAS (TIMELINE) ---
function renderizarTimeline(movimientos, fmt) {
    const contenedor = document.getElementById('timelineFinanciero');
    if(!contenedor) return;
    
    contenedor.innerHTML = '';

    // Agrupar por mes (0-11)
    const meses = Array(12).fill(null).map(() => ({ ingreso: 0, gasto: 0, cartera: 0 }));
    
    movimientos.forEach(m => {
        const fechaRef = m.estado === 'PAGADO' && m.fecha_pago_real ? m.fecha_pago_real : m.fecha_vencimiento;
        // Asegurar que la fecha sea válida para obtener el mes
        const fechaObj = new Date(fechaRef);
        // Ajuste por zona horaria simple (tomar la parte T00:00:00 puede dar el dia anterior)
        // Mejor usamos getUTCMonth si las fechas vienen YYYY-MM-DD
        const mesIndex = fechaObj.getMonth(); 
        
        if (mesIndex >= 0 && mesIndex <= 11) {
            if(m.tipo === 'GASTO' && m.estado === 'PAGADO') {
                meses[mesIndex].gasto += m.monto_real;
            } else if (m.tipo === 'INGRESO') {
                if(m.estado === 'PAGADO') meses[mesIndex].ingreso += m.monto_real;
                else meses[mesIndex].cartera += m.monto_esperado;
            }
        }
    });

    const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    // Calcular máximo para escala
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
