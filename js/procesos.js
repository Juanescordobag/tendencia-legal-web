// ==========================================
// 3. GESTIÓN DE PROCESOS (EXPEDIENTES)
// ==========================================
let procesoEnEdicionId = null;
let procesoActualId = null; // Para actuaciones

function abrirModalProceso() {
    procesoEnEdicionId = null;
    document.getElementById('modalProceso').style.display = 'flex';
    document.getElementById('formProceso').reset();
    toggleCamposProceso();
    
    const select = document.getElementById('procesoClienteId');
    select.innerHTML = '<option value="">Seleccione un cliente...</option>';
    if(clientesCache.length > 0) {
        clientesCache.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    } else {
        select.innerHTML = '<option value="">No hay clientes</option>';
    }
}

function cerrarModalProceso() { document.getElementById('modalProceso').style.display = 'none'; }

function toggleCamposProceso() {
    const tipo = document.getElementById('procesoTipo').value;
    const divJudicial = document.getElementById('camposJudiciales');
    const divConsultoria = document.getElementById('camposConsultoria');
    if (tipo === 'Judicial' || tipo === 'Tramite') {
        divJudicial.style.display = 'block';
        divConsultoria.style.display = 'none';
        document.getElementById('procesoJuzgado').placeholder = tipo === 'Tramite' ? "Entidad / Notaría..." : "Juzgado...";
    } else {
        divJudicial.style.display = 'none';
        divConsultoria.style.display = 'block';
    }
}

