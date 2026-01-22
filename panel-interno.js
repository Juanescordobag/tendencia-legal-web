// ==========================================
// 1. CONFIGURACIÓN E INICIO
// ==========================================
const supabaseUrl = 'https://gpwrnhynvyerranktstf.supabase.co';
const supabaseKey = 'sb_publishable_XsLhiovLphmecmnjHAmYDQ_MEIaARRZ'; 
const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

let usuarioActual = null;
let rolActual = null;

// Variables globales de estado
let clienteEnEdicionId = null; 
let clientesCache = []; // Almacena temporalmente los clientes descargados para verlos rápido
let procesosCache = []; // Memoria temporal para procesos

// Variables globales para archivos
let archivoImagen = null;
let archivoDocumento = null;
let archivoContrato = null; 

// INICIAR SISTEMA
async function iniciarSistema() {
    // 1. Verificar Sesión
    const { data: { session } } = await clienteSupabase.auth.getSession();
    
    if (!session) {
        window.location.href = "login.html"; 
        return;
    }

    usuarioActual = session.user;
    
    // 2. Verificar Rol
    const { data: perfil } = await clienteSupabase
        .from('perfiles')
        .select('*')
        .eq('id', usuarioActual.id)
        .single();

    if (perfil) {
        rolActual = perfil.rol;
        document.getElementById('nombreUsuarioDisplay').innerText = perfil.nombre || usuarioActual.email;
        
        // Mostrar menús de admin
        if (rolActual === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
        }
    } else {
        document.getElementById('nombreUsuarioDisplay').innerText = usuarioActual.email;
    }

    // 3. Cargar datos iniciales (Dashboard o Clientes)
    cargarClientesDesdeNube(); 
}

iniciarSistema();

// LOGOUT
async function cerrarSesion() {
    await clienteSupabase.auth.signOut();
    window.location.href = "login.html";
}

// NAVEGACIÓN
function showSection(sectionId, element) {
    // Protección de rutas
    if ((sectionId === 'gestion-noticias' || sectionId === 'usuarios-sistema') && rolActual !== 'admin') {
        alert("Acceso denegado: Se requieren permisos de Socio Administrador.");
        return;
    }

    // Título Dinámico
    const titulos = {
        'dashboard': 'Resumen Ejecutivo',
        'clientes': 'Gestión de Clientes',
        'procesos': 'Expedientes y Casos',
        'agenda': 'Agenda Judicial',
        'finanzas': 'Departamento Financiero',
        'gestion-noticias': 'Publicación de Noticias',
        'usuarios-sistema': 'Control de Usuarios'
    };
    const tituloElement = document.getElementById('page-title');
    if(tituloElement && titulos[sectionId]) {
        tituloElement.innerText = titulos[sectionId];
    }

    // Cambio de vista
    document.querySelectorAll('.section-view').forEach(sec => sec.classList.remove('active-view'));
    document.getElementById(sectionId).classList.add('active-view');
    
    // Cambio de clase activa en menú
    if (element) {
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
    }

    // Cargas dinámicas según sección
    if(sectionId === 'usuarios-sistema') cargarUsuarios();
    if(sectionId === 'gestion-noticias') cargarNoticiasDesdeNube();
    if(sectionId === 'clientes' || sectionId === 'dashboard') cargarClientesDesdeNube();
    if(sectionId === 'procesos') cargarProcesos();
    if(sectionId === 'agenda') cargarAgenda();
    if(sectionId === 'finanzas') cargarFinanzas();
}


// ==========================================
// 2. GESTIÓN DE CLIENTES (CONECTADO A SUPABASE)
// ==========================================

// --- A. Lógica de Pestañas (Tabs) ---
function cambiarTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if(event) event.currentTarget.classList.add('active');
}

// --- B. Lógica Financiera ---
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
        <td style="text-align:center;"><i class="fas fa-trash btn-delete" style="cursor:pointer;" onclick="eliminarFilaCuota('${idUnico}')"></i></td>
    `;
    tbody.appendChild(fila);
}

function eliminarFilaCuota(id) {
    document.getElementById(`fila-${id}`).remove();
}

// --- C. Funciones del Modal ---
function abrirModalCliente() {
    clienteEnEdicionId = null;
    document.getElementById('modalCliente').style.display = 'flex';
    cambiarTab('tab-cliente');
    document.getElementById('formCliente').reset();
    document.getElementById('listaCuotas').innerHTML = '';
    
    // Restaurar botones de creación
    const footerModal = document.querySelector('.modal-footer-btns');
    if(footerModal) {
        footerModal.innerHTML = `
            <button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cancelar</button>
            <button type="submit" class="btn-action"><i class="fas fa-save"></i> Crear Expediente</button>
        `;
    }
    
    // Desbloquear inputs
    const inputs = document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea');
    inputs.forEach(input => input.disabled = false);
    
    agregarCuota(); // Una cuota vacía por defecto
}

function verCliente(id) {
    // Buscar en la caché local (lo que bajamos de la nube)
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    // Llenar formulario (Mapeo: Base de datos -> Inputs HTML)
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

    // Llenar tabla de cuotas (desde JSON)
    const tbody = document.getElementById('listaCuotas');
    tbody.innerHTML = '';
    if (cliente.plan_pagos) {
        cliente.plan_pagos.forEach(cuota => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td><input type="text" value="${cuota.concepto}" class="input-tabla" style="width:100%; border:none;" disabled></td>
                <td><input type="date" value="${cuota.fecha}" class="input-tabla" style="width:100%; border:none;" disabled></td>
                <td><input type="number" value="${cuota.valor}" class="input-tabla" style="width:100%; border:none;" disabled></td>
                <td style="text-align:center;"></td>
            `;
            tbody.appendChild(fila);
        });
    }

    // Configurar Modal en MODO LECTURA
    clienteEnEdicionId = id;
    document.getElementById('modalCliente').style.display = 'flex';
    cambiarTab('tab-cliente');
    toggleCuotaLitis();

    // Bloquear inputs
    const inputs = document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea, #btnAgregarCuota');
    inputs.forEach(input => input.disabled = true);

    // Botones Ver/Modificar
    const footerModal = document.querySelector('.modal-footer-btns');
    if(footerModal) {
        footerModal.innerHTML = `
            <button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cerrar</button>
            <button type="button" class="btn-action" style="background: #B68656;" onclick="activarEdicion()">
                <i class="fas fa-edit"></i> Modificar
            </button>
        `;
    }
}
// --- Función: Crear NUEVO CASO reciclando datos del cliente ---
function nuevoCasoParaCliente(id) {
    // 1. Buscar los datos del cliente original
    const clienteOrigen = clientesCache.find(c => c.id === id);
    if (!clienteOrigen) return;

    // 2. Abrir el modal como si fuera nuevo (limpio)
    abrirModalCliente(); 

    // 3. PRE-LLENAR solo la Pestaña 1 (Datos Personales)
    document.getElementById('clienteTipo').value = clienteOrigen.tipo_persona;
    document.getElementById('clienteId').value = clienteOrigen.identificacion;
    document.getElementById('clienteNombre').value = clienteOrigen.nombre;
    document.getElementById('clienteTelefono').value = clienteOrigen.telefono;
    document.getElementById('clienteEmail').value = clienteOrigen.email;
    document.getElementById('clienteDireccion').value = clienteOrigen.direccion || '';

    // 4. Asegurarnos que el sistema sepa que es un registro NUEVO (no una edición)
    clienteEnEdicionId = null; 

    // 5. Movernos visualmente a la pestaña 2 para que el abogado empiece ahí
    cambiarTab('tab-asunto');
    
    alert(`Se han copiado los datos de "${clienteOrigen.nombre}".\nPor favor ingresa los detalles del nuevo proceso legal.`);
}
function activarEdicion() {
    const inputs = document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea, #btnAgregarCuota');
    inputs.forEach(input => input.disabled = false);

    const footerModal = document.querySelector('.modal-footer-btns');
    footerModal.innerHTML = `
        <button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cancelar</button>
        <button type="submit" class="btn-action" id="btnGuardarCliente">
            <i class="fas fa-save"></i> Guardar Cambios
        </button>
    `;
    alert("Modo edición activado.");
}

