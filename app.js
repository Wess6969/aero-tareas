// Aero Tareas (celular) — checklist que guarda las tareas en el propio teléfono y funciona sin internet.
'use strict';

/* ============================== 1. Utilidades ============================== */
const $ = selector => document.querySelector(selector);
const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)');
const MAX_TEXTO = 200;
const MAX_TAREAS = 500;
const CURVA = 'cubic-bezier(.2,.8,.2,1)';
const CLAVE = 'aeroTareas.tareas';

function conAnimacion() { return !movimientoReducido.matches; }
function nuevoId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function limpiarTexto(texto) { return String(texto).replace(/\s+/g, ' ').trim(); }
function recortar(texto, max) { return texto.length > max ? texto.slice(0, max - 1) + '…' : texto; }
function anunciar(mensaje) { $('#anuncio').textContent = mensaje; }
function vibrar(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* sin vibración */ } }

function icono(nombre) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS(ns, 'use');
  uso.setAttribute('href', '#i-' + nombre);
  svg.append(uso);
  return svg;
}

function leerPreferencia(clave, porDefecto) {
  try { const v = localStorage.getItem('aeroTareas.' + clave); return v === null ? porDefecto : JSON.parse(v); } catch { return porDefecto; }
}
function guardarPreferencia(clave, valor) {
  try { localStorage.setItem('aeroTareas.' + clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

/* ============================== 1b. Sonidos de agua (sintetizados, sin archivos) ============================== */
const Sonido = (() => {
  let contexto = null;
  let salida = null;
  let activo = leerPreferencia('sonido', true) !== false;

  // Se crea al primer toque: los teléfonos solo dejan sonar audio después de que el usuario toca algo.
  function preparar() {
    if (!contexto) {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return null;
      // iPhone: respeta el botón de silencio y no corta la música que estés escuchando.
      try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* no disponible */ }
      contexto = new Contexto();
      salida = contexto.createGain();
      salida.gain.value = 0.8;
      // Eco suave, como dentro de una cueva con agua
      const retardo = contexto.createDelay(1);
      retardo.delayTime.value = 0.11;
      const realimentacion = contexto.createGain();
      realimentacion.gain.value = 0.25;
      const filtro = contexto.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 2400;
      const mezcla = contexto.createGain();
      mezcla.gain.value = 0.28;
      salida.connect(contexto.destination);
      salida.connect(retardo);
      retardo.connect(filtro);
      filtro.connect(realimentacion);
      realimentacion.connect(retardo);
      filtro.connect(mezcla);
      mezcla.connect(contexto.destination);
    }
    if (contexto.state === 'suspended') contexto.resume().catch(() => {});
    return contexto;
  }

  // Burbuja: un tono puro que cambia de altura rápido (sube = burbuja que sale, baja = burbuja que se hunde).
  function burbuja(t, desde, hasta, duracion, fuerza) {
    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.setValueAtTime(desde, t);
    oscilador.frequency.exponentialRampToValueAtTime(hasta, t + duracion * 0.4);
    volumen.gain.setValueAtTime(0.0001, t);
    volumen.gain.exponentialRampToValueAtTime(fuerza, t + 0.008);
    volumen.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    oscilador.connect(volumen).connect(salida);
    oscilador.start(t);
    oscilador.stop(t + duracion + 0.02);
  }

  // Campanita de cristal: un tono con armónicos "de campana" (no múltiplos exactos) que se apagan solos.
  function campanita(t, frecuencia, fuerza, duracion) {
    for (const [multiplo, amplitud] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const oscilador = contexto.createOscillator();
      const volumen = contexto.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = frecuencia * multiplo;
      volumen.gain.setValueAtTime(0.0001, t);
      volumen.gain.exponentialRampToValueAtTime(fuerza * amplitud, t + 0.004);
      volumen.gain.exponentialRampToValueAtTime(0.0001, t + duracion / Math.sqrt(multiplo));
      oscilador.connect(volumen).connect(salida);
      oscilador.start(t);
      oscilador.stop(t + duracion + 0.05);
    }
  }

  // Soplido: ruido filtrado que barre de agudo a grave (agua que se va).
  function soplido(t, duracion, desde, hasta, fuerza) {
    const largo = Math.floor(contexto.sampleRate * duracion);
    const buffer = contexto.createBuffer(1, largo, contexto.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
    const ruido = contexto.createBufferSource();
    ruido.buffer = buffer;
    const filtro = contexto.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = 1.2;
    filtro.frequency.setValueAtTime(desde, t);
    filtro.frequency.exponentialRampToValueAtTime(hasta, t + duracion);
    const volumen = contexto.createGain();
    volumen.gain.setValueAtTime(0.0001, t);
    volumen.gain.exponentialRampToValueAtTime(fuerza, t + duracion * 0.25);
    volumen.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    ruido.connect(filtro).connect(volumen).connect(salida);
    ruido.start(t);
    ruido.stop(t + duracion);
  }

  const SONIDOS = {
    // Marcar como hecha: burbuja que sube + dos notas de cristal (Sol y Do agudos)
    hecha(t) {
      burbuja(t, 420, 1400, 0.22, 0.5);
      campanita(t + 0.07, 1568, 0.16, 0.55);
      campanita(t + 0.14, 2093, 0.11, 0.5);
    },
    // Volver a pendiente: la burbuja al revés, bajando y más suave
    pendiente(t) {
      burbuja(t, 1250, 430, 0.24, 0.42);
    },
    // Quitar las hechas: soplido + cuatro burbujas que bajan en cascada
    quitar(t) {
      soplido(t, 0.45, 2600, 380, 0.3);
      [880, 740, 620, 520].forEach((f, i) => burbuja(t + 0.05 + i * 0.07, f * 1.25, f, 0.14, 0.4 - i * 0.05));
    },
    // Eliminar una sola tarea: versión corta del anterior
    eliminar(t) {
      soplido(t, 0.28, 2200, 500, 0.22);
      burbuja(t + 0.04, 900, 600, 0.14, 0.36);
    },
  };

  function tocar(nombre) {
    if (!activo || !SONIDOS[nombre]) return;
    if (!preparar()) return;
    try { SONIDOS[nombre](contexto.currentTime + 0.02); } catch { /* un sonido nunca debe romper la app */ }
  }

  function pintarInterruptor() {
    const boton = $('#op-sonido');
    boton.setAttribute('aria-checked', String(activo));
    boton.querySelector('use').setAttribute('href', activo ? '#i-altavoz' : '#i-silencio');
    $('#sonido-estado').textContent = activo ? 'Al marcar, desmarcar y quitar tareas' : 'Desactivados';
  }

  function alternarActivo() {
    activo = !activo;
    guardarPreferencia('sonido', activo);
    pintarInterruptor();
    if (activo) tocar('hecha');            // muestra cómo suena al activarlo
  }

  return { tocar, alternarActivo, pintarInterruptor };
})();

/* ============================== 2. Guardar en el teléfono ============================== */
function tareaValida(t) {
  return Boolean(t) && typeof t === 'object'
    && typeof t.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(t.id)
    && typeof t.texto === 'string' && t.texto.trim().length > 0 && t.texto.length <= MAX_TEXTO
    && typeof t.hecha === 'boolean' && typeof t.importante === 'boolean'
    && Number.isFinite(t.creada) && (t.hechaEn === null || Number.isFinite(t.hechaEn));
}

function leerTareas() {
  try {
    const texto = localStorage.getItem(CLAVE);
    if (texto === null) return [];
    const datos = JSON.parse(texto);
    if (!Array.isArray(datos)) return [];
    const vistos = new Set();
    return datos.filter(t => tareaValida(t) && !vistos.has(t.id) && vistos.add(t.id));
  } catch {
    $('#aviso-almacen').hidden = false;
    return [];
  }
}

let persistenciaPedida = false;
function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(tareas));
    $('#aviso-almacen').hidden = true;
  } catch {
    $('#aviso-almacen').hidden = false;
    return;
  }
  // Pide al navegador que no borre estos datos aunque el teléfono se quede sin espacio.
  if (!persistenciaPedida && navigator.storage && navigator.storage.persist) {
    persistenciaPedida = true;
    navigator.storage.persist().catch(() => {});
  }
}

