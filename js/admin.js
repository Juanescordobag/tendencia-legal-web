// ==========================================
// 6. ADMINISTRACIÓN (USUARIOS Y NOTICIAS)
// ==========================================

// USUARIOS
const formUsuario = document.getElementById('formUsuario');
if(formUsuario){
    formUsuario.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btnCrearUsuario'); btn.disabled = true;
        try {
            const email = document.getElementById('nuevoEmail').value;
            const { data: auth, error: errAuth } = await clienteSupabase.auth.signUp({ email: email, password: document.getElementById('nuevoPass').value });
            if (errAuth) throw errAuth;
            const { error: errPerf } = await clienteSupabase.from('perfiles').insert([{ id: auth.user.id, email: email, nombre: document.getElementById('nuevoNombre').value, rol: document.getElementById('nuevoRol').value }]);
            if (errPerf) throw errPerf;
            alert("Usuario creado."); formUsuario.reset(); cargarUsuarios();
        } catch (err) { alert("Error: " + err.message); } finally { btn.disabled = false; }
    });
}

async function cargarUsuarios() {
    const tbody = document.getElementById('tablaUsuariosBody');
    if(!tbody) return;
    const { data } = await clienteSupabase.from('perfiles').select('*');
    tbody.innerHTML = "";
    if(data) data.forEach(u => {
        const btn = u.id !== usuarioActual.id ? `<button class="btn-icon btn-delete" onclick="borrarUsuarioTotal('${u.id}')">🗑️</button>` : '';
        tbody.innerHTML += `<tr><td>${u.nombre}</td><td>${u.email}</td><td>${u.rol}</td><td>${btn}</td></tr>`;
    });
}

async function borrarUsuarioTotal(id) {
    if (confirm("¿Eliminar usuario?")) {
        const { error } = await clienteSupabase.rpc('eliminar_usuario_total', { id_usuario: id });
        if (!error) { alert("Eliminado."); cargarUsuarios(); } else alert(error.message);
    }
}

// NOTICIAS
const formNoticia = document.getElementById('formNoticia');
if(formNoticia){
    formNoticia.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btnSubmitNoticia'); btn.disabled = true; btn.innerHTML = 'Publicando...';
        try {
            let urlImg = null, urlDoc = null;
            if(archivoImagen) {
                const ruta = `img-${Date.now()}-${archivoImagen.name}`;
                await clienteSupabase.storage.from('ARCHIVOS_TENDENCIA').upload(ruta, archivoImagen);
                urlImg = clienteSupabase.storage.from('ARCHIVOS_TENDENCIA').getPublicUrl(ruta).data.publicUrl;
            }
            // ... Repetir lógica para documento si necesario ... 
            
            await clienteSupabase.from('noticias').insert([{
                titulo: document.getElementById('tituloNoticia').value, categoria: document.getElementById('categoriaNoticia').value,
                fecha: document.getElementById('fechaNoticia').value, resumen: document.getElementById('resumenNoticia').value,
                contenido: document.getElementById('contenidoNoticia').value, enlace: document.getElementById('linkNoticia').value,
                imagen_url: urlImg
            }]);
            alert("Publicada."); formNoticia.reset(); cargarNoticiasDesdeNube();
        } catch(err) { alert(err.message); } finally { btn.disabled = false; btn.innerHTML = 'Publicar'; }
    });
}

async function cargarNoticiasDesdeNube() {
    const tbody = document.getElementById('tablaNoticiasBody');
    if(!tbody) return;
    const { data } = await clienteSupabase.from('noticias').select('*').order('created_at', { ascending: false });
    tbody.innerHTML = "";
    if(data) data.forEach(n => tbody.innerHTML += `<tr><td>${n.fecha}</td><td>${n.titulo}</td><td>${n.categoria}</td><td><button onclick="borrarNoticia(${n.id})">🗑️</button></td></tr>`);
}

async function borrarNoticia(id) {
    if(confirm("¿Borrar?")) {
        await clienteSupabase.from('noticias').delete().eq('id', id);
        cargarNoticiasDesdeNube();
    }
}
