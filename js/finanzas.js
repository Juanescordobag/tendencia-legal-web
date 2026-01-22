// ==========================================
// 5. MÓDULO FINANCIERO (VERSIÓN COMPATIBLE CON TU HTML)
// ==========================================

function abrirModalTransaccion(tipo) {
    const modal = document.getElementById('modalTransaccion');
    if(!modal) return;

    modal.style.display = 'flex';
    document.getElementById('formTransaccion').reset();
    document.getElementById('finTipo').value = tipo;
    
    // Configurar Títulos y Colores
    const titulo = document.getElementById('tituloModalFinanzas');
    // Aseguramos que el título exista antes de cambiarlo
    if (titulo) {
        if(tipo === 'INGRESO') {
            titulo.innerText = 'Registrar Ingreso / Cuenta de Cobro';
            titulo.style.color = '#2e7d32';
        } else {
            titulo.innerText = 'Registrar Gasto Operativo';
            titulo.style.color = '#c62828';
        }
    }
    
    // Poner fecha de hoy por defecto
    const fechaInput = document.getElementById('finFecha');
    if(fechaInput) fechaInput.valueAsDate = new Date();
}

// GUARDAR TRANSACCIÓN
const formTransaccion = document.getElementById('formTransaccion');
if(formTransaccion) {
    formTransaccion.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.querySelector('#formTransaccion button[type="submit"]');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = 'Guardando...'; btn.disabled = true;

        try {
            // Verificar que usuarioActual exista (viene de config.js)
            if (!usuarioActual || !usuarioActual.id) {
                throw new Error("No se ha cargado la sesión del usuario. Intenta recargar la página.");
            }

            const tipo = document.getElementById('finTipo').value;
            const monto = parseFloat(document.getElementById('finMonto').value);
            const estado = document.getElementById('finEstado').value;
            const fecha = document.getElementById('finFecha').value;
            const descripcion = document.getElementById('finDesc').value;
            
            // Lógica: Si está PAGADO, la fecha real es la ingresada. Si es PENDIENTE, es null.
            const fechaPagoReal = (estado === 'PAGADO') ? fecha : null;

            const { error } = await clienteSupabase
                .from('finanzas_movimientos')
                .insert([{
                    tipo: tipo,
                    descripcion: descripcion,
                    monto_esperado: monto,
                    monto_real: (estado === 'PAGADO') ? monto : 0, 
                    fecha_vencimiento: fecha,
                    fecha_pago_real: fechaPagoReal,
                    estado: estado,
                    categoria: (tipo === 'INGRESO') ? 'Honorarios' : 'Gastos Generales',
                    user_id: usuarioActual.id
                }]);

            if (error) throw error;

            alert("Movimiento registrado correctamente.");
            document.getElementById('modalTransaccion').style.display = 'none';
            cargarFinanzas(); // Recargar el tablero

        } catch(err) {
            alert("Error: " + err.message);
        } finally {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    });
}

// CARGAR DASHBOARD FINANCIERO
async function cargarFinanzas() {
    const filtroAnio = document.getElementById('filtroAnioFinanzas');
    // Si no estamos en la vista correcta, salimos para no causar errores
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

        // Formato Moneda COP
        const fmt = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

        // Actualizar Tarjetas KPI (verificando que existan)
        const elIngresos = document.getElementById('kpiIngresos');
        const elGastos = document.getElementById('kpiGastos');
        const elCartera = document.getElementById('kpiCartera');

        if(elIngresos) elIngresos.innerText = fmt(totalIngresosReales);
        if(elGastos) elGastos.innerText = fmt(totalGastos);
        if(elCartera) elCartera.innerText = fmt(totalCartera);

        // Renderizar Gráfico
        renderizarTimeline(movimientos, fmt);
        
        // Llenar Tabla
        const tbody = document.getElementById('tablaMovimientosBody');
        if(tbody) {
            tbody.innerHTML = '';
            // Mostrar los últimos 15 movimientos, invirtiendo el orden para ver los más nuevos arriba
            const ultimosMovimientos = [...movimientos].reverse().slice(0, 15);
            
            if(ultimosMovimientos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">No hay movimientos registrados este año.</td></tr>';
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

// Función auxiliar para dibujar las barras
function renderizarTimeline(movimientos, fmt) {
    const contenedor = document.getElementById('timelineFinanciero');
    if(!contenedor) return;
    
    contenedor.innerHTML = '';

    // Inicializar los 12 meses en 0
    const meses = Array(12).fill(null).map(() => ({ ingreso: 0, gasto: 0, cartera: 0 }));
    
    movimientos.forEach(m => {
        // Usamos la fecha para saber en qué mes cae (evitando líos de zona horaria)
        const fechaPartes = m.fecha_vencimiento.split('-'); 
        // split crea ['2026', '01', '15'], el mes es el índice 1. Restamos 1 porque JS cuenta meses de 0 a 11.
        const mesIndex = parseInt(fechaPartes[1]) - 1;
        
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
    
    // Encontrar el valor más alto para calcular la escala de las barras
    let maxValor = 0;
    meses.forEach(m => {
        if((m.ingreso + m.cartera) > maxValor) maxValor = m.ingreso + m.cartera;
        if(m.gasto > maxValor) maxValor = m.gasto;
    });
    if(maxValor === 0) maxValor = 1; // Evitar división por cero

    meses.forEach((m, i) => {
        // Alturas relativas (máximo 150px de alto)
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
