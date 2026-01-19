// ==========================================
// 1. CONFIGURACIÓN E INICIO
// ==========================================
const supabaseUrl = 'https://gpwrnhynvyerranktstf.supabase.co';
const supabaseKey = 'sb_publishable_XsLhiovLphmecmnjHAmYDQ_MEIaARRZ'; 
const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

let usuarioActual = null;
let rolActual = null;

// Variables globales
let clienteEnEdicionId = null; // <--- AGREGA ESTO (Guardará el ID del cliente que estamos editando)
// Variables globales para archivos
let archivoImagen = null;
let archivoDocumento = null;
let archivoContrato = null; // Variable para el contrato del cliente

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

    // 3. Cargar datos iniciales
    if(document.getElementById('tablaClientesBody')) {
        cargarClientesLocal(); 
    }
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
    // ... código anterior ...
    
    // Lógica para cambiar el Título
    const titulos = {
        'dashboard': 'Resumen Ejecutivo',
        'clientes': 'Gestión de Clientes',
        'procesos': 'Expedientes y Procesos',
        'finanzas': 'Departamento Financiero',
        'gestion-noticias': 'Publicación de Noticias',
        'usuarios-sistema': 'Control de Usuarios'
    };
    
    const tituloElement = document.getElementById('page-title');
    if(tituloElement && titulos[sectionId]) {
        tituloElement.innerText = titulos[sectionId];
    }

    // ... resto del código (document.querySelectorAll...) ...

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
    if(sectionId === 'clientes') cargarClientesLocal();
    if(sectionId === 'dashboard') actualizarDashboard();
}


// ==========================================
// 2. GESTIÓN DE CLIENTES (LÓGICA AVANZADA)
// ==========================================

// --- A. Lógica de Pestañas (Tabs) ---
function cambiarTab(tabId) {
    // 1. Ocultar todos los contenidos
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    // 2. Desactivar todos los botones
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // 3. Activar el seleccionado
    document.getElementById(tabId).classList.add('active');
    // Encontrar el botón que llamó a esta función (truco usando event)
    if(event) event.currentTarget.classList.add('active');
}

// --- B. Lógica Financiera ---
function toggleCuotaLitis() {
    const modalidad = document.getElementById('cobroModalidad').value;
    const divPorcentaje = document.getElementById('divPorcentajeExito');
    
    // Si es Cuota Litis o Mixto, mostramos el campo de porcentaje
    if (modalidad === 'CuotaLitis' || modalidad === 'Mixto') {
        divPorcentaje.style.display = 'block';
    } else {
        divPorcentaje.style.display = 'none';
        document.getElementById('porcentajeExito').value = '';
    }
}