function cerrarModalCliente() {
    document.getElementById('modalCliente').style.display = 'none';
    document.getElementById('formCliente').reset();
    document.getElementById('listaCuotas').innerHTML = '';
    borrarArchivo('inputContrato', 'displayContrato');
}

// --- D. Guardar Cliente (CREATE / UPDATE en Supabase) ---
const formCliente = document.getElementById('formCliente');
if(formCliente) {
    formCliente.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Feedback visual de carga
        const btn = document.querySelector('#formCliente button[type="submit"]');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            // 1. Recopilar Plan de Pagos
            const cuotas = [];
            document.querySelectorAll('#listaCuotas tr').forEach(fila => {
                const inputs = fila.querySelectorAll('input');
                if(inputs[0].value) {
                    cuotas.push({
                        concepto: inputs[0].value,
                        fecha: inputs[1].value,
                        valor: inputs[2].value,
                        estado: 'Pendiente'
                    });
                }
            });

            // 2. Preparar objeto para SQL (Nombres en snake_case)
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
                // Nota: Por ahora guardamos el nombre del archivo como texto. 
                contrato_url: document.getElementById('nombreContrato').innerText,
                
                user_id: usuarioActual.id // ¡Importante! El dueño del registro
            };

            let errorOperacion = null;

            if (clienteEnEdicionId) {
                // UPDATE
                const { error } = await clienteSupabase
                    .from('clientes')
                    .update(datosCliente)
                    .eq('id', clienteEnEdicionId);
                errorOperacion = error;
            } else {
                // INSERT
                // 1. Guardar el Cliente y pedir que nos devuelva el ID (.select)
            const { data: clientesCreados, error } = await clienteSupabase
                .from('clientes')
                .insert([datosCliente])
                .select(); 

            if (error) throw error;

            // 2. AUTOMATIZACIÓN FINANCIERA
            const nuevoCliente = clientesCreados[0]; 

            if (nuevoCliente.valor_total > 0) {
                const { error: errorFinanza } = await clienteSupabase
                    .from('finanzas_movimientos')
                    .insert([{
                        cliente_id: nuevoCliente.id,
                        user_id: usuarioActual.id,
                        tipo: 'INGRESO',
                        categoria: 'Honorarios',
                        descripcion: 'Contrato Inicial: ' + nuevoCliente.nombre,
                        monto_esperado: nuevoCliente.valor_total,
                        monto_real: 0, 
                        fecha_vencimiento: nuevoCliente.fecha_inicio,
                        estado: 'PENDIENTE'
                    }]);
                
                if (errorFinanza) console.error("Error financiero:", errorFinanza);
            }

            alert("Cliente creado y vinculado a Finanzas correctamente.");
            cerrarModalCliente();
            cargarClientesDesdeNube(); // Recargar tabla
            }
            }
        } catch (err) {
            alert("Error al guardar: " + err.message);
            console.error(err);
        } finally {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    });
}

// --- E. Cargar Clientes (READ desde Supabase) ---
// --- NUEVA ESTRUCTURA PARA PODER BUSCAR ---

// 1. Función solo para DIBUJAR la tabla (recibe una lista)
function renderizarTablaClientes(lista) {
    const tbody = document.getElementById('tablaClientesBody');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888; padding: 20px;">No se encontraron coincidencias.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    lista.forEach(c => {
        // Lógica visual IVA
        let textoIva = '';
        if(c.impuesto === 'MasIVA') textoIva = '<span style="color:#c62828; font-size:10px; font-weight:bold;">(+ IVA)</span>';
        if(c.impuesto === 'Incluido') textoIva = '<span style="color:#2e7d32; font-size:10px; font-weight:bold;">(Inc.)</span>';

        // Icono servicio
        let iconoServicio = '<i class="fas fa-folder"></i>';
        if(c.servicio === 'Demandante') iconoServicio = '<i class="fas fa-gavel" style="color:#c62828;"></i>';
        if(c.servicio === 'Demandado') iconoServicio = '<i class="fas fa-shield-alt" style="color:#1565c0;"></i>';
        if(c.servicio === 'Tramite') iconoServicio = '<i class="fas fa-file-signature" style="color:#1565c0;"></i>';

        tbody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight:bold;">${c.nombre}</div>
                    <div style="font-size:11px; color:#666;">${iconoServicio} ${c.servicio}</div>
                </td>
                <td>${c.identificacion || 'N/A'}</td>
                <td>
                    <div>${c.telefono || ''}</div>
                    <div style="font-size:11px; color:#888;">${c.email || ''}</div>
                </td>
                <td>
                    <span class="status active">${c.modalidad_pago}</span>
                    <div style="font-size:13px; margin-top:2px; font-weight:bold;">
                        $ ${Number(c.valor_total).toLocaleString()} ${textoIva}
                    </div>
                </td>
                <td style="display: flex; gap: 5px; justify-content: center;">
                    <button class="btn-icon" onclick="verCliente(${c.id})" title="Ver Detalle">
                        <i class="fas fa-eye" style="color:#162F45;"></i>
                    </button>
                    
                    <button class="btn-icon" onclick="nuevoCasoParaCliente(${c.id})" title="Nuevo caso para este cliente">
                        <i class="fas fa-folder-plus" style="color:#B68656;"></i>
                    </button>
                
                    <button class="btn-icon btn-delete" onclick="borrarClienteNube(${c.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

// 2. Función Principal Modificada (Descarga y llama a dibujar)
async function cargarClientesDesdeNube() {
    try {
        const { data: clientes, error } = await clienteSupabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Guardamos TODOS los datos en memoria
        clientesCache = clientes || [];

        // Actualizamos Dashboard
        actualizarDashboard(clientesCache);

        // Dibujamos la tabla con TODOS los datos
        renderizarTablaClientes(clientesCache);

    } catch (err) {
        console.error("Error cargando clientes:", err);
    }
}

// 3. Función del Buscador (Se activa al escribir)
function filtrarClientes() {
    const texto = document.getElementById('buscadorCliente').value.toLowerCase();
    
    // Filtramos la memoria (clientesCache) sin ir a la nube
    const filtrados = clientesCache.filter(c => {
        const nombre = (c.nombre || '').toLowerCase();
        const cedula = (c.identificacion || '').toLowerCase();
        
        // Si el nombre O la cédula contienen el texto escrito
        return nombre.includes(texto) || cedula.includes(texto);
    });

    // Redibujamos la tabla solo con los filtrados
    renderizarTablaClientes(filtrados);
}

async function borrarClienteNube(id) {
    if(!confirm("¿Seguro que deseas eliminar este expediente PERMANENTEMENTE de la base de datos?")) return;
    
    try {
        const { error } = await clienteSupabase.from('clientes').delete().eq('id', id);
        if(error) throw error;
        alert("Expediente eliminado.");
        cargarClientesDesdeNube();
    } catch(err) {
        alert("Error al borrar: " + err.message);
    }
}

// --- F. Función Auxiliar: Actualizar Dashboard (MEJORADA) ---
function actualizarDashboard(clientes) {
    if(!document.getElementById('kpi-casos')) return;

    // 1. Casos Activos (Cuenta total de expedientes)
    document.getElementById('kpi-casos').innerText = clientes.length;

    // 2. Nuevos Clientes (Personas Únicas este mes)
    const mesActual = new Date().getMonth();
    
    // a. Filtramos los registros creados este mes
    const registrosMes = clientes.filter(c => {
        const fecha = new Date(c.created_at);
        return fecha.getMonth() === mesActual;
    });

    // b. Usamos "Set" para eliminar duplicados basados en la identificación (Cédula)
    // Así si Nancy tiene 3 casos este mes, solo cuenta como 1 cliente nuevo.
    const clientesUnicos = new Set(registrosMes.map(c => c.identificacion));
    
    document.getElementById('kpi-nuevos').innerText = clientesUnicos.size;

    // 3. Facturación Total
    const totalDinero = clientes.reduce((sum, c) => sum + Number(c.valor_total || 0), 0);
    document.getElementById('kpi-facturacion').innerText = "$ " + (totalDinero / 1000000).toFixed(1) + "M"; 

    // 4. Tareas (Cuotas Pendientes)
    let cuotasPendientes = 0;
    clientes.forEach(c => {
        if(c.plan_pagos && Array.isArray(c.plan_pagos)) {
            cuotasPendientes += c.plan_pagos.filter(p => p.estado === 'Pendiente').length;
        }
    });
    document.getElementById('kpi-pendientes').innerText = cuotasPendientes;

    // 5. Tabla Movimientos
    const tbody = document.getElementById('tablaMovimientosBody');
    if(tbody) {
        tbody.innerHTML = "";
        const ultimos = [...clientes].slice(0, 5); 
        ultimos.forEach(c => {
            const fecha = new Date(c.created_at).toLocaleDateString();
            tbody.innerHTML += `
                <tr>
                    <td>${fecha}</td>
                    <td>${c.nombre}</td>
                    <td>${c.servicio}</td>
                    <td><span class="status active">Activo</span></td>
                </tr>
            `;
        });
    }
}


// ==========================================
// 3. GESTIÓN DE USUARIOS (SUPABASE)
// ==========================================
// ... (Este bloque se mantiene igual, ya funciona bien) ...
const formUsuario = document.getElementById('formUsuario');
if(formUsuario){
    formUsuario.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btnCrearUsuario');
        btn.disabled = true; btn.innerHTML = "Creando...";

        try {
            const email = document.getElementById('nuevoEmail').value;
            const password = document.getElementById('nuevoPass').value;
            const { data: dataAuth, error: errorAuth } = await clienteSupabase.auth.signUp({ email, password });
            if (errorAuth) throw errorAuth;

            const { error: errorPerfil } = await clienteSupabase.from('perfiles').insert([{
                id: dataAuth.user.id,
                email: email,
                nombre: document.getElementById('nuevoNombre').value,
                rol: document.getElementById('nuevoRol').value
            }]);
            if (errorPerfil) throw errorPerfil;

            alert("Usuario creado correctamente.");
            formUsuario.reset();
            cargarUsuarios();
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            btn.disabled = false; btn.innerHTML = 'Registrar';
        }
    });
}

