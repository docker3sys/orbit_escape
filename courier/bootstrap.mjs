import '../webview-compat.js';

import('./app.js').catch(error => {
  if (error?.name !== 'GraphicsUnavailable') console.error('Courier flight could not start', error);
  if (window.parent !== window) {
    window.parent.dispatchEvent(new Event('orbit:courier-lite'));
    return;
  }
  document.getElementById('loadingStatus').textContent = 'Открой ангар для полёта с облегчённой графикой.';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--primary';
  button.textContent = 'В ангар';
  button.onclick = () => location.assign('../index.html');
  document.getElementById('loadingPanel').appendChild(button);
});
