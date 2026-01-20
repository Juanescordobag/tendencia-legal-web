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
                const { error } = await clienteSupabase
                    .from('clientes')
                    .insert([datosCliente]);
                errorOperacion = error;
            }

            if(errorOperacion) throw errorOperacion;

            alert("Operación exitosa.");
            cerrarModalCliente();
            cargarClientesDesdeNube(); // Recargar tabla

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
async function cargarProcesos() {
    const tbody = document.getElementById('tablaProcesosBody');
    const filtro = document.getElementById('filtroEstadoProceso'); // El select de "Activos/Cerrados"
    
    if(!tbody || !filtro) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando...</td></tr>';

    try {
        // 1. Consultar a Supabase (incluyendo datos del Cliente)
        const { data: procesos, error } = await clienteSupabase
            .from('procesos')
            .select('*, clientes(nombre)') 
            .eq('estado_actual', filtro.value) // Filtra según lo que elijas en el select
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (procesos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888; padding: 20px;">No se encontraron expedientes en esta categoría.</td></tr>';
            return;
        }

        // 2. Dibujar filas
        tbody.innerHTML = '';
        procesos.forEach(p => {
            // Icono según tipo
            let icono = '<i class="fas fa-balance-scale"></i>'; // Judicial
            if(p.tipo === 'Consultoria') icono = '<i class="fas fa-comments"></i>'; // Consultoría
            if(p.tipo === 'Tramite') icono = '<i class="fas fa-file-signature"></i>'; // Trámite

            // Detalle inteligente
            let detalle = p.radicado ? `<span style="font-family:monospace; color:#162F45;">${p.radicado}</span><br><small>${p.juzgado || ''}</small>` : '';
            if(p.tipo === 'Consultoria' && p.fecha_cita) {
                const fecha = new Date(p.fecha_cita).toLocaleString();
                detalle = `<span style="color:#B68656; font-weight:bold;"><i class="far fa-calendar-alt"></i> ${fecha}</span>`;
            }

            // Nombre del cliente
            const nombreCliente = p.clientes ? p.clientes.nombre : 'Cliente desconocido';

            tbody.innerHTML += `
                <tr>
                    <td>
                        <div style="font-weight:bold;">${nombreCliente}</div>
                    </td>
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
                        <button class="btn-icon" title="Ver Expediente Completo"><i class="fas fa-folder-open" style="color:#B68656;"></i></button>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error("Error al cargar procesos:", err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error de conexión.</td></tr>';
    }
}
// --- D. Guardar Proceso (CREATE) ---
const formProceso = document.getElementById('formProceso');
if(formProceso) {
    formProceso.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const btn = document.querySelector('#formProceso button[type="submit"]');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            // 1. Recoger datos básicos
            const tipo = document.getElementById('procesoTipo').value;
            
            const datosProceso = {
                cliente_id: document.getElementById('procesoClienteId').value,
                tipo: tipo,
                subtipo: document.getElementById('procesoSubtipo').value,
                estado_actual: document.getElementById('procesoEstado').value,
                etapa_procesal: document.getElementById('procesoEtapa').value,
                user_id: usuarioActual.id
            };

            // 2. Agregar datos específicos según el tipo
            if (tipo === 'Consultoria') {
                datosProceso.fecha_cita = document.getElementById('procesoFechaCita').value || null;
                // Limpiamos los otros campos para que no se guarde basura
                datosProceso.radicado = null;
                datosProceso.juzgado = null;
                datosProceso.link_tyba = null;
            } else {
                // Judicial o Trámite
                datosProceso.radicado = document.getElementById('procesoRadicado').value;
                datosProceso.juzgado = document.getElementById('procesoJuzgado').value;
                datosProceso.link_tyba = document.getElementById('procesoLink').value;
                datosProceso.fecha_cita = null;
            }

            // 3. Enviar a Supabase
            const { error } = await clienteSupabase
                .from('procesos')
                .insert([datosProceso]);

            if(error) throw error;

            alert("Proceso guardado correctamente.");
            cerrarModalProceso();
            cargarProcesos(); // Recargar la tabla

        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    });
}