async function cargarUsuarios() {
    const tbody = document.getElementById('tablaUsuariosBody');
    if(!tbody) return;
    tbody.innerHTML = "<tr><td colspan='4'>Cargando...</td></tr>";
    const { data } = await clienteSupabase.from('perfiles').select('*');
    if (data) {
        tbody.innerHTML = "";
        data.forEach(u => {
            const esMio = u.id === usuarioActual.id;
            const btnBorrar = esMio ? '' : `<button class="btn-icon btn-delete" onclick="borrarUsuarioTotal('${u.id}')"><i class="fas fa-trash"></i></button>`;
            tbody.innerHTML += `<tr><td>${u.nombre}</td><td>${u.email}</td><td><span class="status role-${u.rol}">${u.rol}</span></td><td style="text-align:center;">${btnBorrar}</td></tr>`;
        });
    }
}

async function borrarUsuarioTotal(id) {
    if (!confirm("¿Eliminar usuario permanentemente?")) return;
    const { error } = await clienteSupabase.rpc('eliminar_usuario_total', { id_usuario: id });
    if (error) alert("Error: " + error.message);
    else { alert("Eliminado."); cargarUsuarios(); }
}


// ==========================================
// 4. GESTIÓN DE NOTICIAS (SUPABASE)
// ==========================================
function manejarArchivo(inputId, nombreSpanId, displayId) {
    const input = document.getElementById(inputId);
    if (input.files[0]) {
        document.getElementById(nombreSpanId).innerText = input.files[0].name;
        document.getElementById(displayId).style.display = 'inline-flex';
        if (inputId === 'inputImagen') archivoImagen = input.files[0];
        if (inputId === 'inputDoc') archivoDocumento = input.files[0];
        if (inputId === 'inputContrato') archivoContrato = input.files[0];
    }
}

function borrarArchivo(inputId, displayId) {
    document.getElementById(inputId).value = "";
    document.getElementById(displayId).style.display = 'none';
    if (inputId === 'inputImagen') archivoImagen = null;
    if (inputId === 'inputDoc') archivoDocumento = null;
    if (inputId === 'inputContrato') archivoContrato = null;
}

const formNoticia = document.getElementById('formNoticia');
if(formNoticia){
    formNoticia.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btnSubmitNoticia');
        btn.innerHTML = 'Publicando...'; btn.disabled = true;

        try {
            let urlImg = null, urlDoc = null;
            // Función interna para subir
            const subir = async (arch, carpeta) => {
                const name = `${carpeta}-${Date.now()}-${arch.name}`;
                const { error } = await clienteSupabase.storage.from('ARCHIVOS_TENDENCIA').upload(name, arch);
                if (error) throw error;
                return clienteSupabase.storage.from('ARCHIVOS_TENDENCIA').getPublicUrl(name).data.publicUrl;
            };

            if(archivoImagen) urlImg = await subir(archivoImagen, 'img');
            if(archivoDocumento) urlDoc = await subir(archivoDocumento, 'doc');

            const { error } = await clienteSupabase.from('noticias').insert([{
                titulo: document.getElementById('tituloNoticia').value,
                categoria: document.getElementById('categoriaNoticia').value,
                fecha: document.getElementById('fechaNoticia').value,
                resumen: document.getElementById('resumenNoticia').value,
                contenido: document.getElementById('contenidoNoticia').value,
                enlace: document.getElementById('linkNoticia').value,
                imagen_url: urlImg,
                archivo_url: urlDoc,
                nombre_archivo: archivoDocumento ? archivoDocumento.name : null
            }]);
            if(error) throw error;

            alert("Noticia publicada.");
            formNoticia.reset();
            borrarArchivo('inputImagen', 'displayImagen');
            borrarArchivo('inputDoc', 'displayDoc');
            cargarNoticiasDesdeNube();
        } catch(err) {
            alert("Error: " + err.message);
        } finally {
            btn.innerHTML = 'Publicar'; btn.disabled = false;
        }
    });
}

