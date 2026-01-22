// ==========================================
// 1. CONFIGURACIÓN, VARIABLES GLOBALES Y AYUDAS
// ==========================================
const supabaseUrl = 'https://gpwrnhynvyerranktstf.supabase.co';
const supabaseKey = 'sb_publishable_XsLhiovLphmecmnjHAmYDQ_MEIaARRZ'; 
const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

let usuarioActual = null;
let rolActual = null;

// Variables de memoria (Caché)
let clientesCache = []; 
let procesosCache = []; 
let deudasClienteCache = []; // Para finanzas

// Variables globales para archivos
let archivoImagen = null;
let archivoDocumento = null;
let archivoContrato = null;
let archivoActuacionBlob = null; // Para actuaciones

// --- AYUDAS GLOBALES (MANEJO DE ARCHIVOS) ---
function manejarArchivo(inputId, nombreSpanId, displayId) {
    const input = document.getElementById(inputId);
    if (input.files[0]) {
        document.getElementById(nombreSpanId).innerText = input.files[0].name;
        document.getElementById(displayId).style.display = 'inline-flex';
        
        // Asignar a la variable global correcta según el input
        if (inputId === 'inputImagen') archivoImagen = input.files[0];
        if (inputId === 'inputDoc') archivoDocumento = input.files[0];
        if (inputId === 'inputContrato') archivoContrato = input.files[0];
        if (inputId === 'inputArchivoActuacion') archivoActuacionBlob = input.files[0];
    }
}

function borrarArchivo(inputId, displayId) {
    document.getElementById(inputId).value = "";
    document.getElementById(displayId).style.display = 'none';
    if (inputId === 'inputImagen') archivoImagen = null;
    if (inputId === 'inputDoc') archivoDocumento = null;
    if (inputId === 'inputContrato') archivoContrato = null;
    if (inputId === 'inputArchivoActuacion') archivoActuacionBlob = null;
}

// --- INICIO DE SESIÓN ---
async function iniciarSistema() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (!session) { window.location.href = "login.html"; return; }

    usuarioActual = session.user;
    
    const { data: perfil } = await clienteSupabase.from('perfiles').select('*').eq('id', usuarioActual.id).single();

    if (perfil) {
        rolActual = perfil.rol;
        document.getElementById('nombreUsuarioDisplay').innerText = perfil.nombre || usuarioActual.email;
        if (rolActual === 'admin') document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
    } else {
        document.getElementById('nombreUsuarioDisplay').innerText = usuarioActual.email;
    }

    // Cargar datos iniciales
    if(typeof cargarClientesDesdeNube === 'function') cargarClientesDesdeNube(); 
}

async function cerrarSesion() {
    await clienteSupabase.auth.signOut();
    window.location.href = "login.html";
}

// --- NAVEGACIÓN ---
function showSection(sectionId, element) {
    if ((sectionId === 'gestion-noticias' || sectionId === 'usuarios-sistema') && rolActual !== 'admin') {
        alert("Acceso denegado: Se requieren permisos de Socio Administrador.");
        return;
    }

    const titulos = {
        'dashboard': 'Resumen Ejecutivo', 'clientes': 'Gestión de Clientes', 'procesos': 'Expedientes y Casos',
        'agenda': 'Agenda Judicial', 'finanzas': 'Departamento Financiero', 'gestion-noticias': 'Publicación de Noticias',
        'usuarios-sistema': 'Control de Usuarios'
    };
    const tituloElement = document.getElementById('page-title');
    if(tituloElement && titulos[sectionId]) tituloElement.innerText = titulos[sectionId];

    document.querySelectorAll('.section-view').forEach(sec => sec.classList.remove('active-view'));
    document.getElementById(sectionId).classList.add('active-view');
    
    if (element) {
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
    }

    // Cargas dinámicas
    if(sectionId === 'usuarios-sistema' && typeof cargarUsuarios === 'function') cargarUsuarios();
    if(sectionId === 'gestion-noticias' && typeof cargarNoticiasDesdeNube === 'function') cargarNoticiasDesdeNube();
    if((sectionId === 'clientes' || sectionId === 'dashboard') && typeof cargarClientesDesdeNube === 'function') cargarClientesDesdeNube();
    if(sectionId === 'procesos' && typeof cargarProcesos === 'function') cargarProcesos();
    if(sectionId === 'agenda' && typeof cargarAgenda === 'function') cargarAgenda();
    if(sectionId === 'finanzas' && typeof cargarFinanzas === 'function') cargarFinanzas();
}

// Iniciar al cargar el archivo
iniciarSistema();