async function cargarProcesos() {
    const tbody = document.getElementById('tablaProcesosBody');
    const filtro = document.getElementById('filtroEstadoProceso');
    if(!tbody || !filtro) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando...</td></tr>';

    try {
        const { data: procesos, error } = await clienteSupabase.from('procesos').select('*, clientes(nombre)').eq('estado_actual', filtro.value).order('created_at', { ascending: false });
        if (error) throw error;
        procesosCache = procesos || [];
        
        if (procesos.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Sin resultados.</td></tr>'; return; }
        
        tbody.innerHTML = '';
        procesos.forEach(p => {
            let detalle = p.radicado ? `${p.radicado}<br><small>${p.juzgado || ''}</small>` : (p.fecha_cita ? new Date(p.fecha_cita).toLocaleString() : 'Sin detalle');
            tbody.innerHTML += `
                <tr>
                    <td><b>${p.clientes ? p.clientes.nombre : 'Desc.'}</b></td>
                    <td>${p.tipo}<br><small>${p.subtipo || ''}</small></td>
                    <td>${detalle}</td>
                    <td><span class="status active">${p.etapa_procesal || 'Iniciando'}</span></td>
                    <td>
                        <button class="btn-icon" onclick="abrirExpediente(${p.id})"><i class="fas fa-folder-open" style="color:#B68656;"></i></button>
                        <button class="btn-icon" onclick="verProceso(${p.id})"><i class="fas fa-edit" style="color:#162F45;"></i></button>
                        <button class="btn-icon btn-delete" onclick="borrarProceso(${p.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        });
    } catch (err) { console.error(err); tbody.innerHTML = '<tr><td colspan="5">Error conexión.</td></tr>'; }
}

const formProceso = document.getElementById('formProceso');
if(formProceso) {
    formProceso.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.querySelector('#formProceso button[type="submit"]');
        btn.disabled = true; btn.innerHTML = 'Guardando...';

        try {
            const tipo = document.getElementById('procesoTipo').value;
            const datos = {
                cliente_id: document.getElementById('procesoClienteId').value,
                tipo: tipo, subtipo: document.getElementById('procesoSubtipo').value,
                estado_actual: document.getElementById('procesoEstado').value,
                etapa_procesal: document.getElementById('procesoEtapa').value,
                user_id: usuarioActual.id
            };
            if (tipo === 'Consultoria') { datos.fecha_cita = document.getElementById('procesoFechaCita').value || null; }
            else { datos.radicado = document.getElementById('procesoRadicado').value; datos.juzgado = document.getElementById('procesoJuzgado').value; datos.link_tyba = document.getElementById('procesoLink').value; }

            if (procesoEnEdicionId) await clienteSupabase.from('procesos').update(datos).eq('id', procesoEnEdicionId);
            else await clienteSupabase.from('procesos').insert([datos]);

            alert("Operación exitosa.");
            cerrarModalProceso(); cargarProcesos();
        } catch (err) { alert("Error: " + err.message); } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Proceso'; }
    });
}

function verProceso(id) {
    const p = procesosCache.find(x => x.id === id);
    if (!p) return;
    abrirModalProceso();
    document.getElementById('procesoClienteId').value = p.cliente_id;
    document.getElementById('procesoTipo').value = p.tipo;
    document.getElementById('procesoSubtipo').value = p.subtipo || '';
    document.getElementById('procesoEstado').value = p.estado_actual;
    document.getElementById('procesoEtapa').value = p.etapa_procesal || '';
    toggleCamposProceso();
    if (p.tipo !== 'Consultoria') {
        document.getElementById('procesoRadicado').value = p.radicado || '';
        document.getElementById('procesoJuzgado').value = p.juzgado || '';
        document.getElementById('procesoLink').value = p.link_tyba || '';
    } else if(p.fecha_cita) {
        document.getElementById('procesoFechaCita').value = new Date(p.fecha_cita).toISOString().slice(0,16);
    }
    procesoEnEdicionId = id;
}

async function borrarProceso(id) {
    if(!confirm("¿Eliminar expediente?")) return;
    const { error } = await clienteSupabase.from('procesos').delete().eq('id', id);
    if(error) alert("Error: "+error.message); else { alert("Eliminado."); cargarProcesos(); }
}

// --- VISTA DETALLE EXPEDIENTE ---
function abrirExpediente(id) {
    const p = procesosCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('vista-lista-procesos').style.display = 'none';
    document.getElementById('vista-expediente-detalle').style.display = 'block';
    
    document.getElementById('expTitulo').innerText = p.clientes ? p.clientes.nombre : 'Cliente';
    document.getElementById('expSubtitulo').innerText = `${p.tipo} - ${p.subtipo}`;
    document.getElementById('expTags').innerHTML = `<span class="status active">${p.etapa_procesal}</span>`;
    document.getElementById('expRadicado').innerText = p.radicado || 'N/A';
    document.getElementById('expEntidad').innerText = p.juzgado || 'N/A';
    
    const linkEl = document.getElementById('expLink');
    if(p.link_tyba) { linkEl.href = p.link_tyba; linkEl.innerText = "Ver en Rama Judicial 🔗"; linkEl.style.display = 'block'; }
    else linkEl.style.display = 'none';

    cargarActuaciones(id);
    cargarEvidencias(id);
}

function cerrarExpediente() {
    document.getElementById('vista-expediente-detalle').style.display = 'none';
    document.getElementById('vista-lista-procesos').style.display = 'block';
}

// --- ACTUACIONES ---
function abrirModalActuacion() {
    document.getElementById('modalActuacion').style.display = 'flex';
    document.getElementById('formActuacion').reset();
    document.getElementById('actFecha').valueAsDate = new Date();
    borrarArchivo('inputArchivoActuacion', 'displayArchivoAct');
}
function cerrarModalActuacion() { document.getElementById('modalActuacion').style.display = 'none'; archivoActuacionBlob = null; }

document.getElementById('formActuacion').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formActuacion button[type="submit"]');
    btn.disabled = true; btn.innerHTML = 'Subiendo...';

    try {
        let urlArchivo = null, nombreArchivo = null;
        if (archivoActuacionBlob) {
            nombreArchivo = archivoActuacionBlob.name;
            const ruta = `${procesoActualId}/${Date.now()}-${nombreArchivo}`;
            const { error: upErr } = await clienteSupabase.storage.from('expedientes_privados').upload(ruta, archivoActuacionBlob);
            if (upErr) throw upErr;
            urlArchivo = clienteSupabase.storage.from('expedientes_privados').getPublicUrl(ruta).data.publicUrl;
        }

        const { error } = await clienteSupabase.from('actuaciones').insert([{
            proceso_id: procesoActualId, titulo: document.getElementById('actTitulo').value,
            fecha_actuacion: document.getElementById('actFecha').value, tipo: document.getElementById('actTipo').value,
            descripcion: document.getElementById('actDescripcion').value, archivo_url: urlArchivo, nombre_archivo: nombreArchivo,
            user_id: usuarioActual.id
        }]);
        if (error) throw error;

        if (document.getElementById('actActualizarEstado').checked) {
            await clienteSupabase.from('procesos').update({ estado: document.getElementById('actTitulo').value }).eq('id', procesoActualId);
        }

        alert("Actuación registrada.");
        cerrarModalActuacion();
        cargarActuaciones(procesoActualId);
    } catch (err) { alert("Error: " + err.message); } finally { btn.disabled = false; btn.innerHTML = 'Guardar'; }
});

async function cargarActuaciones(idProceso) {
    procesoActualId = idProceso;
    const cont = document.getElementById('timeline-actuaciones');
    cont.innerHTML = 'Cargando...';
    const { data: acts } = await clienteSupabase.from('actuaciones').select('*').eq('proceso_id', idProceso).order('fecha_actuacion', { ascending: false });
    
    if (!acts || acts.length === 0) { cont.innerHTML = '<p style="text-align:center;color:#888;">Sin historial.</p>'; return; }
    
    cont.innerHTML = '';
    acts.forEach(a => {
        let btn = a.archivo_url ? `<a href="${a.archivo_url}" target="_blank" style="display:inline-block;margin-top:5px;color:#1565c0;">📎 Ver Archivo</a>` : '';
        cont.innerHTML += `<div style="margin-bottom:20px; border-left:2px solid #eee; padding-left:15px;">
            <small style="color:#B68656;font-weight:bold;">${a.fecha_actuacion}</small>
            <h4 style="margin:5px 0;">${a.titulo}</h4>
            <p style="margin:0;color:#555;">${a.descripcion || ''}</p>${btn}
        </div>`;
    });
}

// ==========================================
// SECCIÓN EVIDENCIAS (RESTAURADA)
// ==========================================

function abrirModalEvidencia() {
    document.getElementById('modalEvidencia').style.display = 'flex';
    document.getElementById('formEvidencia').reset();
    toggleTipoEvidencia(); 
}

function cerrarModalEvidencia() {
    document.getElementById('modalEvidencia').style.display = 'none';
}

function toggleTipoEvidencia() {
    const tipo = document.querySelector('input[name="tipoSoporte"]:checked').value;
    if (tipo === 'Digital') {
        document.getElementById('bloqueArchivoEvidencia').style.display = 'block';
        document.getElementById('bloqueFisicoEvidencia').style.display = 'none';
    } else {
        document.getElementById('bloqueArchivoEvidencia').style.display = 'none';
        document.getElementById('bloqueFisicoEvidencia').style.display = 'block';
    }
}

// ESTA ES LA FUNCIÓN QUE FALTABA
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

        // 1. Manejo de Archivo Digital
        if (tipo === 'Digital') {
            const input = document.getElementById('inputArchivoEvidencia');
            if (input.files.length > 0) {
                const archivo = input.files[0];
                nombreArchivo = archivo.name;
                // Ruta: ID_PROCESO/evidencias/FECHA-NOMBRE
                const ruta = `${procesoActualId}/evidencias/${Date.now()}-${nombreArchivo}`;

                // Subir a Supabase Storage
                const { error: uploadError } = await clienteSupabase.storage
                    .from('expedientes_privados')
                    .upload(ruta, archivo);
                
                if (uploadError) throw uploadError;

                // Obtener URL Pública
                const { data } = clienteSupabase.storage
                    .from('expedientes_privados')
                    .getPublicUrl(ruta);
                urlArchivo = data.publicUrl;
            } else {
                throw new Error("Por favor selecciona un archivo.");
            }
        } else {
            // 2. Manejo de Físico
            ubicacion = document.getElementById('evUbicacion').value;
            if(!ubicacion) throw new Error("Escribe dónde está guardado el documento físico.");
        }

        // 3. Guardar en Base de Datos
        const { error } = await clienteSupabase
            .from('evidencias')
            .insert([{
                proceso_id: procesoActualId,
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
        cargarEvidencias(procesoActualId); // Refrescar la lista

    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
});

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
                    <span style="font-weight:500; font-size:13px; color:#333; margin-left:8px;">${ev.nombre}</span>
                </div>
                ${accion}
            </div>
        `;
    });
}
