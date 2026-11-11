// Aero Tareas — service worker: guarda la app en el teléfono para que abra sin internet.
// Al publicar cambios, sube el número de VERSION para que los teléfonos descarguen la nueva.
'use strict';

const VERSION = 'aero-tareas-v4';
const ARCHIVOS = [
  './',
  './index.html',
  './estilos.css',
  './app.js',
  './manifest.webmanifest',
  './iconos/icono.svg',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-512.png',
  './iconos/apple-touch-icon.png',
];

// Instalación: descarga y guarda todos los archivos de la app.
self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

// Activación: borra las copias de versiones viejas.
self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(c => c !== VERSION).map(c => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// Cada petición: responde al instante con la copia guardada y, de fondo, la actualiza si hay internet.
self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  const desdeRed = fetch(peticion)
    .then(respuesta => {
      if (respuesta.ok) {
        const copia = respuesta.clone();
        caches.open(VERSION).then(cache => cache.put(peticion, copia));
      }
      return respuesta;
    });

  evento.respondWith(
    caches.match(peticion, { ignoreSearch: true }).then(guardada => {
      if (guardada) return guardada;
      return desdeRed.catch(() => (peticion.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
  evento.waitUntil(desdeRed.then(() => {}, () => {}));
});
