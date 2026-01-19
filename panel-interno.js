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
    document.getElementById('modalCliente').style.display = 'flex';
    // Resetear a la primera pestaña
    cambiarTab('tab-cliente');
    // Agregar una cuota por defecto si la tabla está vacía
    if(document.getElementById('listaCuotas').children.length === 0){
        agregarCuota();
    }
}

function cerrarModalCliente() {
    document.getElementById('modalCliente').style.display = 'none';
    document.getElementById('formCliente').reset();
    document.getElementById('listaCuotas').innerHTML = ''; // Limpiar cuotas
    borrarArchivo('inputContrato', 'displayContrato');
}

// --- D. Guardar Cliente (CREATE) ---
const formCliente = document.getElementById('formCliente');
if(formCliente) {
    formCliente.addEventListener('submit', function(e) {
        e.preventDefault();

        // 1. Recopilar Plan de Pagos (Iterar sobre la tabla)
        const cuotas = [];
        document.querySelectorAll('#listaCuotas tr').forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            if(inputs[0].value) { // Solo si tiene concepto
                cuotas.push({
                    concepto: inputs[0].value,
                    fecha: inputs[1].value,
                    valor: inputs[2].value,
                    estado: 'Pendiente' // Por defecto
                });
            }
        });

        // 2. Construir el Objeto Cliente Completo
        const nuevoCliente = {
            id: Date.now(),
            // Datos Básicos
            tipoPersona: document.getElementById('clienteTipo').value,
            identificacion: document.getElementById('clienteId').value,
            nombre: document.getElementById('clienteNombre').value,
            telefono: document.getElementById('clienteTelefono').value,
            email: document.getElementById('clienteEmail').value,
            direccion: document.getElementById('clienteDireccion').value,
            
            // Datos del Asunto
            servicio: document.getElementById('servicioTipo').value,
            fechaInicio: document.getElementById('fechaInicio').value,
            contraparte: document.getElementById('contraparteNombre').value,
            descripcion: document.getElementById('casoDescripcion').value,
            
            // Datos Económicos
            modalidadPago: document.getElementById('cobroModalidad').value,
            valorTotal: document.getElementById('valorTotal').value,
            impuesto: document.getElementById('impuestoIva').value, // <--- CAMPO IVA
            porcentajeExito: document.getElementById('porcentajeExito').value,
            planPagos: cuotas, // Array de objetos
            
            // Archivo (Simulado por ahora con el nombre)
            nombreContrato: document.getElementById('nombreContrato').innerText !== 'contrato.pdf' ? document.getElementById('nombreContrato').innerText : null,
            
            fechaRegistro: new Date().toLocaleDateString()
        };

        // 3. Guardar en LocalStorage
        let clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];
        clientes.push(nuevoCliente);
        localStorage.setItem('clientes_tendencia', JSON.stringify(clientes));

        // 4. Feedback
        alert("Expediente creado con éxito.");
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
                    <button class="btn-icon" title="Ver Detalle"><i class="fas fa-eye" style="color:#162F45;"></i></button>
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
