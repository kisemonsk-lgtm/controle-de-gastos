/* =========================================================
   CHAVES DO FIREBASE — Sistema de Gastos
   ---------------------------------------------------------
   Usa o mesmo projeto Firebase já configurado no seu app
   de ponto (ponto-v2). Os gastos ficam numa coleção
   separada, então não se misturam com nada do ponto.

   Para trocar de projeto: Console do Firebase → ⚙ →
   Configurações do projeto → Seus apps → app da Web →
   "Configuração do SDK" → cole no lugar do bloco abaixo.
   ========================================================= */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBm7fofjC_zh01J2XQy_aEPLXFojMDB_t4",
  authDomain: "ponto-v2.firebaseapp.com",
  projectId: "ponto-v2",
  storageBucket: "ponto-v2.firebasestorage.app",
  messagingSenderId: "919912137592"
};

/* onde os gastos são guardados no Firestore */
window.FIRESTORE_COLECAO = "gastos-casa";
window.FIRESTORE_DOC = "principal";
