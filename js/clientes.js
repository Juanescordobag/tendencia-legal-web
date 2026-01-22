// ==========================================
// 2. GESTIÓN DE CLIENTES Y DASHBOARD
// ==========================================
let clienteEnEdicionId = null;

function cambiarTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if(event) event.currentTarget.classList.add('active');
}

function toggleCuotaLitis() {
    const modalidad = document.getElementById('cobroModalidad').value;
    const divPorcentaje = document.getElementById('divPorcentajeExito');
    if (modalidad === 'CuotaLitis' || modalidad === 'Mixto') {
        divPorcentaje.style.display = 'block';
    } else {
        divPorcentaje.style.display = 'none';
        document.getElementById('porcentajeExito').value = '';
    }
}

function agregarCuota() {
    const tbody = document.getElementById('listaCuotas');
    const idUnico = Date.now();
    const fila = document.createElement('tr');
    fila.id = `fila-${idUnico}`;
    fila.innerHTML = `
        <td><input type="text" placeholder="Ej: Anticipo" class="input-tabla" style="width:100%; border:none;"></td>
        <td><input type="date" class="input-tabla" style="width:100%; border:none;"></td>
        <td><input type="number" placeholder="$" class="input-tabla" style="width:100%; border:none;"></td>
        <td style="text-align:center;"><i class="fas fa-trash btn-delete" style="cursor:pointer;" onclick="document.getElementById('fila-${idUnico}').remove()"></i></td>
    `;
    tbody.appendChild(fila);
}

function abrirModalCliente() {
    clienteEnEdicionId = null;
    document.getElementById('modalCliente').style.display = 'flex';
    cambiarTab('tab-cliente');
    document.getElementById('formCliente').reset();
    document.getElementById('listaCuotas').innerHTML = '';
    const footerModal = document.querySelector('.modal-footer-btns');
    if(footerModal) {
        footerModal.innerHTML = `<button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cancelar</button><button type="submit" class="btn-action"><i class="fas fa-save"></i> Crear Expediente</button>`;
    }
    document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea').forEach(input => input.disabled = false);
    agregarCuota(); 
}

function cerrarModalCliente() {
    document.getElementById('modalCliente').style.display = 'none';
    document.getElementById('formCliente').reset();
    document.getElementById('listaCuotas').innerHTML = '';
    borrarArchivo('inputContrato', 'displayContrato');
}

function verCliente(id) {
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    // Llenar datos
    document.getElementById('clienteTipo').value = cliente.tipo_persona;
    document.getElementById('clienteId').value = cliente.identificacion;
    document.getElementById('clienteNombre').value = cliente.nombre;
    document.getElementById('clienteTelefono').value = cliente.telefono;
    document.getElementById('clienteEmail').value = cliente.email;
    document.getElementById('clienteDireccion').value = cliente.direccion || '';
    document.getElementById('servicioTipo').value = cliente.servicio;
    document.getElementById('fechaInicio').value = cliente.fecha_inicio;
    document.getElementById('contraparteNombre').value = cliente.contraparte || '';
    document.getElementById('casoDescripcion').value = cliente.descripcion || '';
    document.getElementById('cobroModalidad').value = cliente.modalidad_pago;
    document.getElementById('valorTotal').value = cliente.valor_total;
    document.getElementById('impuestoIva').value = cliente.impuesto;
    document.getElementById('porcentajeExito').value = cliente.porcentaje_exito || '';

    // Cuotas
    const tbody = document.getElementById('listaCuotas');
    tbody.innerHTML = '';
    if (cliente.plan_pagos) {
        cliente.plan_pagos.forEach(cuota => {
            const fila = document.createElement('tr');
            fila.innerHTML = `<td><input type="text" value="${cuota.concepto}" class="input-tabla" disabled></td><td><input type="date" value="${cuota.fecha}" class="input-tabla" disabled></td><td><input type="number" value="${cuota.valor}" class="input-tabla" disabled></td><td></td>`;
            tbody.appendChild(fila);
        });
    }

    clienteEnEdicionId = id;
    document.getElementById('modalCliente').style.display = 'flex';
    cambiarTab('tab-cliente');
    toggleCuotaLitis();
    document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea, #btnAgregarCuota').forEach(input => input.disabled = true);

    const footerModal = document.querySelector('.modal-footer-btns');
    if(footerModal) {
        footerModal.innerHTML = `<button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cerrar</button><button type="button" class="btn-action" style="background: #B68656;" onclick="activarEdicion()"><i class="fas fa-edit"></i> Modificar</button>`;
    }
}