async function cargarNoticiasDesdeNube() {
    const tbody = document.getElementById('tablaNoticiasBody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    const { data } = await clienteSupabase.from('noticias').select('*').order('created_at', { ascending: false });
    if (data) {
        tbody.innerHTML = "";
        data.forEach(n => {
            tbody.innerHTML += `<tr><td>${n.fecha}</td><td>${n.titulo}</td><td>${n.categoria}</td><td><button class="btn-icon btn-delete" onclick="borrarNoticia(${n.id})"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }
}

async function borrarNoticia(id) {
    if(!confirm("¿Eliminar noticia?")) return;
    const { error } = await clienteSupabase.from('noticias').delete().eq('id', id);
    if (error) alert("Error: " + error.message);
    else { alert("Eliminado."); cargarNoticiasDesdeNube(); }
}
// ==========================================
// 5. GESTIÓN DE PROCESOS (LÓGICA UI)
// ==========================================

// Variables globales de procesos
let procesoEnEdicionId = null; 

// A. Abrir y Cerrar Modal
function abrirModalProceso() {
    procesoEnEdicionId = null;
    document.getElementById('modalProceso').style.display = 'flex';
    document.getElementById('formProceso').reset();
    
    // Por defecto mostrar campos judiciales
    toggleCamposProceso();
    
    // CARGAR CLIENTES EN EL SELECT
    const select = document.getElementById('procesoClienteId');
    select.innerHTML = '<option value="">Seleccione un cliente...</option>';
    
    // Usamos la caché de clientes que ya descargamos antes
    if(clientesCache.length > 0) {
        clientesCache.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nombre} - ${c.identificacion} (${c.servicio})</option>`;
        });
    } else {
        select.innerHTML = '<option value="">No hay clientes registrados</option>';
    }
}

function cerrarModalProceso() {
    document.getElementById('modalProceso').style.display = 'none';
}

// B. Alternar entre Judicial y Consultoría
// B. Alternar entre Judicial/Trámite y Consultoría
function toggleCamposProceso() {
    const tipo = document.getElementById('procesoTipo').value;
    const divJudicial = document.getElementById('camposJudiciales'); // Usaremos este mismo para Trámites
    const divConsultoria = document.getElementById('camposConsultoria');

    // SI ES JUDICIAL O TRÁMITE -> Muestra campos de radicado
    if (tipo === 'Judicial' || tipo === 'Tramite') {
        divJudicial.style.display = 'block';
        divConsultoria.style.display = 'none';
        
        // Pequeño truco visual: Cambiar el placeholder si es trámite
        if(tipo === 'Tramite') {
            document.getElementById('procesoJuzgado').placeholder = "Entidad / Notaría / Superintendencia...";
        } else {
            document.getElementById('procesoJuzgado').placeholder = "Juzgado 15 Laboral...";
        }

    } else {
        // SI ES CONSULTORÍA -> Muestra solo fecha
        divJudicial.style.display = 'none';
        divConsultoria.style.display = 'block';
    }
}

// --- E. Cargar y Pintar la Tabla de Procesos (VERSIÓN FINAL) ---
// --- E. Cargar y Pintar la Tabla de Procesos (VERSIÓN ACTUALIZADA) ---
async function cargarProcesos() {
    const tbody = document.getElementById('tablaProcesosBody');
    const filtro = document.getElementById('filtroEstadoProceso'); 
    
    if(!tbody || !filtro) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando...</td></tr>';

    try {
        const { data: procesos, error } = await clienteSupabase
            .from('procesos')
            .select('*, clientes(nombre)') 
            .eq('estado_actual', filtro.value) 
            .order('created_at', { ascending: false });

        if (error) throw error;

        // GUARDAR EN MEMORIA GLOBAL (Para poder editar luego)
        procesosCache = procesos || [];

        if (procesos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888; padding: 20px;">No se encontraron expedientes en esta categoría.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        procesos.forEach(p => {
            let icono = '<i class="fas fa-balance-scale"></i>';
            if(p.tipo === 'Consultoria') icono = '<i class="fas fa-comments"></i>';
            if(p.tipo === 'Tramite') icono = '<i class="fas fa-file-signature"></i>';

            let detalle = p.radicado ? `<span style="font-family:monospace; color:#162F45;">${p.radicado}</span><br><small>${p.juzgado || ''}</small>` : '';
            if(p.tipo === 'Consultoria' && p.fecha_cita) {
                const fecha = new Date(p.fecha_cita).toLocaleString();
                detalle = `<span style="color:#B68656; font-weight:bold;"><i class="far fa-calendar-alt"></i> ${fecha}</span>`;
            }

            const nombreCliente = p.clientes ? p.clientes.nombre : 'Cliente desconocido';

            // AQUÍ ESTÁN LOS NUEVOS BOTONES DE ACCIÓN (Editar y Borrar)
            tbody.innerHTML += `
                <tr>
                    <td><div style="font-weight:bold;">${nombreCliente}</div></td>
                    <td>
                        <div style="color:#162F45;">${icono} ${p.tipo}</div>
                        <small style="color:#666;">${p.subtipo || ''}</small>
                    </td>
                    <td>${detalle || 'Sin detalle'}</td>
                    <td>
                        <span class="status active" style="background:${p.etapa_procesal ? '#e3f2fd' : '#eee'}; color:#1565c0;">
                            ${p.etapa_procesal || 'Iniciando'}
                        </span>
                    </td>
                    <td>
                        <button class="btn-icon" onclick="abrirExpediente(${p.id})" title="Ver Expediente Completo">
                            <i class="fas fa-folder-open" style="color:#B68656;"></i>
                        </button>
                    
                        <button class="btn-icon" onclick="verProceso(${p.id})" title="Editar Datos">
                            <i class="fas fa-edit" style="color:#162F45;"></i>
                        </button>
                    
                        <button class="btn-icon btn-delete" onclick="borrarProceso(${p.id})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error("Error al cargar procesos:", err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error de conexión.</td></tr>';
    }
}
// --- D. Guardar Proceso (CREATE / UPDATE) ---
const formProceso = document.getElementById('formProceso');
if(formProceso) {
    formProceso.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const btn = document.querySelector('#formProceso button[type="submit"]');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            // 1. Recoger datos
            const tipo = document.getElementById('procesoTipo').value;
            const datosProceso = {
                cliente_id: document.getElementById('procesoClienteId').value,
                tipo: tipo,
                subtipo: document.getElementById('procesoSubtipo').value,
                estado_actual: document.getElementById('procesoEstado').value,
                etapa_procesal: document.getElementById('procesoEtapa').value,
                user_id: usuarioActual.id // (Opcional en update, obligatorio en insert)
            };

            // 2. Datos específicos
            if (tipo === 'Consultoria') {
                datosProceso.fecha_cita = document.getElementById('procesoFechaCita').value || null;
                datosProceso.radicado = null;
                datosProceso.juzgado = null;
                datosProceso.link_tyba = null;
            } else {
                datosProceso.radicado = document.getElementById('procesoRadicado').value;
                datosProceso.juzgado = document.getElementById('procesoJuzgado').value;
                datosProceso.link_tyba = document.getElementById('procesoLink').value;
                datosProceso.fecha_cita = null;
            }

            let errorOperacion = null;

            // 3. DECISIÓN: ¿Insertar o Actualizar?
            if (procesoEnEdicionId) {
                // MODO ACTUALIZAR (UPDATE)
                const { error } = await clienteSupabase
                    .from('procesos')
                    .update(datosProceso)
                    .eq('id', procesoEnEdicionId);
                errorOperacion = error;
            } else {
                // MODO CREAR (INSERT)
                const { error } = await clienteSupabase
                    .from('procesos')
                    .insert([datosProceso]);
                errorOperacion = error;
            }

            if(errorOperacion) throw errorOperacion;

            alert("Operación exitosa.");
            cerrarModalProceso();
            cargarProcesos(); 

        } catch (err) {
            alert("Error: " + err.message);
            console.error(err);
        } finally {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    });
}
// --- F. Funciones de Edición y Borrado ---

// 1. EDITAR (Llena el formulario con los datos existentes)
function verProceso(id) {
    const proceso = procesosCache.find(p => p.id === id);
    if (!proceso) return;

    // Abrir modal
    document.getElementById('modalProceso').style.display = 'flex';
    
    // Llenar campos básicos
    document.getElementById('procesoClienteId').value = proceso.cliente_id;
    document.getElementById('procesoTipo').value = proceso.tipo;
    document.getElementById('procesoSubtipo').value = proceso.subtipo || '';
    document.getElementById('procesoEstado').value = proceso.estado_actual;
    document.getElementById('procesoEtapa').value = proceso.etapa_procesal || '';

    // Ejecutar lógica visual (mostrar/ocultar campos según tipo)
    toggleCamposProceso();

    // Llenar campos específicos
    if (proceso.tipo === 'Judicial' || proceso.tipo === 'Tramite') {
        document.getElementById('procesoRadicado').value = proceso.radicado || '';
        document.getElementById('procesoJuzgado').value = proceso.juzgado || '';
        document.getElementById('procesoLink').value = proceso.link_tyba || '';
    } else {
        // Formatear fecha para el input datetime-local (YYYY-MM-DDTHH:MM)
        if(proceso.fecha_cita) {
            const fecha = new Date(proceso.fecha_cita);
            fecha.setMinutes(fecha.getMinutes() - fecha.getTimezoneOffset());
            document.getElementById('procesoFechaCita').value = fecha.toISOString().slice(0,16);
        }
    }

    // Configurar modo EDICIÓN
    procesoEnEdicionId = id; // IMPORTANTE: Esto le dice al sistema que vamos a actualizar
}

// 2. BORRAR
async function borrarProceso(id) {
    if(!confirm("¿Estás seguro de eliminar este expediente? Esta acción no se puede deshacer.")) return;

    try {
        const { error } = await clienteSupabase
            .from('procesos')
            .delete()
            .eq('id', id);

        if(error) throw error;

        alert("Proceso eliminado.");
        cargarProcesos(); // Recargar tabla
    } catch(err) {
        alert("Error al borrar: " + err.message);
    }
}
// ==========================================
// 6. LÓGICA DEL EXPEDIENTE DIGITAL
// ==========================================

// A. Abrir la vista de detalle
function abrirExpediente(id) {
    const proceso = procesosCache.find(p => p.id === id);
    if (!proceso) return;

    // 1. Ocultar lista, mostrar detalle
    document.getElementById('vista-lista-procesos').style.display = 'none';
    document.getElementById('vista-expediente-detalle').style.display = 'block';

    // 2. Llenar Datos de Cabecera
    const nombreCliente = proceso.clientes ? proceso.clientes.nombre : 'Cliente';
    document.getElementById('expTitulo').innerText = nombreCliente;
    document.getElementById('expSubtitulo').innerText = `${proceso.tipo} - ${proceso.subtipo || 'General'}`;
    
    // Tags de estado
    const estadoColor = proceso.etapa_procesal ? '#e3f2fd' : '#eee';
    document.getElementById('expTags').innerHTML = `
        <span class="status active" style="background:${estadoColor}; color:#1565c0;">${proceso.etapa_procesal || 'Iniciando'}</span>
        <span class="status">${proceso.estado_actual}</span>
    `;

    // 3. Llenar Datos Laterales
    document.getElementById('expRadicado').innerText = proceso.radicado || 'N/A';
    document.getElementById('expEntidad').innerText = proceso.juzgado || 'N/A';
    
    const linkEl = document.getElementById('expLink');
    if(proceso.link_tyba) {
        linkEl.href = proceso.link_tyba;
        linkEl.innerText = "Ver en Rama Judicial 🔗";
        linkEl.style.display = 'block';
    } else {
        linkEl.style.display = 'none';
    }

    // 4. (Pendiente) Cargar Actuaciones de la base de datos...
    cargarActuaciones(id);
    cargarEvidencias(id);
}

// B. Volver a la lista
function cerrarExpediente() {
    document.getElementById('vista-expediente-detalle').style.display = 'none';
    document.getElementById('vista-lista-procesos').style.display = 'block';
}
// ==========================================
// 7. GESTIÓN DE ACTUACIONES (BITÁCORA)
// ==========================================

let procesoActualId = null; // Variable para saber en qué carpeta estamos
let archivoActuacionBlob = null; // Variable temporal para el archivo

// A. Abrir Modal de Actuación
function abrirModalActuacion() {
    document.getElementById('modalActuacion').style.display = 'flex';
    document.getElementById('formActuacion').reset();
    document.getElementById('actFecha').valueAsDate = new Date(); // Pone la fecha de hoy
    borrarArchivo('inputArchivoActuacion', 'displayArchivoAct');
    
    // Necesitamos capturar el archivo en la variable global específica para este modal
    const input = document.getElementById('inputArchivoActuacion');
    input.onchange = function() {
        if(input.files[0]) {
            archivoActuacionBlob = input.files[0];
            document.getElementById('nombreArchivoAct').innerText = input.files[0].name;
            document.getElementById('displayArchivoAct').style.display = 'inline-flex';
        }
    };
}

function cerrarModalActuacion() {
    document.getElementById('modalActuacion').style.display = 'none';
    archivoActuacionBlob = null;
}

// B. Guardar Actuación (Subir Archivo a BUCKET PRIVADO + Insertar en DB)
document.getElementById('formActuacion').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formActuacion button[type="submit"]');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = 'Subiendo...'; btn.disabled = true;

    try {
        let urlArchivo = null;
        let nombreArchivo = null;

        // 1. Subir archivo (A LA CARPETA SEGURA 'expedientes_privados')
        if (archivoActuacionBlob) {
            nombreArchivo = archivoActuacionBlob.name;
            // Usamos una estructura organizada: ID_PROCESO/FECHA-NOMBRE
            const ruta = `${procesoActualId}/${Date.now()}-${nombreArchivo}`;
            
            // AQUÍ ESTÁ EL CAMBIO DE BUCKET
            const { error: uploadError } = await clienteSupabase.storage
                .from('expedientes_privados') 
                .upload(ruta, archivoActuacionBlob);
            
            if (uploadError) throw uploadError;

            // Obtener URL
            const { data } = clienteSupabase.storage
                .from('expedientes_privados')
                .getPublicUrl(ruta);
            
            urlArchivo = data.publicUrl;
        }

        // 2. Guardar en Base de Datos
        const { error } = await clienteSupabase
            .from('actuaciones')
            .insert([{
                proceso_id: procesoActualId,
                titulo: document.getElementById('actTitulo').value,
                fecha_actuacion: document.getElementById('actFecha').value,
                tipo: document.getElementById('actTipo').value,
                descripcion: document.getElementById('actDescripcion').value,
                archivo_url: urlArchivo,
                nombre_archivo: nombreArchivo,
                user_id: usuarioActual.id
            }]);

        if (error) throw error;

        // --- INICIO BLOQUE NUEVO: ACTUALIZAR ESTADO ---
        const checkEstado = document.getElementById('actActualizarEstado');
        if (checkEstado.checked) {
            const nuevoEstado = document.getElementById('actTitulo').value;
            
            // 1. Actualizar en la Base de Datos (Tabla Procesos)
            const { error: errorEstado } = await clienteSupabase
                .from('procesos')
                .update({ estado: nuevoEstado })
                .eq('id', procesoActualId);

            if (errorEstado) console.error("Error actualizando estado:", errorEstado);

            // 2. Actualizar visualmente la etiqueta azul en pantalla inmediatamente
            const etiquetaEstado = document.getElementById('procEstado');
            if(etiquetaEstado) etiquetaEstado.innerText = nuevoEstado;
        }
        // --- FIN BLOQUE NUEVO ---

        alert("Actuación registrada correctamente.");
        cerrarModalActuacion();
        cargarActuaciones(procesoActualId); 

    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
});

// C. Cargar y Pintar la Línea de Tiempo
async function cargarActuaciones(idProceso) {
    const contenedor = document.getElementById('timeline-actuaciones');
    contenedor.innerHTML = '<p style="text-align:center;">Cargando historia...</p>';

    // Guardamos el ID en la variable global para usarlo al guardar
    procesoActualId = idProceso;

    const { data: actuaciones, error } = await clienteSupabase
        .from('actuaciones')
        .select('*')
        .eq('proceso_id', idProceso)
        .order('fecha_actuacion', { ascending: false }); // Lo más nuevo primero

    if (error) {
        console.error(error);
        contenedor.innerHTML = '<p>Error cargando datos.</p>';
        return;
    }

    if (actuaciones.length === 0) {
        contenedor.innerHTML = `
            <div style="text-align:center; padding: 30px; background:#f9f9f9; border-radius:8px; border:1px dashed #ccc;">
                <p style="color:#888; margin:0;">Este expediente aún no tiene movimientos.</p>
                <button onclick="abrirModalActuacion()" style="margin-top:10px; background:none; border:none; color:#B68656; font-weight:bold; cursor:pointer;">
                    + Registrar el primero
                </button>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = '';
    actuaciones.forEach(act => {
        // Icono según tipo
        let icono = '📌';
        if(act.tipo === 'Juzgado') icono = '⚖️';
        if(act.tipo === 'Audiencia') icono = '📢';
        if(act.tipo === 'Memorial') icono = '📝';

        // Botón de descarga si hay archivo
        let btnArchivo = '';
        if(act.archivo_url) {
            btnArchivo = `
                <a href="${act.archivo_url}" target="_blank" style="display:inline-block; margin-top:10px; padding:5px 10px; background:#e3f2fd; color:#1565c0; text-decoration:none; border-radius:4px; font-size:12px; font-weight:bold;">
                    <i class="fas fa-paperclip"></i> Ver ${act.nombre_archivo || 'Documento'}
                </a>
            `;
        }

        contenedor.innerHTML += `
            <div style="display:flex; gap:15px; margin-bottom:20px;">
                <div style="display:flex; flex-direction:column; align-items:center;">
                    <div style="width:30px; height:30px; background:#162F45; color:white; border-radius:50%; display:flex; justify-content:center; align-items:center; font-size:14px; z-index:2;">
                        ${icono}
                    </div>
                    <div style="width:2px; flex:1; background:#eee; margin-top:5px;"></div>
                </div>
                <div style="flex:1; padding-bottom:20px;">
                    <div style="font-size:12px; color:#B68656; font-weight:bold;">${act.fecha_actuacion}</div>
                    <h4 style="margin:5px 0; color:#162F45;">${act.titulo}</h4>
                    <p style="margin:0; font-size:13px; color:#555; line-height:1.4;">${act.descripcion || ''}</p>
                    ${btnArchivo}
                </div>
            </div>
        `;
    });
}
// ==========================================
// 8. AGENDA Y CALENDARIO (CONEXIÓN REAL)
// ==========================================

let calendarioInstancia = null; // Para controlar el calendario

// A. Abrir Modal Manual
function abrirModalEvento() {
    document.getElementById('modalEvento').style.display = 'flex';
    document.getElementById('formEvento').reset();
    
    // Cargar Procesos en el Select (para vincular la audiencia a un caso)
    const select = document.getElementById('evtProcesoId');
    select.innerHTML = '<option value="">-- Ninguno / Evento General --</option>';
    
    if(procesosCache.length > 0) {
        procesosCache.forEach(p => {
            const nombreCliente = p.clientes ? p.clientes.nombre : 'Cliente';
            select.innerHTML += `<option value="${p.id}">Caso: ${nombreCliente} - ${p.tipo}</option>`;
        });
    }
}

function cerrarModalEvento() {
    document.getElementById('modalEvento').style.display = 'none';
}

// B. Guardar Evento Manualmente
document.getElementById('formEvento').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formEvento button[type="submit"]');
    btn.innerHTML = 'Guardando...'; btn.disabled = true;

    try {
        const procesoId = document.getElementById('evtProcesoId').value;
        
        const { error } = await clienteSupabase
            .from('agenda')
            .insert([{
                titulo: document.getElementById('evtTitulo').value,
                fecha_inicio: document.getElementById('evtFecha').value,
                tipo_evento: document.getElementById('evtTipo').value,
                proceso_id: procesoId || null, // Si está vacío, manda null
                descripcion: document.getElementById('evtDescripcion').value,
                user_id: usuarioActual.id
            }]);

        if (error) throw error;

        alert("Evento agendado exitosamente.");
        cerrarModalEvento();
        
        // Recargar el calendario para ver el nuevo evento
        calendarioInstancia.refetchEvents(); 

    } catch(err) {
        alert("Error: " + err.message);
    } finally {
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar en Agenda';
        btn.disabled = false;
    }
});

// C. Cargar Calendario (LEER DE BASE DE DATOS)
function cargarAgenda() {
    const calendarEl = document.getElementById('calendar');

    // Si ya existe, solo ajustamos tamaño y salimos
    if (calendarioInstancia) {
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        return;
    }
    
    // Configuración del Calendario
    calendarioInstancia = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Lista' },
        
        // AQUÍ CONECTAMOS CON SUPABASE
        // AQUÍ CONECTAMOS CON SUPABASE Y LOS FESTIVOS
        events: async function(info, successCallback, failureCallback) {
            try {
                // 1. Descargar eventos reales de la Base de Datos
                const { data, error } = await clienteSupabase
                    .from('agenda')
                    .select('*');
                
                if(error) throw error;

                // 2. Mapear eventos de Supabase (Tus audiencias, citas, etc.)
                const eventosDeAgenda = data.map(evt => {
                    let color = '#162F45'; // Azul (Por defecto)
                    if(evt.tipo_evento === 'Audiencia') color = '#B68656'; // Dorado
                    if(evt.tipo_evento === 'Vencimiento') color = '#c62828'; // Rojo fuerte
                    if(evt.tipo_evento === 'Cita') color = '#2e7d32'; // Verde

                    return {
                        title: evt.titulo,
                        start: evt.fecha_inicio,
                        color: color,
                        extendedProps: { descripcion: evt.descripcion }
                    };
                });

                // 3. Mapear los FESTIVOS (Desde tu lista de JS)
                // Usamos "display: 'background'" para que pinten todo el día de rojo suave
                const eventosFestivos = festivosColombia.map(fecha => {
                    return {
                        start: fecha,
                        display: 'background', // Esto lo pone de fondo
                        backgroundColor: '#ffcdd2', // Rojo clarito (alerta visual)
                        title: 'FESTIVO' // (Nota: en vista mensual a veces no se ve el título del fondo, pero sí el color)
                    };
                });

                // 4. Unir ambas listas y enviarlas al calendario
                const todosLosEventos = [...eventosDeAgenda, ...eventosFestivos];
                
                successCallback(todosLosEventos);

            } catch(err) {
                console.error("Error cargando agenda:", err);
                failureCallback(err);
            }
        },

        eventClick: function(info) {
            alert('Evento: ' + info.event.title + '\n\n' + (info.event.extendedProps.descripcion || ''));
        }
    });

    calendarioInstancia.render();
}
// ==========================================
// 9. CALCULADORA DE TÉRMINOS JUDICIALES
// ==========================================

