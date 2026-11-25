/* =========================================================
   Nuvem (Firebase Firestore) — Sistema de Gastos
   ---------------------------------------------------------
   Usa o mesmo documento do app de ponto, mas dentro de um
   campo próprio ("gastos"): as regras do Firestore liberam
   esse documento, e os dois sistemas não se misturam.
   Também tenta uma coleção própria (gastos-casa) se as
   regras permitirem; vence a que responder.

   Estado:
     { lancamentos: [ {id, data, mes, descricao, categoria,
                       valor, pagamento, obs, obrig, at} ],
       rendas: { "2025-11": 3500 },
       rendasAt: { "2025-11": <ms> },
       atualizadoEm: <ms> }
   ========================================================= */
(function () {
  "use strict";

  const cfg = window.FIREBASE_CONFIG || {};
  const COLECAO = window.FIRESTORE_COLECAO || "gastos-casa";
  const DOC = window.FIRESTORE_DOC || "principal";
  const CAMPO = window.FIRESTORE_CAMPO || "gastos";
  const configurada = !!(cfg && cfg.apiKey && cfg.projectId && String(cfg.apiKey).indexOf("COLE") < 0);

  let db = null;
  let ref = null;          // referência que está funcionando
  let timer = null;
  let avisarTela = () => {};

  /* ---------- junta duas versões do estado ---------- */
  function juntar(a, b) {
    if (!a) return b;
    if (!b) return a;

    const base = (Number(b.atualizadoEm) || 0) > (Number(a.atualizadoEm) || 0) ? b : a;

    const porId = {};
    (a.lancamentos || []).concat(b.lancamentos || []).forEach((l) => {
      if (!l || !l.id) return;
      const antigo = porId[l.id];
      if (!antigo) { porId[l.id] = l; return; }
      const ta = Number(antigo.at) || 0, tb = Number(l.at) || 0;
      porId[l.id] = tb >= ta ? l : antigo;
    });

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
      status("conectando…", "salvando");
    } catch (e) {
      console.warn("Firebase não iniciou:", e);
      status("nuvem com erro", "erro");
      return Promise.resolve(null);
    }

    // 1) coleção própria; se as regras negarem, 2) campo dentro do documento do ponto
    const proprio = db.collection(COLECAO).doc(DOC);
    const noPonto = db.collection("ponto-cas").doc("principal");

    return proprio.get({ source: "server" })
      .then((doc) => {
        usar(proprio, (d) => (d && d.dados) || null);
        return (doc.exists ? (doc.data() || {}).dados : null);
      })
      .catch(() => noPonto.get({ source: "server" })
        .then((doc) => {
          usar(noPonto, (d) => (d && d[CAMPO]) || null);
          return doc.exists ? ((doc.data() || {})[CAMPO] || null) : null;
        })
        .catch((err) => {
          console.warn("Sem permissão na nuvem:", err);
          status("nuvem sem permissão", "erro");
          return null;
        }));

    function usar(referencia, leitor) {
      ref = referencia;
      ref.onSnapshot((doc) => {
        if (!doc.exists) { status("nuvem ligada", "ok"); return; }
        const dados = leitor(doc.data() || {});
        if (!dados || !Array.isArray(dados.lancamentos)) { status("nuvem ligada", "ok"); return; }
        status("nuvem ligada", "ok");
        try { aoReceber(dados); } catch (e) { console.warn(e); }
      }, (err) => {
        console.warn("Falha ao ler da nuvem:", err);
        status("nuvem sem conexão", "erro");
      });
    }
  }

  /* ---------- baixar ---------- */
  function baixar() {
    if (!ref) return Promise.resolve(null);
    return ref.get({ source: "server" })
      .then((doc) => {
        if (!doc.exists) return null;
        const d = doc.data() || {};
        return d[CAMPO] || d.dados || null;
      })
      .catch(() => null);
  }

  /* ---------- salvar ---------- */
  function agendarSalvar(estado) {
    if (!ref) return;
    clearTimeout(timer);
    status("enviando…", "salvando");
    timer = setTimeout(() => {
      ref.get()
        .then((doc) => {
          const d = doc.exists ? (doc.data() || {}) : {};
          const nuvem = d[CAMPO] || d.dados || null;
          return enviar(nuvem ? juntar(estado, nuvem) : estado);
        })
        .catch(() => enviar(estado));
    }, 700);
  }

  function enviar(estado) {
    if (!ref) return;
    const agora = Date.now();
    const copia = JSON.parse(JSON.stringify(estado));
    copia.atualizadoEm = agora;
    const corpo = {};
    corpo[CAMPO] = copia;
    corpo[CAMPO + "Em"] = agora;
    return ref.set(corpo, { merge: true })
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
    ligada: () => !!ref,
    aoMudarStatus: (fn) => { avisarTela = fn; }
  };
})();
