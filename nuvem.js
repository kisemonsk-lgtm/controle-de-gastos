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
  const PONTO_COLECAO = "ponto-cas";
  const PONTO_DOC = "principal";
  const CHAVE_REST = String(cfg.apiKey || "");
  const configurada = !!(cfg && cfg.apiKey && cfg.projectId && String(cfg.apiKey).indexOf("COLE") < 0);

  let db = null;
  let ref = null;          // referência que está funcionando
  let modoREST = false;    // true quando só o caminho REST responde
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

    // o documento do ponto responde: é por ele que lemos e gravamos
    return baixarREST().then((dadosREST) => {
      modoREST = true;
      if (dadosREST) {
        status("nuvem ligada", "ok");
        aoReceber(dadosREST);
      } else {
        // ainda não existe nada de gastos na nuvem: liga e começa o envio
        status("nuvem ligada", "ok");
        enviarREST({ lancamentos: [], rendas: {}, rendasAt: {}, atualizadoEm: Date.now() });
      }
      return dadosREST;
    });

    function tentarSDK() {
    const proprio = db.collection(COLECAO).doc(DOC);
    const noPonto = db.collection(PONTO_COLECAO).doc(PONTO_DOC);

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
        .catch(() => {
          // 3) se as regras do SDK barram, tenta o caminho REST do Firestore
          return baixarREST().then((dados) => {
            if (dados) {
              modoREST = true;
              status("nuvem ligada", "ok");
              aoReceber(dados);
            } else {
              status("nuvem bloqueada (permissão)", "erro");
            }
            return dados;
          });
        }));
    }

    function usar(referencia) {
      ref = referencia;   // usado só para gravar (set com merge)
      status("nuvem ligada", "ok");
    }
  }

  /* ---------- baixar ---------- */
  function baixar() {
    if (CHAVE_REST) {
      return baixarREST().then((d) => {
        if (d) { modoREST = true; return d; }
        if (!ref) return null;
        return ref.get({ source: "server" })
          .then((doc) => {
            if (!doc.exists) return null;
            const dd = doc.data() || {};
            return dd[CAMPO] || dd.dados || null;
          })
          .catch(() => null);
      });
    }
    if (!ref) return Promise.resolve(null);
    return ref.get({ source: "server" })
      .then((doc) => {
        if (!doc.exists) return null;
        const d = doc.data() || {};
        return d[CAMPO] || d.dados || null;
      })
      .catch(() => null);
  }

  /* ---------- REST (sem SDK, o mesmo caminho que o Google libera) ---------- */
  const REST_BASE = "https://firestore.googleapis.com/v1/projects/" + cfg.projectId +
    "/databases/(default)/documents/" + PONTO_COLECAO + "/" + PONTO_DOC;

  function valorREST(v) {
    if (v == null) return { nullValue: null };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(valorREST) } };
    if (typeof v === "object") {
      const fields = {};
      Object.keys(v).forEach((k) => { fields[k] = valorREST(v[k]); });
      return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
  }

  function lerREST(v) {
    if (!v) return null;
    if ("mapValue" in v) {
      const out = {};
      const f = v.mapValue.fields || {};
      Object.keys(f).forEach((k) => { out[k] = lerREST(f[k]); });
      return out;
    }
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(lerREST);
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return !!v.booleanValue;
    if ("stringValue" in v) return v.stringValue;
    if ("nullValue" in v) return null;
    return null;
  }

  function baixarREST() {
    if (!CHAVE_REST) return Promise.resolve(null);
    return fetch(REST_BASE + "?key=" + encodeURIComponent(CHAVE_REST))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const campo = d && d.fields && d.fields[CAMPO];
        const dados = campo ? lerREST(campo) : null;
        return dados && Array.isArray(dados.lancamentos) ? dados : null;
      })
      .catch(() => null);
  }

  function enviarREST(estado) {
    if (!CHAVE_REST) return Promise.resolve(false);
    status("enviando…", "salvando");
    const copia = JSON.parse(JSON.stringify(estado));
    copia.atualizadoEm = Date.now();
    const corpo = { fields: {} };
    corpo.fields[CAMPO] = valorREST(copia);
    corpo.fields[CAMPO + "Em"] = valorREST(copia.atualizadoEm);
    const url = REST_BASE + "?key=" + encodeURIComponent(CHAVE_REST) +
      "&updateMask.fieldPaths=" + CAMPO + "&updateMask.fieldPaths=" + CAMPO + "Em";
    return fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    }).then((r) => r.ok).catch(() => false);
  }

  /* ---------- salvar ---------- */
  function agendarSalvar(estado) {
    if (!ref && !modoREST && !CHAVE_REST) return;
    clearTimeout(timer);
    status("enviando…", "salvando");
    timer = setTimeout(() => {
      if (modoREST || !ref) {
        baixarREST().then((nuvem) => enviarREST(nuvem ? juntar(estado, nuvem) : estado))
          .then((ok) => {
            if (ok) { modoREST = true; status("salvo na nuvem", "ok"); }
            else status("não salvou na nuvem", "erro");
          });
        return;
      }
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
        console.warn("SDK não salvou, tentando REST:", e);
        return enviarREST(estado).then((ok) => {
          status(ok ? "salvo na nuvem" : "não salvou na nuvem", ok ? "ok" : "erro");
        });
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