// Lista de Festivos Colombia (2025 - 2026) - Formato AAAA-MM-DD
const festivosColombia = [
    // 2025
    "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18", 
    "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20", 
    "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17", 
    "2025-12-08", "2025-12-25",
    // 2026 (Proyectados)
    "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
    "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29",
    "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02",
    "2026-11-16", "2026-12-08", "2026-12-25"
];

let fechaCalculadaGlobal = null; // Para guardar el resultado temporalmente

function abrirModalCalculadora() {
    document.getElementById('modalCalculadora').style.display = 'flex';
    // Poner fecha de hoy por defecto
    document.getElementById('calcFechaInicio').valueAsDate = new Date();
    // Limpiar resultado anterior
    document.getElementById('resultadoCalculo').style.display = 'none';
}

function cerrarModalCalculadora() {
    document.getElementById('modalCalculadora').style.display = 'none';
}

function realizarCalculo() {
    const fechaInput = document.getElementById('calcFechaInicio').value;
    const diasInput = parseInt(document.getElementById('calcDias').value);
    const tipo = document.getElementById('calcTipo').value; // 'Habiles' o 'Calendario'

    if (!fechaInput || !diasInput) {
        alert("Por favor ingresa la fecha y el número de días.");
        return;
    }

    // El truco de la fecha: JS usa zona horaria local, esto evita errores de "ayer"
    let fechaActual = new Date(fechaInput + 'T00:00:00');
    let diasContados = 0;

    // LÓGICA DE CÁLCULO
    while (diasContados < diasInput) {
        // Avanzamos un día
        fechaActual.setDate(fechaActual.getDate() + 1);

        if (tipo === 'Calendario') {
            diasContados++;
        } else {
            // Si es Hábiles, verificamos que NO sea fin de semana NI festivo
            const diaSemana = fechaActual.getDay(); // 0 = Domingo, 6 = Sábado
            const fechaStr = fechaActual.toISOString().split('T')[0]; // YYYY-MM-DD

            // Si no es Sábado (6) ni Domingo (0) ni Festivo
            if (diaSemana !== 0 && diaSemana !== 6 && !festivosColombia.includes(fechaStr)) {
                diasContados++;
            }
        }
    }

    // MOSTRAR RESULTADO
    fechaCalculadaGlobal = fechaActual.toISOString().split('T')[0]; // Guardar para usar luego
    
    // Formato bonito para el usuario (Ej: Lunes, 24 de Agosto de 2026)
    const opcionesFecha = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const textoFecha = fechaActual.toLocaleDateString('es-ES', opcionesFecha);

    const divResultado = document.getElementById('resultadoCalculo');
    divResultado.innerHTML = `
        <div style="font-size: 14px; color: #666; margin-bottom: 5px;">El término vence el:</div>
        <div style="font-size: 18px; font-weight: bold; color: #c62828; text-transform: capitalize;">${textoFecha}</div>
        <div style="margin-top: 15px;">
            <button type="button" class="btn-action" style="margin: 0 auto;" onclick="guardarEnAgendaCalculo()">
                <i class="fas fa-calendar-check"></i> Agendar Vencimiento
            </button>
        </div>
    `;
    divResultado.style.display = 'block';
}

