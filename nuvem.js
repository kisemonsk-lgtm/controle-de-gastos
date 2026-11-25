/* =========================================================
   Nuvem (Firebase Firestore) — Sistema de Gastos
   ---------------------------------------------------------
   - Com firebase-config.js preenchido, os gastos ficam no
     Firestore e aparecem iguais em todos os aparelhos.
   - Sem config, o app funciona só no navegador (localStorage).
   - O estado tem a forma:
       { lancamentos: [ {id, data, mes, descricao, categoria,
                         valor, pagamento, obs, obrig, at} ],
         rendas: { "2025-11": 3500, ... },
         atualizadoEm: <ms> }
   - Ao juntar duas versões, o que foi lançado em outro
     aparelho nunca se perde: os lançamentos são unidos por id
     (vence o carimbo "at" mais novo) e as rendas, mês a mês.
   ========================================================= */
(function () {
  "use strict";

  const cfg = window.FIREBASE_CONFIG || {};
  const COLECAO = window.FIRESTORE_COLECAO || "gastos-casa";
  const DOC = window.FIRESTORE_DOC || "principal";
  const configurada = !!(cfg && cfg.apiKey && cfg.projectId && String(cfg.apiKey).indexOf("COLE") < 0);

  let db = null;
  let timer = null;
  let avisarTela = () => {};

  /* ---------- junta duas versões do estado ---------- */
  function juntar(a, b) {
    if (!a) return b;
    if (!b) return a;

    const base = (Number(b.atualizadoEm) || 0) > (Number(a.atualizadoEm) || 0) ? b : a;

    // lançamentos: união por id, vence o mais novo (at); excluídos vencem
    const porId = {};
    (a.lancamentos || []).concat(b.lancamentos || []).forEach((l) => {
      if (!l || !l.id) return;
      const antigo = porId[l.id];
      if (!antigo) { porId[l.id] = l; return; }
      const ta = Number(antigo.at) || 0, tb = Number(l.at) || 0;
      porId[l.id] = tb >= ta ? l : antigo;
    });

    // rendas: o valor mais novo por mês (guarda carimbo em rendasAt)
    const rendas = Object.assign({}, a.rendas || {}, b.rendas || {});
    const rendasAt = Object.assign({}, a.rendasAt || {}, b.rendasAt || {});
    const meses = new Set(Object.keys(a.rendas || {}).concat(Object.keys(b.rendas || {})));
    meses.forEach((m) => {
      const ta = Number((a.rendasAt || {})[m]) || 0;
      const tb = Number((b.rendasAt || {})[m]) || 0;
      if (ta || tb) {
        const fonte = tb >= ta ? b : a;
        if (fonte.rendas && m in fonte.rendas) rendas[m] = fonte.rendas[m];
        rendasAt[m] = Math.max(ta, tb);
      }
    });

    return Object.assign({}, base, {
      lancamentos: Object.keys(porId).map((k) => porId[k]).filter((l) => !l.excluido),
      rendas,
      rendasAt,
      atualizadoEm: Math.max(Number(a.atualizadoEm) || 0, Number(b.atualizadoEm) || 0)
    });
  }

  /* ---------- impressão digital (sem carimbos) ---------- */
  function impressao(e) {
    if (!e) return "";
    const lista = (e.lancamentos || [])
      .filter((l) => !l.excluido)
      .map((l) => [l.id, l.data, l.descricao, l.categoria, Number(l.valor) || 0, l.pagamento || "", l.obrig ? 1 : 0, l.obs || ""])
      .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    return JSON.stringify({ l: lista, r: e.rendas || {} });
  }

  function status(txt, estado) {
    try { avisarTela(txt, estado); } catch (e) {}
  }

  /* ---------- iniciar ---------- */
  function iniciar(aoReceber) {
    if (!configurada) {
      status("só neste navegador", "off");
      return Promise.resolve(null);
    }
    try {
      if (!window.firebase) {
        status("nuvem indisponível", "erro");
        return Promise.resolve(null);
      }
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      db = firebase.firestore();
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      status("nuvem ligada", "ok");
    } catch (e) {
      console.warn("Firebase não iniciou:", e);
      status("nuvem com erro", "erro");
      return Promise.resolve(null);
    }

    // escuta mudanças de outro aparelho
    db.collection(COLECAO).doc(DOC).onSnapshot((doc) => {
      if (!doc.exists) return;
      const d = doc.data() || {};
      const dados = d.dados;
      if (!dados || !Array.isArray(dados.lancamentos)) return;
      try { aoReceber(dados); } catch (e) { console.warn(e); }
    }, (err) => {
      console.warn("Falha ao ler da nuvem:", err);
      status("nuvem sem conexão", "erro");
    });

    return baixar();
  }

  /* ---------- baixar (ao abrir) ---------- */
  function baixar() {
    if (!db) return Promise.resolve(null);
    return db.collection(COLECAO).doc(DOC).get({ source: "server" })
      .then((doc) => (doc.exists ? (doc.data() || {}).dados : null))
      .catch(() => db.collection(COLECAO).doc(DOC).get()
        .then((doc) => (doc.exists ? (doc.data() || {}).dados : null)))
      .catch(() => null);
  }

  /* ---------- salvar (com atraso, juntando com a nuvem) ---------- */
  function agendarSalvar(estado) {
    if (!db) return;
    clearTimeout(timer);
    status("enviando…", "salvando");
    timer = setTimeout(() => {
      db.collection(COLECAO).doc(DOC).get()
        .then((doc) => {
          const nuvem = doc.exists ? (doc.data() || {}).dados : null;
          return enviar(nuvem ? juntar(estado, nuvem) : estado);
        })
        .catch(() => enviar(estado));
    }, 700);
  }

  function enviar(estado) {
    if (!db) return;
    const agora = Date.now();
    const copia = JSON.parse(JSON.stringify(estado));
    copia.atualizadoEm = agora;
    return db.collection(COLECAO).doc(DOC).set({
      dados: copia,
      atualizadoEm: agora
    }, { merge: true })
      .then(() => status("salvo na nuvem", "ok"))
      .catch((e) => {
        console.warn("Falha ao salvar na nuvem:", e);
        status("não salvou na nuvem", "erro");
      });
  }

  window.GastosNuvem = {
    iniciar,
    baixar,
    agendarSalvar,
    juntar,
    impressao,
    configurada: () => configurada,
    ligada: () => !!db,
    aoMudarStatus: (fn) => { avisarTela = fn; }
  };
})();
