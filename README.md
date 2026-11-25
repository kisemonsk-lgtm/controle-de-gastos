# Gastos — Controle Mensal

Sistema de controle de gastos **mês a mês**, com gráficos animados e sincronização na nuvem (Firebase Firestore).
Funciona no computador e no celular, e continua funcionando offline depois da primeira visita.

**App:** https://kisemonsk-lgtm.github.io/controle-de-gastos/

## O que ele faz

- **Cada mês tem a sua própria visão**: setas para trocar de mês, seletor de mês e atalhos (chips) dos meses recentes.
- **Lançamentos**: descrição, valor, data, categoria, forma de pagamento, observações e se o gasto é obrigatório.
  O grupo (Casa / Fora / Lazer) e a obrigatoriedade vêm da categoria escolhida.
- **Indicadores do mês**: total gasto, renda, sobra, obrigatório, não obrigatório e média por dia.
- **Gráficos animados**:
  - pizza por categoria (fatias abrem uma atrás da outra),
  - rosca obrigatório × não obrigatório,
  - barras empilhadas dos últimos 12 meses (crescem do chão para cima).
- **Renda por mês**: informe a renda para calcular a sobra e o % da renda comprometida.
- **Exportar** o mês em CSV (abre no Excel / Google Planilhas).
- **Salva sozinho**: no navegador (localStorage) e na nuvem Firebase, sem botão de salvar.

## Nuvem (Firebase)

As chaves estão em `firebase-config.js`. Hoje ele usa o mesmo projeto Firebase do app de ponto
(`ponto-v2`), numa coleção separada chamada `gastos-casa`, então nada se mistura com o ponto.

Para usar outro projeto: Console do Firebase → ⚙ → Configurações do projeto → Seus apps →
app da Web → "Configuração do SDK", e cole no lugar do bloco em `firebase-config.js`.
As regras do Firestore precisam permitir leitura e escrita na coleção `gastos-casa`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | a tela do app |
| `estilo.css` | visual (tema escuro premium, tema claro opcional) |
| `app.js` | cálculos, gráficos animados, tabela e telas |
| `categorias.js` | categorias, grupos e cores |
| `nuvem.js` | sincronização com o Firebase Firestore |
| `firebase-config.js` | chaves do Firebase |
| `sw.js` | cache para funcionar sem internet |
| `manifest.webmanifest` | instalar como app no celular |

## Publicação

O site é servido pelo GitHub Pages a partir da branch `main`, na raiz do repositório.