// Función temporal hasta que conectemos la base de datos de agenda
function guardarEnAgendaCalculo() {
    alert("¡Calculado! En el próximo paso guardaremos '" + fechaCalculadaGlobal + "' en el Calendario real.");
}
// ==========================================
// 10. IMPORTACIÓN MASIVA DE CLIENTES (COMPLETA)
// ==========================================

async function procesarExcelMasivo() {
    const input = document.getElementById('inputExcelMasivo');
    const archivo = input.files[0];

    if (!archivo) return;

    if (!confirm("Vas a importar clientes completos desde Excel.\n\nAsegúrate de usar los encabezados correctos:\nNombre, Cedula, Telefono, Correo, Direccion, Tipo, Servicio, Honorarios, etc.\n\n¿Continuar?")) {
        input.value = ''; 
        return;
    }

    const reader = new FileReader();

    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convertir a JSON
            const jsonDatos = XLSX.utils.sheet_to_json(worksheet);

            if (jsonDatos.length === 0) {
                alert("El archivo parece estar vacío.");
                return;
            }

            // MAPEO INTELIGENTE (Excel -> Supabase)
            const clientesParaInsertar = jsonDatos.map(fila => {
                
                // Función auxiliar para limpiar textos (quita espacios y pone minúsculas si es necesario)
                const getVal = (keys) => {
                    for (let key of keys) {
                        if (fila[key] !== undefined) return fila[key];
                    }
                    return null;
                };

                return {
                    user_id: usuarioActual.id,
                    
                    // 1. Datos Básicos
                    nombre: getVal(['Nombre', 'nombre', 'Cliente']) || 'Sin Nombre',
                    identificacion: getVal(['Cedula', 'cedula', 'NIT', 'Identificacion']) || '000',
                    telefono: getVal(['Telefono', 'telefono', 'Celular']) || 0,
                    email: getVal(['Correo', 'correo', 'Email']) || 'sin@correo.com',
                    direccion: getVal(['Direccion', 'direccion', 'Ubicacion']) || '',
                    
                    // 2. Clasificación (Con valores por defecto si lo dejan vacío)
                    tipo_persona: getVal(['Tipo', 'tipo']) || 'Natural', 
                    servicio: getVal(['Servicio', 'servicio', 'Asunto']) || 'Consultoria',
                    
                    // 3. Detalles del Caso
                    fecha_inicio: getVal(['Fecha Inicio', 'Fecha', 'Inicio']) || new Date().toISOString().split('T')[0],
                    contraparte: getVal(['Contraparte', 'contraparte']) || '',
                    descripcion: getVal(['Descripcion', 'descripcion', 'Detalle']) || 'Importado desde Excel',
                    
                    // 4. Financiero
                    modalidad_pago: getVal(['Modalidad', 'modalidad', 'Cobro']) || 'Fijo',
                    valor_total: getVal(['Valor', 'valor', 'Honorarios', 'Precio']) || 0,
                    impuesto: getVal(['IVA', 'iva', 'Impuesto']) || 'NoAplica',
                    porcentaje_exito: getVal(['Cuota Litis', 'Porcentaje', 'Exito']) || 0,
                    
                    estado_pago: 'Pendiente'
                };
            });

            // ENVIAR A SUPABASE
            const { error } = await clienteSupabase
                .from('clientes')
                .insert(clientesParaInsertar);

            if (error) throw error;

            alert(`¡Éxito! Se han creado ${clientesParaInsertar.length} expedientes completos.`);
            cargarClientesDesdeNube(); 

        } catch (err) {
            console.error(err);
            alert("Error al procesar el archivo: " + err.message);
        } finally {
            input.value = ''; 
        }
    };

    reader.readAsArrayBuffer(archivo);
}
// ==========================================
// 11. GESTIÓN DE EVIDENCIAS (PRUEBAS)
// ==========================================

