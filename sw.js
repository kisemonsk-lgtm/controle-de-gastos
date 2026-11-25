/* Cache do app para funcionar mesmo sem internet */
const CACHE = "gastos-v1";
const ARQUIVOS = ["./", "./index.html", "./estilo.css", "./app.js", "./categorias.js",
  "./nuvem.js", "./firebase-config.js", "./manifest.webmanifest", "./icone.svg"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (ev) => {
  if (ev.request.method !== "GET") return;
  ev.respondWith(caches.match(ev.request).then((resp) => resp || fetch(ev.request)
    .then((r) => {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put(ev.request, copia)).catch(() => {});
      return r;
    })
    .catch(() => caches.match("./index.html"))));
});
