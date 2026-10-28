/* Self-service profile actions use the authenticated session, never a submitted user ID. */
(function () {
  'use strict';
  const profile = document.getElementById('user-profile');
  if (!profile) return;
  const status = document.getElementById('profile-status');
  const form = document.getElementById('profile-details');
  const token = document.getElementById('profile-token');
  const tokenResult = document.getElementById('profile-token-result');
  let busy = false;

  function hideToken() {
    if (token) token.value = '';
    if (tokenResult) tokenResult.hidden = true;
  }

  async function submit(action, body, success) {
    if (busy) return;
    busy = true;
    hideToken();
    status.textContent = 'Saving…';
    const buttons = profile.querySelectorAll('button');
    buttons.forEach(button => { button.disabled = true; });
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const csrfResponse = await fetch(profile.dataset.csrfUrl, {
        credentials: 'same-origin', cache: 'no-store', signal: abort.signal
      });
      if (!csrfResponse.ok) throw new Error('Unable to obtain a security token. Please reload and sign in again.');
      const csrf = await csrfResponse.json();
      if (!csrf._csrf) throw new Error('Unable to obtain a security token. Please reload the page.');
      const response = await fetch(`${profile.dataset.basePath}/user/${action}`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf._csrf },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error('Unable to save changes. Please check your access and try again.');
      const result = await response.json();
      if (!result.status) throw new Error(result.message || 'Unable to save changes.');
      success(result);
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'The request timed out. Please try again.' : error.message;
    } finally {
      clearTimeout(timeout);
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  if (form) form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = form.elements;
    if (fields.password.value !== fields.confirmPassword.value) {
      status.textContent = 'Passwords must match.';
      return;
    }
    submit('update', { details: {
      name: fields.name.value, email: fields.email.value, password: fields.password.value
    } }, result => {
      fields.password.value = '';
      fields.confirmPassword.value = '';
      status.textContent = result.message;
    });
  });
  const generate = document.getElementById('profile-generate-key');
  if (generate) generate.addEventListener('click', () => {
    if (!window.confirm('Replace your existing API token? Applications using it will lose access.')) return;
    submit('genKey', {}, result => {
      token.value = result.message;
      tokenResult.hidden = false;
      status.textContent = 'API token generated. Copy it now and store it securely.';
    });
  });
  const revoke = document.getElementById('profile-revoke-key');
  if (revoke) revoke.addEventListener('click', () => {
    if (!window.confirm('Revoke your API token? Applications using it will lose access.')) return;
    submit('revokeKey', {}, result => { status.textContent = result.message; });
  });
  const hide = document.getElementById('profile-hide-token');
  if (hide) hide.addEventListener('click', hideToken);
  window.addEventListener('pagehide', hideToken);
}());