// A. Control del Modal (Abrir/Cerrar y cambiar tipo)
function abrirModalEvidencia() {
    document.getElementById('modalEvidencia').style.display = 'flex';
    document.getElementById('formEvidencia').reset();
    toggleTipoEvidencia(); // Para que arranque con la opción correcta visible
}

function cerrarModalEvidencia() {
    document.getElementById('modalEvidencia').style.display = 'none';
}

function toggleTipoEvidencia() {
    // Revisa cuál bolita (radio button) está marcada
    const tipo = document.querySelector('input[name="tipoSoporte"]:checked').value;
    
    // Si es Digital, muestra el campo de subir archivo. Si es Físico, muestra el campo de texto.
    if (tipo === 'Digital') {
        document.getElementById('bloqueArchivoEvidencia').style.display = 'block';
        document.getElementById('bloqueFisicoEvidencia').style.display = 'none';
    } else {
        document.getElementById('bloqueArchivoEvidencia').style.display = 'none';
        document.getElementById('bloqueFisicoEvidencia').style.display = 'block';
    }
}

// B. Guardar la Evidencia (Botón "Guardar")
document.getElementById('formEvidencia').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formEvidencia button[type="submit"]');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = 'Guardando...'; btn.disabled = true;

    try {
        const nombre = document.getElementById('evNombre').value;
        const tipo = document.querySelector('input[name="tipoSoporte"]:checked').value;
        let urlArchivo = null;
        let nombreArchivo = null;
        let ubicacion = null;

        // Opción 1: Es un archivo DIGITAL
        if (tipo === 'Digital') {
            const input = document.getElementById('inputArchivoEvidencia');
            if (input.files.length > 0) {
                const archivo = input.files[0];
                nombreArchivo = archivo.name;
                // Ruta: ID_PROCESO/evidencias/FECHA-NOMBRE
                const ruta = `${procesoActualId}/evidencias/${Date.now()}-${nombreArchivo}`;

                // Subir a la carpeta segura
                const { error: uploadError } = await clienteSupabase.storage
                    .from('expedientes_privados')
                    .upload(ruta, archivo);
                
                if (uploadError) throw uploadError;

                // Obtener el link para guardarlo
                const { data } = clienteSupabase.storage
                    .from('expedientes_privados')
                    .getPublicUrl(ruta);
                urlArchivo = data.publicUrl;
            } else {
                throw new Error("Por favor selecciona un archivo.");
            }
        } else {
            // Opción 2: Es un documento FÍSICO
            ubicacion = document.getElementById('evUbicacion').value;
            if(!ubicacion) throw new Error("Escribe dónde está guardado el documento físico.");
        }

        // Guardar en la Base de Datos
        const { error } = await clienteSupabase
            .from('evidencias')
            .insert([{
                proceso_id: procesoActualId, // Usa el ID del caso que tienes abierto
                nombre: nombre,
                tipo_soporte: tipo,
                archivo_url: urlArchivo,
                nombre_archivo: nombreArchivo,
                ubicacion_fisica: ubicacion,
                user_id: usuarioActual.id
            }]);

        if (error) throw error;

        alert("Evidencia agregada correctamente.");
        cerrarModalEvidencia();
        cargarEvidencias(procesoActualId); // Recargar la listica visual

    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
});

