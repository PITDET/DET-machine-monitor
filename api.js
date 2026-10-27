/**
 * api.js — the ONLY file that talks to the backend.
 * To move to SharePoint / Supabase later, change this file only.
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbwJPhaTgWyM0sa2m3yInNEPhXHEnM93XG-rP0EdB4FSQSigocUPeVCLYHCVaInjfBQ4/exec';

const Api = (() => {
  const TOKEN_KEY = 'mo_token';

  async function call(body) {
    // text/plain avoids a CORS preflight, which Apps Script does not support
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
    if (!res.ok) throw new Error('NETWORK_' + res.status);
    return res.json();
  }

  return {
    getToken: () => sessionStorage.getItem(TOKEN_KEY),

    async login(username, password) {
      const r = await call({ action: 'login', username, password });
      if (r.ok) sessionStorage.setItem(TOKEN_KEY, r.token);
      return r;
    },

    async logout() {
      const token = sessionStorage.getItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      try { await call({ action: 'logout', token }); } catch (e) { /* ignore */ }
    },

    /** module: 'MO' (Machine Order). Returns {ok, user, dataAsOf, previousAsOf, delayRule, keyMode, statusMap, headers, rows, previous, warnings} */
    async getData(module = 'MO') {
      const r = await call({ action: 'getData', module, token: sessionStorage.getItem(TOKEN_KEY) });
      if (!r.ok && r.error === 'SESSION_EXPIRED') sessionStorage.removeItem(TOKEN_KEY);
      return r;
    }
  };
})();
