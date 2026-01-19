// ==========================================
// 1. CONFIGURACIÓN E INICIO
// ==========================================
const supabaseUrl = 'https://gpwrnhynvyerranktstf.supabase.co';
const supabaseKey = 'sb_publishable_XsLhiovLphmecmnjHAmYDQ_MEIaARRZ'; 
const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

let usuarioActual = null;
let rolActual = null;

// Variables globales para archivos
let archivoImagen = null;
let archivoDocumento = null;

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
    cargarClientesLocal(); // <--- NUEVO: Cargar clientes del storage
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
// 2. GESTIÓN DE CLIENTES (LOCAL STORAGE) - NUEVO
// ==========================================

// Funciones del Modal
function abrirModalCliente() {
    document.getElementById('modalCliente').style.display = 'flex';
}

function cerrarModalCliente() {
    document.getElementById('modalCliente').style.display = 'none';
    document.getElementById('formCliente').reset();
}

// Guardar Cliente (Create)
document.getElementById('formCliente').addEventListener('submit', function(e) {
    e.preventDefault();

    // 1. Capturar datos
    const nuevoCliente = {
        id: Date.now(), // ID temporal único basado en la hora
        tipo: document.getElementById('clienteTipo').value,
        identificacion: document.getElementById('clienteId').value,
        nombre: document.getElementById('clienteNombre').value,
        telefono: document.getElementById('clienteTelefono').value,
        email: document.getElementById('clienteEmail').value,
        fechaRegistro: new Date().toLocaleDateString()
    };

    // 2. Obtener lista actual de LocalStorage
    let clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];

    // 3. Agregar y guardar
    clientes.push(nuevoCliente);
    localStorage.setItem('clientes_tendencia', JSON.stringify(clientes));

    // 4. Limpiar y recargar
    alert("Cliente guardado correctamente (Local)");
    cerrarModalCliente();
    cargarClientesLocal();
});

// Cargar Clientes (Read)
function cargarClientesLocal() {
    const tbody = document.getElementById('tablaClientesBody');
    const clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];

    if (clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No hay clientes registrados aún.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    clientes.forEach(cliente => {
        // Icono según tipo (Edificio para empresa, Usuario para persona)
        const iconoTipo = cliente.tipo === 'Juridica' ? '<i class="fas fa-building"></i>' : '<i class="fas fa-user"></i>';

        tbody.innerHTML += `
            <tr>
                <td>${iconoTipo} <strong>${cliente.nombre}</strong></td>
                <td>${cliente.identificacion}</td>
                <td>${cliente.telefono}</td>
                <td>${cliente.email}</td>
                <td>
                    <button class="btn-icon btn-delete" onclick="borrarClienteLocal(${cliente.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

// Borrar Cliente (Delete)
function borrarClienteLocal(id) {
    if(!confirm("¿Seguro que deseas eliminar este cliente?")) return;

    let clientes = JSON.parse(localStorage.getItem('clientes_tendencia')) || [];
    // Filtramos para dejar todos MENOS el que tiene ese ID
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
    }
}

function borrarArchivo(inputId, displayId) {
    document.getElementById(inputId).value = "";
    document.getElementById(displayId).style.display = 'none';
    if (inputId === 'inputImagen') archivoImagen = null;
    if (inputId === 'inputDoc') archivoDocumento = null;
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