// C. Pintar la lista en pantalla
async function cargarEvidencias(idProceso) {
    const contenedor = document.getElementById('lista-evidencias');
    if(!contenedor) return;
    
    contenedor.innerHTML = '<small>Cargando...</small>';

    const { data: evidencias, error } = await clienteSupabase
        .from('evidencias')
        .select('*')
        .eq('proceso_id', idProceso)
        .order('created_at', { ascending: false });

    if (error || !evidencias || evidencias.length === 0) {
        contenedor.innerHTML = '<div style="font-size:12px; color:#999; padding:5px;">No hay pruebas registradas.</div>';
        return;
    }

    contenedor.innerHTML = '';
    evidencias.forEach(ev => {
        let icono = '';
        let accion = '';

        if (ev.tipo_soporte === 'Digital') {
            icono = '<i class="fas fa-file-pdf" style="color:#e53935; margin-right:5px;"></i>';
            accion = `<a href="${ev.archivo_url}" target="_blank" style="font-size:11px; color:#1565c0; text-decoration:underline;">Ver Archivo</a>`;
        } else {
            icono = '<i class="fas fa-box-open" style="color:#B68656; margin-right:5px;"></i>';
            accion = `<span style="font-size:11px; color:#666;">Ubicación: ${ev.ubicacion_fisica}</span>`;
        }

        contenedor.innerHTML += `
            <div style="display:flex; align-items:center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                <div style="display:flex; align-items:center;">
                    ${icono}
                    <span style="font-weight:500; font-size:13px; color:#333;">${ev.nombre}</span>
                </div>
                ${accion}
            </div>
        `;
    });
}
// ==========================================
// 12. MÓDULO FINANCIERO (TIMELINE Y P&L)
// ==========================================

function abrirModalTransaccion(tipo) {
    document.getElementById('modalTransaccion').style.display = 'flex';
    document.getElementById('formTransaccion').reset();
    document.getElementById('finTipo').value = tipo;
    
    // Configurar título y color según sea Ingreso o Gasto
    const titulo = document.getElementById('tituloModalFinanzas');
    if(tipo === 'INGRESO') {
        titulo.innerText = 'Registrar Ingreso / Cuenta de Cobro';
        titulo.style.color = '#2e7d32';
    } else {
        titulo.innerText = 'Registrar Gasto Operativo';
        titulo.style.color = '#c62828';
    }
    document.getElementById('finFecha').valueAsDate = new Date();
}

// GUARDAR TRANSACCIÓN MANUAL
document.getElementById('formTransaccion').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formTransaccion button[type="submit"]');
    btn.innerHTML = 'Guardando...'; btn.disabled = true;

    try {
        const tipo = document.getElementById('finTipo').value;
        const monto = parseFloat(document.getElementById('finMonto').value);
        const estado = document.getElementById('finEstado').value;
        const fecha = document.getElementById('finFecha').value;
        
        // Lógica clave: Si está PAGADO, la fecha real es la ingresada. Si es PENDIENTE, es solo vencimiento.
        const fechaPagoReal = (estado === 'PAGADO') ? fecha : null;

        const { error } = await clienteSupabase
            .from('finanzas_movimientos')
            .insert([{
                tipo: tipo,
                descripcion: document.getElementById('finDesc').value,
                monto_esperado: monto,
                monto_real: (estado === 'PAGADO') ? monto : 0, // Solo suma al real si se pagó
                fecha_vencimiento: fecha,
                fecha_pago_real: fechaPagoReal,
                estado: estado,
                categoria: (tipo === 'INGRESO') ? 'Honorarios' : 'Gastos Generales',
                user_id: usuarioActual.id
            }]);

        if (error) throw error;

        alert("Movimiento registrado correctamente.");
        document.getElementById('modalTransaccion').style.display = 'none';
        cargarFinanzas(); // Recargar tablero

    } catch(err) {
        alert("Error: " + err.message);
    } finally {
        btn.innerHTML = 'Registrar'; btn.disabled = false;
    }
});

// CARGAR DASHBOARD FINANCIERO
async function cargarFinanzas() {
    const anio = document.getElementById('filtroAnioFinanzas').value;
    
    // 1. Traer datos del año seleccionado
    const fechaInicio = `${anio}-01-01`;
    const fechaFin = `${anio}-12-31`;

    const { data: movimientos, error } = await clienteSupabase
        .from('finanzas_movimientos')
        .select('*')
        .gte('fecha_vencimiento', fechaInicio)
        .lte('fecha_vencimiento', fechaFin)
        .order('fecha_vencimiento', { ascending: true });

    if(error) { console.error(error); return; }

    // 2. Calcular KPIs Generales
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

    // Formatear moneda COP
    const fmt = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

    document.getElementById('kpiIngresos').innerText = fmt(totalIngresosReales);
    document.getElementById('kpiGastos').innerText = fmt(totalGastos);
    document.getElementById('kpiCartera').innerText = fmt(totalCartera);

    // 3. Generar Timeline Mensual
    renderizarTimeline(movimientos, fmt);
    
    // 4. Llenar Tabla Detalle
    const tbody = document.getElementById('tablaMovimientosBody');
    tbody.innerHTML = '';
    movimientos.slice(0, 10).forEach(m => { // Mostrar últimos 10
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

    // Agrupar por mes (0-11)
    const meses = Array(12).fill(null).map(() => ({ ingreso: 0, gasto: 0, cartera: 0 }));
    
    movimientos.forEach(m => {
        // Usamos fecha de vencimiento para ubicarlo en el mes
        const mesIndex = new Date(m.fecha_vencimiento).getMonth(); // 0 = Enero
        
        if(m.tipo === 'GASTO' && m.estado === 'PAGADO') {
            meses[mesIndex].gasto += m.monto_real;
        } else if (m.tipo === 'INGRESO') {
            if(m.estado === 'PAGADO') meses[mesIndex].ingreso += m.monto_real;
            else meses[mesIndex].cartera += m.monto_esperado;
        }
    });

    // Dibujar las barras (HTML puro para no complicarnos con librerías externas aún)
    const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    // Encontrar el valor más alto para calcular porcentajes de altura
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
    });
}