function activarEdicion() {
    document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea, #btnAgregarCuota').forEach(input => input.disabled = false);
    const footerModal = document.querySelector('.modal-footer-btns');
    footerModal.innerHTML = `<button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cancelar</button><button type="submit" class="btn-action" id="btnGuardarCliente"><i class="fas fa-save"></i> Guardar Cambios</button>`;
    alert("Modo edición activado.");
}

function nuevoCasoParaCliente(id) {
    const clienteOrigen = clientesCache.find(c => c.id === id);
    if (!clienteOrigen) return;
    abrirModalCliente(); 
    document.getElementById('clienteTipo').value = clienteOrigen.tipo_persona;
    document.getElementById('clienteId').value = clienteOrigen.identificacion;
    document.getElementById('clienteNombre').value = clienteOrigen.nombre;
    document.getElementById('clienteTelefono').value = clienteOrigen.telefono;
    document.getElementById('clienteEmail').value = clienteOrigen.email;
    document.getElementById('clienteDireccion').value = clienteOrigen.direccion || '';
    clienteEnEdicionId = null; 
    cambiarTab('tab-asunto');
    alert(`Datos copiados de "${clienteOrigen.nombre}". Ingresa los detalles del nuevo caso.`);
}

// --- GUARDAR CLIENTE ---
const formCliente = document.getElementById('formCliente');
if(formCliente) {
    formCliente.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.querySelector('#formCliente button[type="submit"]');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const cuotas = [];
            document.querySelectorAll('#listaCuotas tr').forEach(fila => {
                const inputs = fila.querySelectorAll('input');
                if(inputs[0].value) cuotas.push({ concepto: inputs[0].value, fecha: inputs[1].value, valor: inputs[2].value, estado: 'Pendiente' });
            });

            const datosCliente = {
                tipo_persona: document.getElementById('clienteTipo').value,
                identificacion: document.getElementById('clienteId').value,
                nombre: document.getElementById('clienteNombre').value,
                telefono: document.getElementById('clienteTelefono').value,
                email: document.getElementById('clienteEmail').value,
                direccion: document.getElementById('clienteDireccion').value,
                servicio: document.getElementById('servicioTipo').value,
                fecha_inicio: document.getElementById('fechaInicio').value,
                contraparte: document.getElementById('contraparteNombre').value,
                descripcion: document.getElementById('casoDescripcion').value,
                modalidad_pago: document.getElementById('cobroModalidad').value,
                valor_total: document.getElementById('valorTotal').value || 0,
                impuesto: document.getElementById('impuestoIva').value,
                porcentaje_exito: document.getElementById('porcentajeExito').value || 0,
                plan_pagos: cuotas,
                contrato_url: document.getElementById('nombreContrato').innerText,
                user_id: usuarioActual.id
            };

            if (clienteEnEdicionId) {
                // UPDATE
                const { error } = await clienteSupabase.from('clientes').update(datosCliente).eq('id', clienteEnEdicionId);
                if (error) throw error;
                // Sincronizar Finanzas
                if (datosCliente.valor_total > 0) {
                    await clienteSupabase.from('finanzas_movimientos').update({ 
                        monto_esperado: datosCliente.valor_total, fecha_vencimiento: datosCliente.fecha_inicio
                    }).eq('cliente_id', clienteEnEdicionId).eq('estado', 'PENDIENTE').eq('tipo', 'INGRESO');
                }
                alert("Cliente actualizado.");
            } else {
                // INSERT
                const { data: clientesCreados, error } = await clienteSupabase.from('clientes').insert([datosCliente]).select(); 
                if (error) throw error;
                // Finanzas Automáticas
                const nuevoCliente = clientesCreados[0]; 
                if (nuevoCliente.valor_total > 0) {
                    await clienteSupabase.from('finanzas_movimientos').insert([{
                        cliente_id: nuevoCliente.id, user_id: usuarioActual.id, tipo: 'INGRESO', categoria: 'Honorarios',
                        descripcion: 'Contrato Inicial: ' + nuevoCliente.nombre, monto_esperado: nuevoCliente.valor_total,
                        monto_real: 0, fecha_vencimiento: nuevoCliente.fecha_inicio, estado: 'PENDIENTE'
                    }]);
                }
                alert("Cliente creado exitosamente.");
            }
            cerrarModalCliente();
            cargarClientesDesdeNube();
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
        } finally {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    });
}