function agregarCuota() {
    const tbody = document.getElementById('listaCuotas');
    const idUnico = Date.now(); // Para identificar la fila

    const fila = document.createElement('tr');
    fila.id = `fila-${idUnico}`;
    fila.innerHTML = `
        <td><input type="text" placeholder="Ej: Anticipo 50%" class="input-tabla" style="width:100%; border:none;"></td>
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
    clienteEnEdicionId = null; // Resetear ID
    document.getElementById('modalCliente').style.display = 'flex';
    cambiarTab('tab-cliente');
    document.getElementById('formCliente').reset(); // Limpiar campos
    document.getElementById('listaCuotas').innerHTML = ''; // Limpiar tabla cuotas
    
    // Asegurar que los botones sean los de "Crear"
    const footerModal = document.querySelector('#formCliente .modal-footer-btns');
    if(footerModal) {
        footerModal.innerHTML = `
            <button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cancelar</button>
            <button type="submit" class="btn-action"><i class="fas fa-save"></i> Crear Expediente</button>
        `;
    }
    
    // Desbloquear inputs por si quedaron bloqueados
    const inputs = document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea');
    inputs.forEach(input => input.disabled = false);
    
    // Agregar cuota vacía
    agregarCuota();
}
// --- Función para VER DETALLE (El Ojo) ---
function verCliente(id) {
    const clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];
    const cliente = clientes.find(c => c.id === id);

    if (!cliente) return;

    // 1. Llenar el formulario con los datos
    document.getElementById('clienteTipo').value = cliente.tipoPersona;
    document.getElementById('clienteId').value = cliente.identificacion;
    document.getElementById('clienteNombre').value = cliente.nombre;
    document.getElementById('clienteTelefono').value = cliente.telefono;
    document.getElementById('clienteEmail').value = cliente.email;
    document.getElementById('clienteDireccion').value = cliente.direccion || '';
    
    document.getElementById('servicioTipo').value = cliente.servicio;
    document.getElementById('fechaInicio').value = cliente.fechaInicio;
    document.getElementById('contraparteNombre').value = cliente.contraparte || '';
    document.getElementById('casoDescripcion').value = cliente.descripcion || '';
    
    document.getElementById('cobroModalidad').value = cliente.modalidadPago;
    document.getElementById('valorTotal').value = cliente.valorTotal;
    document.getElementById('impuestoIva').value = cliente.impuesto;
    document.getElementById('porcentajeExito').value = cliente.porcentajeExito || '';

    // 2. Llenar la tabla de cuotas
    const tbody = document.getElementById('listaCuotas');
    tbody.innerHTML = '';
    if (cliente.planPagos) {
        cliente.planPagos.forEach(cuota => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td><input type="text" value="${cuota.concepto}" class="input-tabla" style="width:100%; border:none;" disabled></td>
                <td><input type="date" value="${cuota.fecha}" class="input-tabla" style="width:100%; border:none;" disabled></td>
                <td><input type="number" value="${cuota.valor}" class="input-tabla" style="width:100%; border:none;" disabled></td>
                <td style="text-align:center;"></td> `;
            tbody.appendChild(fila);
        });
    }

    // 3. Configurar Modal en MODO LECTURA
    clienteEnEdicionId = id; // Guardamos el ID
    document.getElementById('modalCliente').style.display = 'flex';
    cambiarTab('tab-cliente');
    toggleCuotaLitis(); // Para mostrar/ocultar campos según la data cargada

    // BLOQUEAR TODOS LOS INPUTS
    const inputs = document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea, #formCliente button.btn-action');
    inputs.forEach(input => {
        // No bloqueamos el botón de cerrar ni los tabs
        if (!input.classList.contains('btn-close-modal') && !input.classList.contains('tab-btn')) {
            input.disabled = true;
        }
    });

    // 4. Cambiar botones del footer (Mostrar "Modificar" y "Cerrar")
    const footerModal = document.querySelector('#formCliente .modal-footer-btns'); // Necesitaremos agregar esta clase en el HTML
    if(footerModal) {
        footerModal.innerHTML = `
            <button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cerrar</button>
            <button type="button" class="btn-action" style="background: #B68656;" onclick="activarEdicion()">
                <i class="fas fa-edit"></i> Modificar
            </button>
        `;
    }
}
// --- Función para ACTIVAR EDICIÓN ---
function activarEdicion() {
    // 1. Desbloquear inputs
    const inputs = document.querySelectorAll('#formCliente input, #formCliente select, #formCliente textarea');
    inputs.forEach(input => input.disabled = false);

    // 2. Restaurar botones originales (Cancelar / Guardar)
    const footerModal = document.querySelector('#formCliente .modal-footer-btns');
    footerModal.innerHTML = `
        <button type="button" class="btn-action" style="background: #888;" onclick="cerrarModalCliente()">Cancelar</button>
        <button type="submit" class="btn-action" id="btnGuardarCliente">
            <i class="fas fa-save"></i> Guardar Cambios
        </button>
    `;
    
    // 3. Reactivar botones de cuotas
    document.getElementById('btnAgregarCuota').disabled = false;
    alert("Modo edición activado. Puedes modificar los datos.");
}
function cerrarModalCliente() {
    document.getElementById('modalCliente').style.display = 'none';
    document.getElementById('formCliente').reset();
    document.getElementById('listaCuotas').innerHTML = ''; // Limpiar cuotas
    borrarArchivo('inputContrato', 'displayContrato');
}

// --- D. Guardar Cliente (CREATE / UPDATE) ---
const formCliente = document.getElementById('formCliente');
if(formCliente) {
    formCliente.addEventListener('submit', function(e) {
        e.preventDefault();

        // Recopilar cuotas
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

        // Crear objeto datos
        const datosCliente = {
            id: clienteEnEdicionId ? clienteEnEdicionId : Date.now(), // Usar ID existente si editamos
            tipoPersona: document.getElementById('clienteTipo').value,
            identificacion: document.getElementById('clienteId').value,
            nombre: document.getElementById('clienteNombre').value,
            telefono: document.getElementById('clienteTelefono').value,
            email: document.getElementById('clienteEmail').value,
            direccion: document.getElementById('clienteDireccion').value,
            servicio: document.getElementById('servicioTipo').value,
            fechaInicio: document.getElementById('fechaInicio').value,
            contraparte: document.getElementById('contraparteNombre').value,
            descripcion: document.getElementById('casoDescripcion').value,
            modalidadPago: document.getElementById('cobroModalidad').value,
            valorTotal: document.getElementById('valorTotal').value,
            impuesto: document.getElementById('impuestoIva').value,
            porcentajeExito: document.getElementById('porcentajeExito').value,
            planPagos: cuotas,
            nombreContrato: document.getElementById('nombreContrato').innerText,
            fechaRegistro: new Date().toLocaleDateString() // Podrías mantener la original si quisieras
        };

        // Guardar en Storage
        let clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];
        
        if (clienteEnEdicionId) {
            // MODO EDICIÓN: Buscar y reemplazar
            const index = clientes.findIndex(c => c.id === clienteEnEdicionId);
            if(index !== -1) {
                clientes[index] = datosCliente;
                alert("Cliente actualizado correctamente.");
            }
        } else {
            // MODO CREACIÓN: Agregar nuevo
            clientes.push(datosCliente);
            alert("Cliente creado correctamente.");
        }

        localStorage.setItem('clientes_tendencia', JSON.stringify(clientes));
        cerrarModalCliente();
        cargarClientesLocal();
    });
}