let tareas = leerTareas();
let filtro = leerPreferencia('filtro', 'todas');
if (!['todas', 'pendientes', 'hechas'].includes(filtro)) filtro = 'todas';

// Si la app está abierta en dos pestañas, ambas se mantienen iguales.
addEventListener('storage', e => {
  if (e.key !== CLAVE) return;
  cerrarEdicion(false);
  tareas = leerTareas();
  render({ animar: false });
});

function buscar(id) { return tareas.find(t => t.id === id); }
function visibles() {
  if (filtro === 'pendientes') return tareas.filter(t => !t.hecha);
  if (filtro === 'hechas') return tareas.filter(t => t.hecha);
  return tareas.slice();
}

/* ============================== 3. Dibujo de la lista ============================== */
const lista = $('#tareas');
const filas = new Map();

function crearFila(t) {
  const li = document.createElement('li');
  li.className = 'tarea';
  li.dataset.id = t.id;

  const asa = document.createElement('span');
  asa.className = 'asa';
  asa.setAttribute('aria-hidden', 'true');
  asa.append(icono('asa'));

  const celda = document.createElement('span');
  celda.className = 'celda-marca';
  const marcar = document.createElement('button');
  marcar.type = 'button';
  marcar.className = 'marcar';
  marcar.dataset.accion = 'alternar';
  marcar.setAttribute('role', 'checkbox');
  const burbuja = document.createElement('span');
  burbuja.className = 'burbuja';
  const agua = document.createElement('span');
  agua.className = 'agua';
  const reflejo = document.createElement('span');
  reflejo.className = 'reflejo';
  burbuja.append(agua, icono('check'), reflejo);
  marcar.append(burbuja);
  celda.append(marcar);

  const texto = document.createElement('button');
  texto.type = 'button';
  texto.className = 'texto';
  texto.dataset.accion = 'editar';
  texto.append(document.createElement('span'));

  const estrella = document.createElement('span');
  estrella.className = 'marca-importante';
  estrella.append(icono('estrella'));

  li.append(asa, celda, texto, estrella);
  return li;
}

