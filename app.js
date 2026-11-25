/* =========================================================
   Gastos — Controle mensal
   ---------------------------------------------------------
   Estado, cálculos, gráficos (pizza, rosca, barras) e telas.
   Salva no navegador (localStorage) e na nuvem (nuvem.js).
   ========================================================= */
(function () {
  "use strict";

  const CATS = window.CATEGORIAS || [];
  const CHAVE = "gastos-estado-v1";
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  /* ---------------- estado ---------------- */
  let estado = { lancamentos: [], rendas: {}, rendasAt: {}, atualizadoEm: 0 };
  let mesAtual = mesHoje();
  let filtro = { texto: "", grupo: "" };
  let editando = null;   // lançamento em edição
  let pausaNuvem = false; // enquanto o usuário está digitando não aplica a nuvem

  function mesHoje() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function idNovo() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- formato ---------------- */
  const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const moedaCurta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

  function reais(v) {
    return moeda.format(Number(v) || 0);
  }
  function reaisCurto(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1000) return "R$ " + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + "k";
    return moedaCurta.format(n);
  }
  function dataBR(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.split("-");
    return d + "/" + m + "/" + (a || "").slice(2);
  }
  function diaMes(iso) {
    if (!iso) return "";
    return iso.split("-")[2] || "";
  }
  function mesDe(iso) {
    return (iso || "").slice(0, 7);
  }
  function nomeMes(chave) {
    const [a, m] = chave.split("-");
    return MESES[Number(m) - 1] + "/" + a.slice(2);
  }
  function nomeMesLongo(chave) {
    const [a, m] = chave.split("-");
    return MESES_LONGO[Number(m) - 1] + " de " + a;
  }
  function somaMes(chave, n) {
    const [a, m] = chave.split("-").map(Number);
    const d = new Date(a, m - 1 + n, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function numeroTexto(txt) {
    if (typeof txt === "number") return txt;
    let s = String(txt || "").trim().replace(/[R$\s]/g, "");
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function catInfo(nome) {
    return CATS.find((c) => c.nome === nome) || { nome: nome || "Outros", grupo: "Fora", obrig: false, cor: "#94a3b8" };
  }

  /* ---------------- gravar ---------------- */
  function salvarLocal() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (e) { console.warn(e); }
  }

  function salvar(silencioso) {
    estado.atualizadoEm = Date.now();
    salvarLocal();
    if (window.GastosNuvem) window.GastosNuvem.agendarSalvar(estado);
    if (!silencioso) marcarSelo();
  }

  function carregarLocal() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return null;
      const d = JSON.parse(bruto);
      if (!d || !Array.isArray(d.lancamentos)) return null;
      return d;
    } catch (e) { return null; }
  }

  /* ---------------- animação ---------------- */
  const SEM_MOVIMENTO = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animacoes = [];

  function cancelarAnimacoes() {
    while (animacoes.length) {
      const id = animacoes.pop();
      try { clearTimeout(id); cancelAnimationFrame(id); } catch (e) {}
    }
  }

  function animar(duracao, passo) {
    if (SEM_MOVIMENTO) { passo(1); return; }
    const inicio = Date.now();
    const passoMs = 1000 / 60;
    const tique = () => {
      const t = Math.min(1, (Date.now() - inicio) / duracao);
      const suave = 1 - Math.pow(1 - t, 3);          // easeOutCubic
      passo(suave);
      if (t < 1) animacoes.push(setTimeout(tique, passoMs));
    };
    tique();
  }

  /* ---------------- cálculos ---------------- */
  function doMes(chave) {
    return estado.lancamentos.filter((l) => !l.excluido && l.mes === chave);
  }
  function totalDoMes(chave) {
    return doMes(chave).reduce((s, l) => s + (Number(l.valor) || 0), 0);
  }
  function rendaDoMes(chave) {
    return Number(estado.rendas[chave]) || 0;
  }

  function porCategoria(lista) {
    const mapa = new Map();
    lista.forEach((l) => {
      const k = l.categoria || "Outros";
      mapa.set(k, (mapa.get(k) || 0) + (Number(l.valor) || 0));
    });
    return Array.from(mapa, ([nome, valor]) => Object.assign({ nome, valor }, catInfo(nome)))
      .sort((a, b) => b.valor - a.valor);
  }

  /* ---------------- nuvem ---------------- */
  function statusNuvem(txt, estadoTxt) {
    const caixa = $("#nuvem");
    const rotulo = $("#nuvemTexto");
    if (!caixa || !rotulo) return;
    caixa.dataset.estado = estadoTxt || "off";
    rotulo.textContent = txt;
  }

  function receberDaNuvem(dados) {
    if (pausaNuvem) return;
    if (window.GastosNuvem.impressao(dados) === window.GastosNuvem.impressao(estado)) return;
    const misturado = window.GastosNuvem.juntar(estado, dados);
    if (window.GastosNuvem.impressao(misturado) === window.GastosNuvem.impressao(estado)) return;
    estado = normalizar(misturado);
    salvarLocal();
    desenhar();
    marcarSelo();
  }

  function normalizar(d) {
    const e = {
      lancamentos: (d.lancamentos || []).filter((l) => l && l.id).map((l) => ({
        id: String(l.id),
        data: l.data || "",
        mes: l.mes || mesDe(l.data),
        descricao: l.descricao || "",
        categoria: l.categoria || "Outros",
        valor: Number(l.valor) || 0,
        pagamento: l.pagamento || "",
        obs: l.obs || "",
        obrig: l.obrig ? 1 : 0,
        excluido: !!l.excluido,
        at: Number(l.at) || 0
      })),
      rendas: d.rendas || {},
      rendasAt: d.rendasAt || {},
      atualizadoEm: Number(d.atualizadoEm) || 0
    };
    return e;
  }

  function marcarSelo() {
    const selo = $("#rodapeSelo");
    if (!selo) return;
    const quando = estado.atualizadoEm ? new Date(estado.atualizadoEm) : null;
    selo.textContent = quando
      ? "Última alteração: " + quando.toLocaleDateString("pt-BR") + " às " +
        quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "Nenhum lançamento ainda";
  }

  /* ---------------- tela: mês e chips ---------------- */
  function desenharMes() {
    $("#mes").value = mesAtual;
    $("#subtitulo").textContent = nomeMesLongo(mesAtual);

    const chips = $("#chipsMeses");
    chips.innerHTML = "";
    // 3 meses para trás e o atual + o próximo
    const lista = [-2, -1, 0, 1].map((n) => somaMes(mesAtual, n));
    // se o mês atual tem lançamentos fora dessa janela, mostra os 3 mais recentes com dados
    const comDados = Array.from(new Set(estado.lancamentos.filter((l) => !l.excluido).map((l) => l.mes)))
      .sort().reverse().slice(0, 3);
    comDados.forEach((m) => { if (lista.indexOf(m) < 0 && lista.length < 6) lista.push(m); });

    lista.forEach((m) => {
      const b = el("button", "chip-mes");
      b.type = "button";
      b.textContent = nomeMes(m);
      const tem = totalDoMes(m) > 0;
      if (tem) b.appendChild(el("i"));
      if (m === mesAtual) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => { mesAtual = m; desenhar(); });
      chips.appendChild(b);
    });
  }

  function contarValor(el, valor) {
    if (!el) return;
    const de = Number(el.dataset.numero) || 0;
    el.dataset.numero = String(valor);
    if (SEM_MOVIMENTO || de === valor) { el.textContent = reais(valor); return; }
    animar(650, (k) => { el.textContent = reais(de + (valor - de) * k); });
    setTimeout(() => { el.textContent = reais(valor); }, 700);
  }

  /* ---------------- tela: indicadores ---------------- */
  function desenharKpis() {
    const lista = doMes(mesAtual);
    const total = lista.reduce((s, l) => s + l.valor, 0);
    const renda = rendaDoMes(mesAtual);
    const obrig = lista.filter((l) => l.obrig).reduce((s, l) => s + l.valor, 0);
    const nao = total - obrig;
    const sobra = renda - total;

    const [ano, mes] = mesAtual.split("-").map(Number);
    const hoje = new Date();
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const ehAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
    const diasContados = ehAtual ? Math.max(1, hoje.getDate()) : diasNoMes;

    contarValor($("#kpiTotal"), total);
    $("#kpiTotal").textContent = reais(total);

    $("#kpiTotalPe").textContent = lista.length + (lista.length === 1 ? " lançamento" : " lançamentos") +
      (renda ? " · " + pct.format((total / renda) * 100) + "% da renda" : "");

    $("#kpiRenda").textContent = renda ? reais(renda) : "—";
    $("#kpiSobra").textContent = renda ? reais(sobra) : "—";
    $("#kpiSobra").className = "kpi-val " + (renda ? (sobra >= 0 ? "val-bom" : "val-ruim") : "");
    $("#kpiSobraPe").textContent = renda
      ? (sobra >= 0 ? "sobrou " + pct.format((sobra / renda) * 100) + "% da renda"
                    : "estourou " + reais(-sobra))
      : "informe a renda";

    contarValor($("#kpiObrig"), obrig);
    $("#kpiObrigPe").textContent = total ? pct.format((obrig / total) * 100) + "% do mês" : "—";

    contarValor($("#kpiNao"), nao);
    $("#kpiNaoPe").textContent = total ? pct.format((nao / total) * 100) + "% do mês" : "—";

    contarValor($("#kpiMedia"), total / diasContados);
    $("#kpiMediaPe").textContent = "em " + diasContados + (diasContados === 1 ? " dia" : " dias");
  }

  /* ---------------- gráfico: pizza ---------------- */
  function fatia(cx, cy, r, a1, a2) {
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const grande = a2 - a1 > Math.PI ? 1 : 0;
    return "M " + cx + " " + cy + " L " + x1.toFixed(3) + " " + y1.toFixed(3) +
      " A " + r + " " + r + " 0 " + grande + " 1 " + x2.toFixed(3) + " " + y2.toFixed(3) + " Z";
  }

  function desenharPizza() {
    const svg = $("#graficoPizza");
    const legenda = $("#legendaPizza");
    const lista = porCategoria(doMes(mesAtual));
    svg.innerHTML = "";
    legenda.innerHTML = "";
    cancelarAnimacoes();

    const total = lista.reduce((s, c) => s + c.valor, 0);
    $("#pizzaCentroRot").textContent = "Total";
    $("#pizzaCentroVal").textContent = reaisCurto(total);

    if (!total) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", 110); c.setAttribute("cy", 110); c.setAttribute("r", 96);
      c.setAttribute("fill", "none");
      c.setAttribute("stroke", "currentColor");
      c.setAttribute("stroke-width", 22);
      c.setAttribute("opacity", ".09");
      svg.appendChild(c);
      legenda.appendChild(el("li", "", "Nenhum gasto neste mês ainda."));
      return;
    }

    let ang = -Math.PI / 2;
    const caminhos = [];
    lista.forEach((c) => {
      const arco = (c.valor / total) * Math.PI * 2;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const fim = ang + arco;
      const dCompleto = arco >= Math.PI * 2 - 0.0001
        ? "M 110 14 A 96 96 0 1 1 109.99 14 Z"
        : fatia(110, 110, 96, ang, fim);
      p.setAttribute("d", dCompleto);
      p.setAttribute("fill", c.cor);
      p.dataset.nome = c.nome;
      caminhos.push({ path: p, d: dCompleto, ang: ang, arco: arco });

      const li = el("li");
      const i = el("i");
      i.style.background = c.cor;
      const b = el("b", "", c.nome);
      const s = el("span", "", reais(c.valor) + " · " + pct.format((c.valor / total) * 100) + "%");
      li.append(i, b, s);

      p.addEventListener("mouseenter", () => {
        p.classList.add("ativo");
        Array.from(svg.children).forEach((o) => { if (o !== p) o.classList.add("esmaecido"); });
        $("#pizzaCentroRot").textContent = c.nome.length > 16 ? c.nome.slice(0, 15) + "…" : c.nome;
        $("#pizzaCentroVal").textContent = reais(c.valor);
        li.style.background = "var(--card-forte)";
      });
      p.addEventListener("mouseleave", () => {
        p.classList.remove("ativo");
        Array.from(svg.children).forEach((o) => o.classList.remove("esmaecido"));
        $("#pizzaCentroRot").textContent = "Total";
        $("#pizzaCentroVal").textContent = reaisCurto(total);
        li.style.background = "";
      });
      li.addEventListener("mouseenter", () => p.dispatchEvent(new Event("mouseenter")));
      li.addEventListener("mouseleave", () => p.dispatchEvent(new Event("mouseleave")));

      svg.appendChild(p);
      legenda.appendChild(li);
      ang = fim;
    });

    // animação: as fatias "abrem" girando, uma atrás da outra
    if (!SEM_MOVIMENTO) {
      caminhos.forEach((f) => f.path.setAttribute("d", fatia(110, 110, 96, f.ang, f.ang + 0.0001)));
      caminhos.forEach((f, i) => {
        const espera = i * 70;
        animacoes.push(setTimeout(() => {
          animar(520, (k) => {
            const fimAtual = f.ang + f.arco * k;
            f.path.setAttribute("d", k >= 1 ? f.d : fatia(110, 110, 96, f.ang, fimAtual + 0.0001));
          });
        }, espera));
      });
      // o número do centro sobe de 0 até o total
      const rot = $("#pizzaCentroVal");
      animar(900, (k) => { rot.textContent = reaisCurto(total * k); });
    }

    $("#subPizza").textContent = lista.length + (lista.length === 1 ? " categoria" : " categorias") + " · " + nomeMesLongo(mesAtual);
  }

  /* ---------------- gráfico: rosca obrigatório ---------------- */
  function desenharRosca() {
    const svg = $("#graficoRosca");
    const legenda = $("#legendaRosca");
    const lista = doMes(mesAtual);
    const total = lista.reduce((s, l) => s + l.valor, 0);
    const obrig = lista.filter((l) => l.obrig).reduce((s, l) => s + l.valor, 0);
    const nao = total - obrig;
    const r = 72, circ = 2 * Math.PI * r;

    svg.innerHTML = "";
    const fundo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    fundo.setAttribute("cx", 100); fundo.setAttribute("cy", 100); fundo.setAttribute("r", r);
    fundo.setAttribute("fill", "none");
    fundo.setAttribute("stroke", "currentColor");
    fundo.setAttribute("stroke-width", 20);
    fundo.setAttribute("opacity", ".07");
    svg.appendChild(fundo);

    const pNao = total ? nao / total : 0;

    const arcoNao = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    arcoNao.setAttribute("cx", 100); arcoNao.setAttribute("cy", 100); arcoNao.setAttribute("r", r);
    arcoNao.setAttribute("fill", "none");
    arcoNao.setAttribute("stroke", "url(#gradNao)");
    arcoNao.setAttribute("stroke-width", 20);
    arcoNao.setAttribute("stroke-linecap", "round");
    arcoNao.setAttribute("stroke-dasharray", "0 " + circ);
    arcoNao.setAttribute("transform", "rotate(-90 100 100)");

    const arcoObr = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    arcoObr.setAttribute("cx", 100); arcoObr.setAttribute("cy", 100); arcoObr.setAttribute("r", r);
    arcoObr.setAttribute("fill", "none");
    arcoObr.setAttribute("stroke", "url(#gradObr)");
    arcoObr.setAttribute("stroke-width", 20);
    arcoObr.setAttribute("stroke-linecap", "round");
    arcoObr.setAttribute("stroke-dasharray", "0 " + circ);
    arcoObr.setAttribute("transform", "rotate(-90 100 100)");

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML =
      '<linearGradient id="gradNao" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#fda4af"/><stop offset="100%" stop-color="#f43f5e"/></linearGradient>' +
      '<linearGradient id="gradObr" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#6ee7b7"/><stop offset="100%" stop-color="#059669"/></linearGradient>';
    svg.appendChild(defs);
    svg.appendChild(arcoObr);
    svg.appendChild(arcoNao);

    // anima o arco crescendo e o número subindo
    const pintar = (k) => {
      const dObr = (1 - pNao) * circ * k;
      const dNao = Math.max(0, pNao * circ * k - 4);
      arcoObr.setAttribute("stroke-dasharray", dObr + " " + circ);
      arcoNao.setAttribute("stroke-dasharray", dNao + " " + circ);
      arcoNao.setAttribute("transform", "rotate(" + (-90 + (1 - pNao) * 360 * k) + " 100 100)");
    };
    if (SEM_MOVIMENTO) {
      pintar(1);
    } else {
      pintar(0);
      animar(900, pintar);
    }
    const rotPct = $("#roscaPct");
    if (SEM_MOVIMENTO || !total) rotPct.textContent = total ? pct.format(pNao * 100) + "%" : "0%";
    else animar(900, (k) => { rotPct.textContent = pct.format(pNao * 100 * k) + "%"; });
    $("#subRosca").textContent = nomeMesLongo(mesAtual);

    legenda.innerHTML = "";
    [
      { cor: "linear-gradient(135deg,#6ee7b7,#059669)", rot: "Obrigatório", val: obrig },
      { cor: "linear-gradient(135deg,#fda4af,#f43f5e)", rot: "Não obrigatório", val: nao }
    ].forEach((x) => {
      const d = el("div");
      const i = el("i");
      i.style.background = x.cor;
      d.append(i, el("span", "", x.rot), el("b", "", reais(x.val)));
      legenda.appendChild(d);
    });
  }

  /* ---------------- gráfico: barras 12 meses ---------------- */
  function desenharBarras() {
    const caixa = $("#graficoBarras");
    caixa.innerHTML = "";
    const meses = [];
    for (let n = -11; n <= 0; n++) meses.push(somaMes(mesAtual, n));

    const dados = meses.map((m) => {
      const lista = doMes(m);
      const total = lista.reduce((s, l) => s + l.valor, 0);
      const obrig = lista.filter((l) => l.obrig).reduce((s, l) => s + l.valor, 0);
      return { mes: m, total, obrig, nao: total - obrig };
    });
    const maior = Math.max.apply(null, dados.map((d) => d.total).concat([1]));

    dados.forEach((d) => {
      const col = el("div", "barra-col");
      if (d.mes === mesAtual) col.classList.add("atual");
      col.title = nomeMesLongo(d.mes) + " · " + reais(d.total);

      const pilha = el("div", "barra-pilha");
      const alturaFinal = Math.max(2, (d.total / maior) * 100);
      pilha.style.height = SEM_MOVIMENTO ? alturaFinal + "%" : "2%";
      pilha.style.transition = "height 700ms cubic-bezier(.22,1,.36,1)";
      if (!SEM_MOVIMENTO) {
        setTimeout(() => { pilha.style.height = alturaFinal + "%"; }, 40 + caixa.children.length * 45);
      }

      const pNao = el("div", "barra-parte nao");
      const pObr = el("div", "barra-parte obr");
      pilha.append(pNao, pObr);
      // cresce do chão para cima, um mês atrás do outro
      const hNao = d.total ? (d.nao / d.total) * 100 : 0;
      const hObr = d.total ? (d.obrig / d.total) * 100 : 0;
      pNao.style.height = "0%";
      pObr.style.height = "0%";
      if (SEM_MOVIMENTO) {
        pNao.style.height = hNao + "%";
        pObr.style.height = hObr + "%";
      } else {
        const i = caixa.children.length;
        setTimeout(() => {
          pNao.style.transition = "height 620ms cubic-bezier(.22,1,.36,1)";
          pObr.style.transition = "height 620ms cubic-bezier(.22,1,.36,1)";
          pNao.style.height = hNao + "%";
          pObr.style.height = hObr + "%";
        }, 40 + i * 45);
      }

      const rot = el("div", "barra-rot", MESES[Number(d.mes.split("-")[1]) - 1]);
      col.append(pilha, rot);
      caixa.appendChild(col);
    });
  }

  /* ---------------- tela: tabela ---------------- */
  function desenharTabela() {
    const corpo = $("#corpoTabela");
    const vazia = $("#tabelaVazia");
    corpo.innerHTML = "";

    const termo = filtro.texto.trim().toLowerCase();
    let lista = doMes(mesAtual).filter((l) => {
      if (filtro.grupo && catInfo(l.categoria).grupo !== filtro.grupo) return false;
      if (!termo) return true;
      return (l.descricao + " " + l.categoria).toLowerCase().indexOf(termo) > -1;
    });
    lista.sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.at || 0) - (a.at || 0));

    vazia.hidden = lista.length > 0 || !!termo || !!filtro.grupo;
    const inicio = $("#inicioRapido");
    if (inicio) {
      const nada = !estado.lancamentos.filter((l) => !l.excluido).length;
      inicio.hidden = !(nada && !termo && !filtro.grupo);
    }

    lista.forEach((l) => {
      const tr = el("tr");
      const c = catInfo(l.categoria);

      const tdData = el("td", "col-data", dataBR(l.data));
      const tdDesc = el("td", "desc");
      tdDesc.appendChild(document.createTextNode(l.descricao || c.nome));
      if (l.obs) tdDesc.appendChild(el("small", "", l.obs));

      const tdCat = el("td");
      tdCat.appendChild(el("span", "pilula cat", l.categoria));

      const tdGrupo = el("td", "col-grupo");
      const pg = el("span", "pilula grupo", c.grupo);
      pg.style.color = c.grupo === "Casa" ? "var(--azul)" : c.grupo === "Lazer" ? "var(--roxo)" : "var(--laranja)";
      tdGrupo.appendChild(pg);

      const tdVal = el("td", "num", reais(l.valor));
      tdVal.style.color = l.obrig ? "var(--verde)" : "var(--texto)";

      const tdPag = el("td", "col-pag");
      tdPag.appendChild(el("span", "pilula pag", l.pagamento || "—"));

      const tdAcao = el("td", "col-acao");
      const lixo = el("button", "btn-lixo");
      lixo.type = "button";
      lixo.title = "Excluir";
      lixo.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      lixo.addEventListener("click", (ev) => {
        ev.stopPropagation();
        excluir(l.id);
      });
      tdAcao.appendChild(lixo);

      tr.append(tdData, tdDesc, tdCat, tdGrupo, tdVal, tdPag, tdAcao);
      tr.addEventListener("click", () => abrirModal(l.id));
      corpo.appendChild(tr);
    });
  }

  function desenharFiltroGrupo() {
    const sel = $("#filtroGrupo");
    if (sel.options.length > 1) return;
    ["Casa", "Fora", "Lazer"].forEach((g) => {
      const o = el("option", "", g);
      o.value = g;
      sel.appendChild(o);
    });
  }

  /* ---------------- desenhar tudo ---------------- */
  function desenhar() {
    cancelarAnimacoes();
    desenharMes();
    desenharKpis();
    desenharPizza();
    desenharRosca();
    desenharBarras();
    desenharTabela();
    desenharFiltroGrupo();
  }

  /* ---------------- modal de gasto ---------------- */
  function preencherCategorias() {
    const sel = $("#campoCategoria");
    sel.innerHTML = "";
    ["Casa", "Fora", "Lazer"].forEach((g) => {
      const grupo = document.createElement("optgroup");
      grupo.label = g;
      CATS.filter((c) => c.grupo === g).forEach((c) => {
        const o = el("option", "", c.nome);
        o.value = c.nome;
        grupo.appendChild(o);
      });
      sel.appendChild(grupo);
    });
  }

  function abrirModal(id) {
    editando = id ? estado.lancamentos.find((l) => l.id === id) || null : null;
    const f = $("#formGasto");
    f.reset();
    $("#avisoForm").hidden = true;
    $("#btnExcluir").hidden = !editando;
    $("#modalTitulo").textContent = editando ? "Editar gasto" : "Novo gasto";

    if (editando) {
      $("#campoDescricao").value = editando.descricao;
      $("#campoValor").value = (Number(editando.valor) || 0).toFixed(2).replace(".", ",");
      $("#campoData").value = editando.data || (mesAtual + "-" + String(new Date().getDate()).padStart(2, "0"));
      $("#campoCategoria").value = editando.categoria;
      $("#campoPagamento").value = editando.pagamento || "Pix";
      $("#campoObrig").value = editando.obrig ? "1" : "0";
      $("#campoObs").value = editando.obs || "";
    } else {
      const hoje = new Date();
      const ehMesAtual = mesAtual === mesHoje();
      const dia = ehMesAtual ? String(hoje.getDate()).padStart(2, "0") : "01";
      $("#campoData").value = mesAtual + "-" + dia;
      $("#campoPagamento").value = "Pix";
      $("#campoObrig").value = "1";
    }

    $("#modalFundo").hidden = false;
    pausaNuvem = true;
    setTimeout(() => $("#campoDescricao").focus(), 60);
  }

  function fecharModal() {
    $("#modalFundo").hidden = true;
    editando = null;
    pausaNuvem = false;
    desenhar();
  }

  function excluir(id) {
    const l = estado.lancamentos.find((x) => x.id === id);
    if (!l) return;
    if (!confirm('Excluir "' + (l.descricao || l.categoria) + '" de ' + reais(l.valor) + "?")) return;
    l.excluido = true;
    l.at = Date.now();
    salvar();
    desenhar();
    aviso("Gasto excluído", "ok");
  }

  function submeter(ev) {
    ev.preventDefault();
    const descricao = $("#campoDescricao").value.trim();
    const valor = numeroTexto($("#campoValor").value);
    const data = $("#campoData").value;
    const categoria = $("#campoCategoria").value;
    const avisoEl = $("#avisoForm");

    if (!descricao) { avisoEl.textContent = "Escreva uma descrição."; avisoEl.hidden = false; return; }
    if (!(valor > 0)) { avisoEl.textContent = "O valor precisa ser maior que zero."; avisoEl.hidden = false; return; }
    if (!data) { avisoEl.textContent = "Escolha a data do gasto."; avisoEl.hidden = false; return; }

    const c = catInfo(categoria);
    const agora = Date.now();

    if (editando) {
      editando.descricao = descricao;
      editando.valor = valor;
      editando.data = data;
      editando.mes = mesDe(data);
      editando.categoria = categoria;
      editando.pagamento = $("#campoPagamento").value;
      editando.obrig = $("#campoObrig").value === "1" ? 1 : 0;
      editando.obs = $("#campoObs").value.trim();
      editando.at = agora;
      mesAtual = editando.mes;
      aviso("Gasto atualizado", "ok");
    } else {
      estado.lancamentos.push({
        id: idNovo(),
        data,
        mes: mesDe(data),
        descricao,
        categoria,
        valor,
        pagamento: $("#campoPagamento").value,
        obrig: $("#campoObrig").value === "1" ? 1 : 0,
        obs: $("#campoObs").value.trim(),
        excluido: false,
        at: agora
      });
      mesAtual = mesDe(data);
      aviso("Gasto lançado: " + reais(valor), "ok");
    }
    salvar();
    fecharModal();
    aviso("Gasto salvo", "ok");
  }

  /* ---------------- modal de renda ---------------- */
  function abrirRenda() {
    $("#campoRenda").value = rendaDoMes(mesAtual)
      ? rendaDoMes(mesAtual).toFixed(2).replace(".", ",") : "";
    $("#rendaMesNome").textContent = "(" + nomeMesLongo(mesAtual) + ")";
    $("#modalRendaFundo").hidden = false;
    pausaNuvem = true;
    setTimeout(() => $("#campoRenda").focus(), 60);
  }

  function fecharRenda() {
    $("#modalRendaFundo").hidden = true;
    pausaNuvem = false;
    desenhar();
  }

  function submeterRenda(ev) {
    ev.preventDefault();
    const v = numeroTexto($("#campoRenda").value);
    estado.rendas[mesAtual] = v;
    estado.rendasAt[mesAtual] = Date.now();
    salvar();
    fecharRenda();
    aviso(v > 0 ? "Renda de " + nomeMes(mesAtual) + ": " + reais(v) : "Renda removida", "ok");
  }

  /* ---------------- exportar CSV ---------------- */
  function exportar() {
    const lista = doMes(mesAtual).slice().sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    if (!lista.length) { aviso("Nada para exportar neste mês", "erro"); return; }
    const linhas = [["Data", "Descrição", "Categoria", "Grupo", "Obrigatório", "Valor", "Pagamento", "Observações"]];
    lista.forEach((l) => {
      const c = catInfo(l.categoria);
      linhas.push([
        dataBR(l.data), l.descricao, l.categoria, c.grupo,
        l.obrig ? "Sim" : "Não",
        (Number(l.valor) || 0).toFixed(2).replace(".", ","),
        l.pagamento || "", l.obs || ""
      ]);
    });
    linhas.push([]);
    linhas.push(["", "", "", "", "TOTAL", (totalDoMes(mesAtual)).toFixed(2).replace(".", ","), "", ""]);
    const csv = "\ufeff" + linhas.map((l) => l.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gastos-" + mesAtual + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    aviso("Planilha do mês exportada", "ok");
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function aviso(txt, tipo) {
    const t = $("#toast");
    t.textContent = txt;
    t.className = "toast " + (tipo || "");
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("mostra"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("mostra");
      setTimeout(() => { t.hidden = true; }, 250);
    }, 2600);
  }

  /* ---------------- tema ---------------- */
  function aplicarTema(tema) {
    document.documentElement.dataset.tema = tema;
    try { localStorage.setItem("gastos-tema", tema); } catch (e) {}
    desenharBarras();
  }

  /* ---------------- eventos ---------------- */
  function ligarEventos() {
    $("#mes").addEventListener("change", (ev) => {
      if (ev.target.value) { mesAtual = ev.target.value; desenhar(); }
    });
    $("#mesAnterior").addEventListener("click", () => { mesAtual = somaMes(mesAtual, -1); desenhar(); });
    $("#mesProximo").addEventListener("click", () => { mesAtual = somaMes(mesAtual, 1); desenhar(); });

    $("#btnNovo").addEventListener("click", () => abrirModal(null));
    $("#btnNovoVazio").addEventListener("click", () => abrirModal(null));
    const bp = $("#btnPrimeiro");
    if (bp) bp.addEventListener("click", () => abrirModal(null));
    $("#btnExportar").addEventListener("click", exportar);
    $("#btnRenda").addEventListener("click", abrirRenda);

    $("#btnFechar").addEventListener("click", fecharModal);
    $("#btnCancelar").addEventListener("click", fecharModal);
    $("#btnExcluir").addEventListener("click", () => {
      if (!editando) return;
      const id = editando.id;
      $("#modalFundo").hidden = true;
      editando = null;
      pausaNuvem = false;
      excluir(id);
    });
    $("#formGasto").addEventListener("submit", submeter);

    $("#btnFecharRenda").addEventListener("click", fecharRenda);
    $("#btnCancelarRenda").addEventListener("click", fecharRenda);
    $("#formRenda").addEventListener("submit", submeterRenda);

    $("#modalFundo").addEventListener("click", (ev) => {
      if (ev.target.id === "modalFundo") fecharModal();
    });
    $("#modalRendaFundo").addEventListener("click", (ev) => {
      if (ev.target.id === "modalRendaFundo") fecharRenda();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        if (!$("#modalFundo").hidden) fecharModal();
        if (!$("#modalRendaFundo").hidden) fecharRenda();
      }
      if (ev.key === "n" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); abrirModal(null); }
    });

    $("#busca").addEventListener("input", (ev) => { filtro.texto = ev.target.value; desenharTabela(); });
    $("#filtroGrupo").addEventListener("change", (ev) => { filtro.grupo = ev.target.value; desenharTabela(); });

    // classificação automática pela categoria
    $("#campoCategoria").addEventListener("change", (ev) => {
      const c = catInfo(ev.target.value);
      $("#campoObrig").value = c.obrig ? "1" : "0";
    });

    $("#btnTema").addEventListener("click", () => {
      const atual = document.documentElement.dataset.tema === "claro" ? "escuro" : "claro";
      aplicarTema(atual);
    });

    // máscara simples de valor
    $("#campoValor").addEventListener("blur", (ev) => {
      const v = numeroTexto(ev.target.value);
      ev.target.value = v ? v.toFixed(2).replace(".", ",") : "";
    });

    // recalcula ao voltar para a aba (ex.: lançou em outro aparelho)
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) desenhar();
    });
  }

  /* ---------------- iniciar ---------------- */
  function iniciar() {
    preencherCategorias();
    ligarEventos();

    let tema = "escuro";
    try { tema = localStorage.getItem("gastos-tema") || "escuro"; } catch (e) {}
    document.documentElement.dataset.tema = tema;

    const local = carregarLocal();
    if (local) estado = normalizar(local);

    desenhar();
    marcarSelo();

    if (window.GastosNuvem) {
      window.GastosNuvem.aoMudarStatus(statusNuvem);
      if (!window.GastosNuvem.configurada()) statusNuvem("só neste navegador", "off");
      window.GastosNuvem.iniciar(receberDaNuvem)
        .then((nuvem) => {
          if (!nuvem) return;
          const misturado = window.GastosNuvem.juntar(estado, nuvem);
          estado = normalizar(misturado);
          salvarLocal();
          desenhar();
          marcarSelo();
        })
        .catch(() => {});
    } else {
      statusNuvem("só neste navegador", "off");
    }

    // se em 6 segundos a nuvem não disse nada, avisa
    setTimeout(() => {
      const caixa = $("#nuvem");
      if (caixa && (caixa.dataset.estado === "salvando" || caixa.dataset.estado === "off")) {
        statusNuvem(window.GastosNuvem && window.GastosNuvem.configurada()
          ? "nuvem sem resposta" : "só neste navegador",
          window.GastosNuvem && window.GastosNuvem.configurada() ? "erro" : "off");
      }
    }, 6000);

    // cache do app: funciona mesmo sem internet depois da primeira visita
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