// --- E. Cargar Clientes (READ) - VERSIÓN CORREGIDA Y ÚNICA ---
function cargarClientesLocal() {
    const tbody = document.getElementById('tablaClientesBody');
    if(!tbody) return; // Protección por si no estamos en la vista correcta

    const clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];

    // 1. Si no hay clientes, mostrar mensaje vacío
    if (clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888; padding: 20px;">No hay expedientes activos.</td></tr>';
        return;
    }

    // 2. Limpiar tabla antes de llenarla
    tbody.innerHTML = '';

    // 3. Recorrer y dibujar cada cliente
    clientes.forEach(c => {
        
        // A. Lógica visual para el IVA
        let textoIva = '';
        if(c.impuesto === 'MasIVA') textoIva = '<span style="color:#c62828; font-size:10px; font-weight:bold;">(+ IVA)</span>';
        if(c.impuesto === 'Incluido') textoIva = '<span style="color:#2e7d32; font-size:10px; font-weight:bold;">(Inc.)</span>';

        // B. Icono según servicio
        let iconoServicio = '<i class="fas fa-folder"></i>'; // Default
        if(c.servicio === 'Demandante') iconoServicio = '<i class="fas fa-gavel" style="color:#c62828;"></i>';
        if(c.servicio === 'Demandado') iconoServicio = '<i class="fas fa-shield-alt" style="color:#1565c0;"></i>';
        if(c.servicio === 'Tramite') iconoServicio = '<i class="fas fa-file-signature" style="color:#1565c0;"></i>';

        // C. Insertar fila HTML
        tbody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight:bold;">${c.nombre}</div>
                    <div style="font-size:11px; color:#666;">${iconoServicio} ${c.servicio}</div>
                </td>
                <td>${c.identificacion}</td>
                <td>
                    <div>${c.telefono}</div>
                    <div style="font-size:11px; color:#888;">${c.email}</div>
                </td>
                <td>
                    <span class="status active">${c.modalidadPago}</span>
                    <div style="font-size:13px; margin-top:2px; font-weight:bold;">
                        $ ${Number(c.valorTotal).toLocaleString()} ${textoIva}
                    </div>
                </td>
                <td>
                    <button class="btn-icon" onclick="verCliente(${c.id})" title="Ver Detalle"><i class="fas fa-eye" style="color:#162F45;"></i></button>
                    <button class="btn-icon btn-delete" onclick="borrarClienteLocal(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function borrarClienteLocal(id) {
    if(!confirm("¿Seguro que deseas eliminar este expediente y todos sus datos financieros?")) return;
    let clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];
    clientes = clientes.filter(c => c.id !== id);
    localStorage.setItem('clientes_tendencia', JSON.stringify(clientes));
    cargarClientesLocal();
}


// ==========================================
// 3. GESTIÓN DE USUARIOS (SUPABASE)
// ==========================================
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
// 5. LÓGICA DEL DASHBOARD (INICIO)
// ==========================================
function actualizarDashboard() {
    const clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];
    
    // 1. Calcular Casos Activos
    document.getElementById('kpi-casos').innerText = clientes.length;

    // 2. Calcular Nuevos Clientes (En este mes)
    const mesActual = new Date().getMonth();
    const nuevos = clientes.filter(c => {
        const fechaRegistro = new Date(c.fechaRegistro); // Asumiendo formato válido
        return fechaRegistro.getMonth() === mesActual;
    }).length;
    // Si prefieres mostrar el total siempre, usa: clientes.length
    document.getElementById('kpi-nuevos').innerText = nuevos;

    // 3. Calcular Facturación Total
    const totalDinero = clientes.reduce((sum, c) => sum + Number(c.valorTotal || 0), 0);
    document.getElementById('kpi-facturacion').innerText = "$ " + totalDinero.toLocaleString();

    // 4. Calcular Tareas (Cuotas Pendientes de cobro)
    let cuotasPendientes = 0;
    clientes.forEach(c => {
        if(c.planPagos) {
            cuotasPendientes += c.planPagos.filter(p => p.estado === 'Pendiente').length;
        }
    });
    document.getElementById('kpi-pendientes').innerText = cuotasPendientes;

    // 5. Llenar tabla de Últimos Movimientos
    const tbody = document.getElementById('tablaMovimientosBody');
    if (tbody) {
        tbody.innerHTML = "";
        // Tomamos los últimos 5 clientes invertidos (los más nuevos primero)
        const ultimos = [...clientes].reverse().slice(0, 5);
        
        ultimos.forEach(c => {
            tbody.innerHTML += `
                <tr>
                    <td>${c.fechaRegistro || 'N/A'}</td>
                    <td>${c.nombre}</td>
                    <td>${c.servicio}</td>
                    <td><span class="status active">Activo</span></td>
                </tr>
            `;
        });
    }
}