function pintarFila(li, t) {
  li.classList.toggle('hecha', t.hecha);
  li.classList.toggle('importante', t.importante);
  li.querySelector('.texto > span').textContent = t.texto;
  li.querySelector('.texto').setAttribute('aria-label', `Editar: ${recortar(t.texto, 80)}${t.importante ? ' (importante)' : ''}`);
  li.querySelector('.marca-importante').hidden = !t.importante;
  const marcar = li.querySelector('.marcar');
  marcar.setAttribute('aria-checked', String(t.hecha));
  marcar.setAttribute('aria-label', recortar(t.texto, 80));
}

function posiciones() {
  const mapa = new Map();
  for (const [id, li] of filas) if (li.isConnected) mapa.set(id, li.getBoundingClientRect().top);
  return mapa;
}

function siguienteLibre(nodo) {
  let n = nodo ? nodo.nextElementSibling : lista.firstElementChild;
  while (n && n.classList.contains('saliendo')) n = n.nextElementSibling;
  return n;
}

function quitarFila(li, animar) {
  li.classList.add('saliendo');
  if (!animar) { li.remove(); return; }
  const alto = li.offsetHeight;
  li.style.overflow = 'hidden';
  li.animate([
    { opacity: 1, transform: 'none', height: alto + 'px', minHeight: alto + 'px', marginBottom: '8px', paddingTop: '6px', paddingBottom: '6px' },
    { opacity: 0, transform: 'translateX(26px) scale(.97)', height: '0px', minHeight: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' },
  ], { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => li.remove();
}

// Reutiliza las filas y anima solo lo que cambió (técnica FLIP).
function render({ animar = true, desde = null, conVacio = true } = {}) {
  const anim = animar && conAnimacion();
  const antes = desde ? (conAnimacion() ? desde : null) : (anim ? posiciones() : null);
  const vis = visibles();
  const ids = new Set(vis.map(t => t.id));

  for (const [id, li] of filas) {
    if (!ids.has(id)) { filas.delete(id); quitarFila(li, anim); }
  }
  const nuevas = [];
  let anterior = null;
  for (const t of vis) {
    let li = filas.get(t.id);
    if (!li) { li = crearFila(t); filas.set(t.id, li); nuevas.push(li); }
    if (!li.classList.contains('editando')) pintarFila(li, t);
    const referencia = siguienteLibre(anterior);
    if (referencia !== li) lista.insertBefore(li, referencia);
    anterior = li;
  }
  if (antes) {
    for (const [id, li] of filas) {
      const y0 = antes.get(id);
      if (y0 === undefined) continue;
      const dy = y0 - li.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 340, easing: CURVA });
    }
  }
  if (anim) {
    for (const li of nuevas) {
      li.animate([
        { opacity: 0, transform: 'translateY(10px) scale(.97)', filter: 'blur(4px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' },
      ], { duration: 420, easing: CURVA });
    }
  }
  actualizarResumen(conVacio);
}

function actualizarResumen(conVacio = true) {
  const total = tareas.length;
  const hechas = tareas.filter(t => t.hecha).length;
  const pendientes = total - hechas;
  const pct = total ? Math.round((hechas * 100) / total) : 0;

  $('#liquido').style.setProperty('--p', String(pct));
  $('#tubo').setAttribute('aria-valuenow', String(pct));
  $('#progreso-cuenta').textContent = !total ? 'Sin tareas todavía'
    : hechas === total ? `Todo hecho: ${total} de ${total}` : `${hechas} de ${total} hechas`;
  $('#progreso-pct').textContent = pct + '%';

  const cuentas = { todas: total, pendientes, hechas };
  for (const [clave, valor] of Object.entries(cuentas)) document.querySelector(`[data-cuenta="${clave}"]`).textContent = valor;
  moverMarcaFiltro();

  const limpiar = $('#limpiar');
  limpiar.hidden = hechas === 0;
  limpiar.textContent = `Quitar hechas (${hechas})`;
  if (conVacio) pintarVacio(cuentas[filtro], total);
}

function pintarVacio(cantidadVisible, total) {
  const vacio = $('#vacio');
  if (cantidadVisible > 0) { vacio.hidden = true; return; }
  let titulo;
  let texto;
  if (total === 0) {
    titulo = 'Tu lista está vacía';
    texto = 'Escribe abajo lo que tienes que hacer y toca el botón verde.';
  } else if (filtro === 'pendientes') {
    titulo = 'No te queda nada pendiente';
    texto = 'Buen trabajo. Lo que terminaste está en «Hechas».';
  } else {
    titulo = 'Aún no terminas ninguna tarea';
    texto = 'Toca la burbuja de una tarea para marcarla como hecha.';
  }
  $('#vacio-titulo').textContent = titulo;
  $('#vacio-texto').textContent = texto;
  vacio.hidden = false;
}

/* ============================== 4. Añadir, marcar, editar, eliminar ============================== */
function errorCampo(mensaje) {
  const campo = $('#texto-nueva');
  $('#error-nueva').textContent = mensaje;
  campo.setAttribute('aria-invalid', 'true');
  sacudir(campo);
  vibrar([12, 40, 12]);
}
function limpiarError() {
  $('#error-nueva').textContent = '';
  $('#texto-nueva').removeAttribute('aria-invalid');
}
function sacudir(elemento) {
  elemento.classList.remove('sacude');
  void elemento.offsetWidth;
  elemento.classList.add('sacude');
}
$('#texto-nueva').addEventListener('input', limpiarError);

$('#form-nueva').addEventListener('submit', evento => {
  evento.preventDefault();
  const campo = $('#texto-nueva');
  const texto = limpiarTexto(campo.value);
  if (!texto) return errorCampo('Escribe la tarea antes de añadirla.');
  if (texto.length > MAX_TEXTO) return errorCampo(`La tarea puede tener hasta ${MAX_TEXTO} caracteres.`);
  if (tareas.length >= MAX_TAREAS) return errorCampo('Llegaste al máximo de 500 tareas. Quita las hechas para seguir.');

  limpiarError();
  cerrarEdicion(true);
  const nueva = { id: nuevoId(), texto, hecha: false, importante: false, creada: Date.now(), hechaEn: null };
  tareas.push(nueva);
  guardar();
  campo.value = '';                       // el teclado sigue abierto para añadir otra
  if (filtro === 'hechas') cambiarFiltro('todas', false);
  render();
  const li = filas.get(nueva.id);
  if (li) li.scrollIntoView({ block: 'nearest', behavior: conAnimacion() ? 'smooth' : 'auto' });
});

function salpicar(li) {
  const celda = li.querySelector('.celda-marca');
  const onda = document.createElement('span');
  onda.className = 'onda-marca';
  celda.append(onda);
  onda.animate([{ transform: 'scale(.8)', opacity: 0.9 }, { transform: 'scale(2.3)', opacity: 0 }], { duration: 650, easing: CURVA })
    .onfinish = () => onda.remove();
  for (let i = 0; i < 6; i++) {
    const gotita = document.createElement('span');
    gotita.className = 'gotita';
    celda.append(gotita);
    const angulo = -Math.PI / 2 + (i - 2.5) * 0.45 + (Math.random() - 0.5) * 0.3;
    const distancia = 18 + Math.random() * 12;
    const dx = Math.cos(angulo) * distancia;
    const dy = Math.sin(angulo) * distancia;
    gotita.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(.9)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx * 1.15}px, ${dy * 0.6 + 12}px) scale(.4)`, opacity: 0 },
    ], { duration: 620, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => gotita.remove();
  }
}

function alternar(id) {
  const t = buscar(id);
  if (!t) return;
  t.hecha = !t.hecha;
  t.hechaEn = t.hecha ? Date.now() : null;
  guardar();
  Sonido.tocar(t.hecha ? 'hecha' : 'pendiente');
  const li = filas.get(id);
  if (li) {
    pintarFila(li, t);
    if (t.hecha) { vibrar(14); if (conAnimacion()) salpicar(li); }
  }
  const seVa = (filtro === 'pendientes' && t.hecha) || (filtro === 'hechas' && !t.hecha);
  if (seVa) {
    actualizarResumen(false);
    setTimeout(() => render(), 650);      // deja ver cómo se llena la burbuja antes de irse
  } else {
    actualizarResumen();
  }
}

/* Edición: tocar el texto lo convierte en un campo con su barra de botones */
let edicionActiva = null;                 // función para cerrar la edición abierta

function cerrarEdicion(guardarTexto) {
  if (edicionActiva) edicionActiva(guardarTexto);
}

function botonEdicion(nombreIcono, texto, accion) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'boton-edicion';
  b.dataset.edicion = accion;
  b.append(icono(nombreIcono), document.createTextNode(texto));
  return b;
}

function editar(id) {
  const t = buscar(id);
  const li = filas.get(id);
  if (!t || !li || li.classList.contains('editando')) return;
  cerrarEdicion(true);

  li.classList.add('editando');
  const boton = li.querySelector('.texto');
  const campo = document.createElement('input');
  campo.className = 'campo editor';
  campo.value = t.texto;
  campo.maxLength = MAX_TEXTO;
  campo.enterKeyHint = 'done';
  campo.autocomplete = 'off';
  campo.setAttribute('autocapitalize', 'sentences');
  campo.setAttribute('aria-label', 'Editar tarea');

  const barra = document.createElement('div');
  barra.className = 'barra-edicion';
  const botonImportante = botonEdicion('estrella', 'Importante', 'importante');
  botonImportante.setAttribute('aria-pressed', String(t.importante));
  const botonBorrar = botonEdicion('papelera', 'Eliminar', 'eliminar');
  botonBorrar.classList.add('peligro');
  const botonListo = botonEdicion('check', 'Listo', 'listo');
  botonListo.classList.add('principal');
  barra.append(botonImportante, botonBorrar, botonListo);

  boton.hidden = true;
  li.querySelector('.marca-importante').hidden = true;
  boton.after(campo);
  li.append(barra);
  campo.focus();
  campo.setSelectionRange(campo.value.length, campo.value.length);
  setTimeout(() => li.scrollIntoView({ block: 'nearest', behavior: conAnimacion() ? 'smooth' : 'auto' }), 300);

  let cerrado = false;
  function cerrar(guardarTexto) {
    if (cerrado) return;
    cerrado = true;
    edicionActiva = null;
    const nuevo = limpiarTexto(campo.value);
    if (guardarTexto && nuevo && nuevo !== t.texto) { t.texto = nuevo; guardar(); }
    campo.remove();
    barra.remove();
    boton.hidden = false;
    li.classList.remove('editando');
    pintarFila(li, t);
  }
  edicionActiva = cerrar;

  // Tocar un botón de la barra no debe cerrar el teclado antes de tiempo.
  barra.addEventListener('pointerdown', e => e.preventDefault());
  barra.addEventListener('click', e => {
    const b = e.target.closest('[data-edicion]');
    if (!b) return;
    if (b.dataset.edicion === 'importante') {
      t.importante = !t.importante;
      b.setAttribute('aria-pressed', String(t.importante));
      li.classList.toggle('importante', t.importante);
      guardar();
      vibrar(8);
    } else if (b.dataset.edicion === 'eliminar') {
      cerrar(false);
      eliminar(t.id);
    } else {
      if (!limpiarTexto(campo.value)) { sacudir(campo); return; }
      cerrar(true);
    }
  });
  campo.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!limpiarTexto(campo.value)) { sacudir(campo); return; }
      cerrar(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cerrar(false);
    }
  });
  campo.addEventListener('blur', () => cerrar(true));
}

const Aviso = (() => {
  const caja = $('#toast');
  const texto = $('#toast-texto');
  const boton = $('#toast-deshacer');
  let accion = null;
  let temporizador = null;

  function cerrar() {
    accion = null;
    clearTimeout(temporizador);
    caja.classList.remove('visible');
    setTimeout(() => { if (!caja.classList.contains('visible')) caja.hidden = true; }, 400);
  }
  boton.addEventListener('click', () => {
    const pendiente = accion;
    cerrar();
    if (pendiente) pendiente();
  });
  return {
    mostrar(mensaje, alDeshacer = null) {
      accion = alDeshacer;
      texto.textContent = mensaje;
      boton.hidden = !alDeshacer;
      caja.hidden = false;
      requestAnimationFrame(() => caja.classList.add('visible'));
      clearTimeout(temporizador);
      temporizador = setTimeout(cerrar, alDeshacer ? 6000 : 4000);
    },
  };
})();

function eliminar(id) {
  const indice = tareas.findIndex(t => t.id === id);
  if (indice < 0) return;
  const [quitada] = tareas.splice(indice, 1);
  guardar();
  render();
  vibrar(10);
  Sonido.tocar('eliminar');
  Aviso.mostrar(`Eliminaste «${recortar(quitada.texto, 28)}»`, () => {
    tareas.splice(Math.min(indice, tareas.length), 0, quitada);
    guardar();
    render();
  });
}

function quitarHechas() {
  const quitadas = [];
  tareas = tareas.filter((t, i) => {
    if (t.hecha) { quitadas.push([i, t]); return false; }
    return true;
  });
  if (!quitadas.length) { Aviso.mostrar('No hay tareas hechas para quitar.'); return; }
  guardar();
  render();
  Sonido.tocar('quitar');
  vibrar([10, 30, 10]);
  const n = quitadas.length;
  Aviso.mostrar(`Quitaste ${n} ${n === 1 ? 'tarea hecha' : 'tareas hechas'}`, () => {
    for (const [i, t] of quitadas) tareas.splice(Math.min(i, tareas.length), 0, t);
    guardar();
    render();
  });
}

lista.addEventListener('click', e => {
  const b = e.target.closest('button[data-accion]');
  if (!b) return;
  const li = b.closest('.tarea');
  if (!li || li.classList.contains('saliendo')) return;
  if (b.dataset.accion === 'alternar') alternar(li.dataset.id);
  else if (b.dataset.accion === 'editar') editar(li.dataset.id);
});
$('#limpiar').addEventListener('click', quitarHechas);

/* Filtros */
const marcaFiltro = $('#filtro-marca');
function moverMarcaFiltro() {
  const b = document.querySelector(`.filtro[data-filtro="${filtro}"]`);
  if (!b) return;
  marcaFiltro.style.setProperty('--x', b.offsetLeft + 'px');
  marcaFiltro.style.setProperty('--w', b.offsetWidth + 'px');
}
function cambiarFiltro(nuevo, pintar = true) {
  filtro = nuevo;
  guardarPreferencia('filtro', nuevo);
  for (const b of document.querySelectorAll('.filtro')) b.setAttribute('aria-pressed', String(b.dataset.filtro === nuevo));
  moverMarcaFiltro();
  if (pintar) { cerrarEdicion(true); render(); }
}
$('#filtros').addEventListener('click', e => {
  const b = e.target.closest('.filtro');
  if (b && b.dataset.filtro !== filtro) cambiarFiltro(b.dataset.filtro);
});
addEventListener('resize', moverMarcaFiltro);

/* Reordenar arrastrando el asa (dedo o ratón), o con Alt + ↑ / ↓ en un teclado */
function moverVisible(desde, hasta) {
  const ids = visibles().map(t => t.id);
  const [movida] = ids.splice(desde, 1);
  ids.splice(hasta, 0, movida);
  const enLista = new Set(ids);
  const porId = new Map(tareas.map(t => [t.id, t]));
  const huecos = [];
  tareas.forEach((t, i) => { if (enLista.has(t.id)) huecos.push(i); });
  huecos.forEach((posicion, k) => { tareas[posicion] = porId.get(ids[k]); });
  guardar();
}

lista.addEventListener('pointerdown', e => {
  const asa = e.target.closest('.asa');
  if (!asa || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const li = asa.closest('.tarea');
  if (!li || li.classList.contains('editando') || li.classList.contains('saliendo')) return;
  e.preventDefault();
  cerrarEdicion(true);

  const items = [...lista.children].filter(x => !x.classList.contains('saliendo'));
  const desde = items.indexOf(li);
  if (desde < 0) return;
  const cajas = items.map(x => x.getBoundingClientRect());
  const alto = cajas[desde].height + 8;
  const y0 = e.clientY;
  let destino = desde;

  asa.setPointerCapture(e.pointerId);
  li.classList.add('arrastrando');
  lista.classList.add('ordenando');
  vibrar(10);

  function mover(ev) {
    const dy = ev.clientY - y0;
    li.style.transform = `translateY(${dy}px)`;
    const centro = cajas[desde].top + cajas[desde].height / 2 + dy;
    const anterior = destino;
    destino = desde;
    for (let i = 0; i < desde; i++) {
      if (centro < cajas[i].top + cajas[i].height / 2) { destino = i; break; }
    }
    if (destino === desde) {
      for (let i = items.length - 1; i > desde; i--) {
        if (centro > cajas[i].top + cajas[i].height / 2) { destino = i; break; }
      }
    }
    if (destino !== anterior) vibrar(5);
    items.forEach((x, i) => {
      if (x === li) return;
      let desplazamiento = 0;
      if (destino > desde && i > desde && i <= destino) desplazamiento = -alto;
      if (destino < desde && i >= destino && i < desde) desplazamiento = alto;
      x.style.transform = desplazamiento ? `translateY(${desplazamiento}px)` : '';
    });
  }

  function soltar() {
    asa.removeEventListener('pointermove', mover);
    asa.removeEventListener('pointerup', soltar);
    asa.removeEventListener('pointercancel', soltar);
    const visual = posiciones();
    lista.classList.remove('ordenando');
    li.classList.remove('arrastrando');
    for (const x of items) x.style.transform = '';
    if (destino !== desde) {
      moverVisible(desde, destino);
      anunciar(`Tarea movida a la posición ${destino + 1} de ${items.length}`);
    }
    render({ animar: false, desde: visual });
  }

  asa.addEventListener('pointermove', mover);
  asa.addEventListener('pointerup', soltar);
  asa.addEventListener('pointercancel', soltar);
});

lista.addEventListener('keydown', e => {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  const li = e.target.closest('.tarea');
  if (!li || li.classList.contains('editando')) return;
  e.preventDefault();
  const ids = visibles().map(t => t.id);
  const i = ids.indexOf(li.dataset.id);
  const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  const enfocado = e.target;
  moverVisible(i, j);
  render();
  enfocado.focus();
  anunciar(`Tarea movida a la posición ${j + 1} de ${ids.length}`);
});

/* ============================== 5. Menú: instalar, copia de seguridad ============================== */
const menu = $('#menu');

function abrirMenu() {
  cerrarEdicion(true);
  menu.showModal();
  if (conAnimacion()) menu.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 340, easing: CURVA });
}
function cerrarMenu() {
  if (!menu.open) return;
  if (!conAnimacion()) { menu.close(); return; }
  menu.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)' })
    .onfinish = () => menu.close();
}
$('#boton-menu').addEventListener('click', abrirMenu);
$('#cerrar-menu').addEventListener('click', cerrarMenu);
menu.addEventListener('click', e => { if (e.target === menu) cerrarMenu(); });   // toque fuera de la hoja
menu.addEventListener('cancel', e => { e.preventDefault(); cerrarMenu(); });     // botón atrás / Esc

$('#op-limpiar').addEventListener('click', () => { cerrarMenu(); quitarHechas(); });
$('#op-sonido').addEventListener('click', () => Sonido.alternarActivo());

async function exportar() {
  const fecha = new Date().toISOString().slice(0, 10);
  const nombre = `aero-tareas-${fecha}.json`;
  const contenido = JSON.stringify({ app: 'aero-tareas', version: 1, exportado: new Date().toISOString(), tareas }, null, 2);
  const archivo = new File([contenido], nombre, { type: 'application/json' });
  // En el celular se abre el menú de compartir (Drive, WhatsApp, correo…). Si no se puede, se descarga.
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Copia de Aero Tareas' });
      cerrarMenu();
      Aviso.mostrar('Copia de seguridad lista.');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;     // cerraste el menú de compartir
    }
  }
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  cerrarMenu();
  Aviso.mostrar(`Copia guardada en Descargas: ${nombre}`);
}
$('#op-exportar').addEventListener('click', exportar);

const entradaArchivo = $('#archivo-importar');
$('#op-importar').addEventListener('click', () => entradaArchivo.click());
entradaArchivo.addEventListener('change', async () => {
  const archivo = entradaArchivo.files && entradaArchivo.files[0];
  entradaArchivo.value = '';
  if (!archivo) return;
  cerrarMenu();
  if (archivo.size > 2_000_000) { Aviso.mostrar('Ese archivo es demasiado grande para ser una copia.'); return; }
  let datos;
  try { datos = JSON.parse(await archivo.text()); } catch { Aviso.mostrar('Ese archivo no es una copia de Aero Tareas.'); return; }
  // Acepta la copia del celular ({ tareas: [...] }) y también el tareas.json de la versión de PC ([...]).
  const recibidas = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.tareas) ? datos.tareas : null);
  if (!recibidas) { Aviso.mostrar('Ese archivo no es una copia de Aero Tareas.'); return; }

  const existentes = new Set(tareas.map(t => t.id));
  const nuevas = [];
  let repetidas = 0;
  for (const t of recibidas) {
    if (!tareaValida(t)) continue;
    if (existentes.has(t.id)) { repetidas++; continue; }
    if (tareas.length + nuevas.length >= MAX_TAREAS) break;
    existentes.add(t.id);
    nuevas.push({ id: t.id, texto: limpiarTexto(t.texto), hecha: t.hecha, importante: t.importante, creada: t.creada, hechaEn: t.hechaEn });
  }
  if (!nuevas.length) {
    Aviso.mostrar(repetidas ? 'Todas las tareas de esa copia ya estaban en tu lista.' : 'Esa copia no tiene tareas válidas.');
    return;
  }
  tareas.push(...nuevas);
  guardar();
  if (filtro !== 'todas') cambiarFiltro('todas', false);
  render();
  const n = nuevas.length;
  Aviso.mostrar(`Recuperaste ${n} ${n === 1 ? 'tarea' : 'tareas'}${repetidas ? ` (${repetidas} ya estaban)` : ''}`, () => {
    const ids = new Set(nuevas.map(t => t.id));
    tareas = tareas.filter(t => !ids.has(t.id));
    guardar();
    render();
  });
});

// Instalar: Android (Chrome/Brave/Edge) avisa con «beforeinstallprompt»; iPhone se instala desde Compartir.
let pedidoInstalar = null;
const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  pedidoInstalar = e;
  $('#op-instalar').hidden = false;
  $('#banner-instalar').hidden = false;
});
async function instalar() {
  if (!pedidoInstalar) return;
  cerrarMenu();
  pedidoInstalar.prompt();
  const { outcome } = await pedidoInstalar.userChoice;
  pedidoInstalar = null;
  $('#op-instalar').hidden = true;
  $('#banner-instalar').hidden = true;
  if (outcome === 'accepted') Aviso.mostrar('Aero Tareas se está instalando en tu pantalla de inicio.');
}
$('#op-instalar').addEventListener('click', instalar);
$('#chip-instalar').addEventListener('click', instalar);
addEventListener('appinstalled', () => { $('#op-instalar').hidden = true; $('#banner-instalar').hidden = true; });
$('#nota-ios').hidden = instalada || navigator.standalone !== false;   // navigator.standalone solo existe en iPhone/iPad

/* ============================== 6. Ambiente e inicio ============================== */
function pintarFecha() {
  const texto = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('#fecha').textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
}

function crearBurbujas() {
  if (!conAnimacion()) return;
  const caja = $('#burbujas');
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('span');
    b.className = 'burbuja-amb';
    const duracion = 18 + Math.random() * 20;
    b.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
    b.style.setProperty('--tam', (8 + Math.random() ** 2 * 36).toFixed(0) + 'px');
    b.style.setProperty('--dur', duracion.toFixed(1) + 's');
    b.style.setProperty('--retraso', (-Math.random() * duracion).toFixed(1) + 's');
    b.style.setProperty('--deriva', ((Math.random() - 0.5) * 60).toFixed(0) + 'px');
    b.style.setProperty('--opacidad', (0.3 + Math.random() * 0.4).toFixed(2));
    caja.append(b);
  }
}

pintarFecha();
crearBurbujas();
Sonido.pintarInterruptor();
cambiarFiltro(filtro, false);
render({ animar: false });
if (document.fonts) document.fonts.ready.then(moverMarcaFiltro);

// Funciona sin internet: el «service worker» guarda la app en el teléfono.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
