const app = document.getElementById('app');
const panel = document.getElementById('panel');
const disclosure = document.getElementById('collapse');

function setPanelOpen(open) {
  panel.hidden = !open;
  disclosure.setAttribute('aria-expanded', String(open));
}

disclosure.addEventListener('click', () => setPanelOpen(panel.hidden));
app.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) {
    setPanelOpen(false);
    disclosure.focus();
  }
});

function fitPanelHeight() {
  const workspace = document.querySelector('.workspace');
  const styles = getComputedStyle(workspace);
  const available = innerHeight - document.querySelector('.topbar').getBoundingClientRect().height -
    document.querySelector('.dock').getBoundingClientRect().height -
    parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom) - 8;
  const limit = Math.min(420, innerHeight * (innerWidth <= 600 ? .43 : .56));
  panel.style.setProperty('--panel-space', Math.max(44, Math.min(limit, available)) + 'px');
}
const dockObserver = new ResizeObserver(fitPanelHeight);
dockObserver.observe(document.querySelector('.dock'));
dockObserver.observe(document.querySelector('.topbar'));
window.addEventListener('resize', fitPanelHeight);

async function loadAR() {
  try {
    window.WallPipeDesktopPreview = document.documentElement.dataset.preview==='true' ||
      (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
      !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    window.THREE = await import('three');
    [window.WallPipeValveAssets, window.WallPipePipeAssets] = await Promise.all([
      import('./valve-assets.js'),
      import('./pipe-assets.js?rev=20261118-bend1')
    ]);
    await import('./ar-hand.js?rev=20261122-ui5');
  } catch (error) {
    app.dataset.phase = 'error';
    document.getElementById('status').dataset.status = 'error';
    document.getElementById('statusText').textContent = 'ARを読み込めませんでした';
    document.getElementById('info').textContent = '通信を確認して再試行するか、3Dプレビューをご覧ください。';
    const retry = document.getElementById('quickAction');
    retry.textContent = 'ページを再読み込み';
    retry.disabled = false;
    retry.addEventListener('click', () => window.location.reload());
    console.error(error);
  }
}

loadAR();