// --- CARGAR DATOS ---
async function cargarClientesDesdeNube() {
    try {
        const { data: clientes, error } = await clienteSupabase.from('clientes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        clientesCache = clientes || [];
        actualizarDashboard(clientesCache);
        renderizarTablaClientes(clientesCache);
    } catch (err) {
        console.error(err);
    }
}

function renderizarTablaClientes(lista) {
    const tbody = document.getElementById('tablaClientesBody');
    if (!tbody) return;
    if (lista.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No se encontraron coincidencias.</td></tr>'; return; }
    tbody.innerHTML = '';
    lista.forEach(c => {
        let textoIva = c.impuesto === 'MasIVA' ? '(+ IVA)' : (c.impuesto === 'Incluido' ? '(Inc.)' : '');
        let iconoServicio = c.servicio === 'Demandante' ? '⚖️' : (c.servicio === 'Demandado' ? '🛡️' : '📁');
        
        tbody.innerHTML += `
            <tr>
                <td><b>${c.nombre}</b><br><small>${iconoServicio} ${c.servicio}</small></td>
                <td>${c.identificacion || 'N/A'}</td>
                <td>${c.telefono || ''}<br><small>${c.email || ''}</small></td>
                <td><span class="status active">${c.modalidad_pago}</span><br><b>$ ${Number(c.valor_total).toLocaleString()}</b> <small>${textoIva}</small></td>
                <td>
                    <button class="btn-icon" onclick="verCliente(${c.id})"><i class="fas fa-eye" style="color:#162F45;"></i></button>
                    <button class="btn-icon" onclick="nuevoCasoParaCliente(${c.id})"><i class="fas fa-folder-plus" style="color:#B68656;"></i></button>
                    <button class="btn-icon btn-delete" onclick="borrarClienteNube(${c.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function filtrarClientes() {
    const texto = document.getElementById('buscadorCliente').value.toLowerCase();
    const filtrados = clientesCache.filter(c => (c.nombre||'').toLowerCase().includes(texto) || (c.identificacion||'').includes(texto));
    renderizarTablaClientes(filtrados);
}

async function borrarClienteNube(id) {
    if(!confirm("¿Eliminar expediente permanentemente?")) return;
    const { error } = await clienteSupabase.from('clientes').delete().eq('id', id);
    if(error) alert("Error: " + error.message);
    else { alert("Eliminado."); cargarClientesDesdeNube(); }
}

function actualizarDashboard(clientes) {
    if(!document.getElementById('kpi-casos')) return;
    document.getElementById('kpi-casos').innerText = clientes.length;
    
    const mesActual = new Date().getMonth();
    const nuevos = clientes.filter(c => new Date(c.created_at).getMonth() === mesActual);
    document.getElementById('kpi-nuevos').innerText = new Set(nuevos.map(c => c.identificacion)).size;
    
    const total = clientes.reduce((sum, c) => sum + Number(c.valor_total || 0), 0);
    document.getElementById('kpi-facturacion').innerText = "$ " + (total / 1000000).toFixed(1) + "M";
    
    let pendientes = 0;
    clientes.forEach(c => { if(c.plan_pagos) pendientes += c.plan_pagos.filter(p => p.estado === 'Pendiente').length; });
    document.getElementById('kpi-pendientes').innerText = pendientes;

    const tbody = document.getElementById('tablaMovimientosBody');
    if(tbody) {
        tbody.innerHTML = "";
        clientes.slice(0, 5).forEach(c => {
            tbody.innerHTML += `<tr><td>${new Date(c.created_at).toLocaleDateString()}</td><td>${c.nombre}</td><td>${c.servicio}</td><td><span class="status active">Activo</span></td></tr>`;
        });
    }
}

// --- IMPORTAR EXCEL ---
async function procesarExcelMasivo() {
    const input = document.getElementById('inputExcelMasivo');
    if (!input.files[0]) return;
    if (!confirm("¿Importar clientes desde Excel?")) { input.value = ''; return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const jsonDatos = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonDatos.length === 0) { alert("Archivo vacío."); return; }

            const clientesParaInsertar = jsonDatos.map(fila => {
                const getVal = (keys) => { for (let key of keys) if (fila[key] !== undefined) return fila[key]; return null; };
                return {
                    user_id: usuarioActual.id,
                    nombre: getVal(['Nombre','nombre']) || 'Sin Nombre',
                    identificacion: getVal(['Cedula','NIT']) || '000',
                    telefono: getVal(['Telefono']) || 0,
                    email: getVal(['Correo']) || 'sin@correo.com',
                    tipo_persona: 'Natural', servicio: 'Consultoria',
                    fecha_inicio: new Date().toISOString().split('T')[0],
                    modalidad_pago: 'Fijo', valor_total: 0, impuesto: 'NoAplica', estado_pago: 'Pendiente'
                };
            });

            const { error } = await clienteSupabase.from('clientes').insert(clientesParaInsertar);
            if (error) throw error;
            alert(`¡Éxito! Importados ${clientesParaInsertar.length} clientes.`);
            cargarClientesDesdeNube();
        } catch (err) { alert("Error al importar: " + err.message); } finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(input.files[0]);
}
