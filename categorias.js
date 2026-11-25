/* =========================================================
   Categorias de gasto
   ---------------------------------------------------------
   grupo:  Casa | Fora | Lazer
   obrig:  true = obrigatório, false = não obrigatório
   cor:    cor usada no gráfico de pizza
   ========================================================= */
window.CATEGORIAS = [
  { nome: "Aluguel / Financiamento", grupo: "Casa",  obrig: true,  cor: "#34d399" },
  { nome: "Energia elétrica",        grupo: "Casa",  obrig: true,  cor: "#2dd4bf" },
  { nome: "Água e esgoto",           grupo: "Casa",  obrig: true,  cor: "#22d3ee" },
  { nome: "Gás",                     grupo: "Casa",  obrig: true,  cor: "#38bdf8" },
  { nome: "Internet / Telefone",     grupo: "Casa",  obrig: true,  cor: "#60a5fa" },
  { nome: "Mercado / Feira",         grupo: "Casa",  obrig: true,  cor: "#818cf8" },
  { nome: "Farmácia / Saúde",        grupo: "Casa",  obrig: true,  cor: "#a78bfa" },
  { nome: "Educação",                grupo: "Casa",  obrig: true,  cor: "#c084fc" },
  { nome: "Seguros e impostos",      grupo: "Casa",  obrig: true,  cor: "#e879f9" },
  { nome: "Empregada / Diarista",    grupo: "Casa",  obrig: false, cor: "#f472b6" },
  { nome: "Manutenção e reparos",    grupo: "Casa",  obrig: false, cor: "#fb7185" },
  { nome: "Decoração e móveis",      grupo: "Casa",  obrig: false, cor: "#f97316" },
  { nome: "Assinaturas (streaming)", grupo: "Casa",  obrig: false, cor: "#fbbf24" },
  { nome: "Transporte",              grupo: "Fora",  obrig: true,  cor: "#84cc16" },
  { nome: "Estacionamento / Pedágio",grupo: "Fora",  obrig: true,  cor: "#4ade80" },
  { nome: "Manutenção do veículo",   grupo: "Fora",  obrig: true,  cor: "#14b8a6" },
  { nome: "Alimentação fora de casa",grupo: "Fora",  obrig: false, cor: "#f59e0b" },
  { nome: "Delivery / iFood",        grupo: "Fora",  obrig: false, cor: "#ef4444" },
  { nome: "Vestuário e calçados",    grupo: "Fora",  obrig: false, cor: "#d946ef" },
  { nome: "Cuidados pessoais",       grupo: "Fora",  obrig: false, cor: "#8b5cf6" },
  { nome: "Cursos extras",           grupo: "Fora",  obrig: false, cor: "#0ea5e9" },
  { nome: "Lazer",                   grupo: "Lazer", obrig: false, cor: "#f43f5e" },
  { nome: "Viagens",                 grupo: "Lazer", obrig: false, cor: "#f97316" },
  { nome: "Bares e baladas",         grupo: "Lazer", obrig: false, cor: "#eab308" },
  { nome: "Esportes e hobbies",      grupo: "Lazer", obrig: false, cor: "#10b981" },
  { nome: "Presentes e doações",     grupo: "Lazer", obrig: false, cor: "#a3e635" },
  { nome: "Outros",                  grupo: "Fora",  obrig: false, cor: "#94a3b8" }
];
