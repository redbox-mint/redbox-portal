// Use styled-components' production CSSOM insertion. Text-node insertion forces
// repeated stylesheet reparsing as the reference mounts its component tree.
window.SC_DISABLE_SPEEDY = false;
// Pass this response's CSP nonce to the viewer's generated styles.
window.__redboxApiDocsNonce = document.currentScript.nonce;
