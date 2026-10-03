'use strict';

(() => {
  const api = acquireVsCodeApi();
  const element = id => document.getElementById(id);
  let latestState;
  const settings = ['enabled', 'pauseOnInteraction', 'pauseWhenUnfocused', 'ignoreEditorSaves'];
  const send = message => {
    element('error').hidden = true;
    api.postMessage(message);
  };
  for (const key of settings) {
    element(key).addEventListener('change', event => {
      send({ type: 'setting', key, value: event.target.checked });
    });
  }
  element('mode').addEventListener('change', event => {
    send({ type: 'setting', key: 'mode', value: event.target.value });
  });
  const speed = element('speed');
  speed.addEventListener('input', () => { element('speed-value').textContent = `${speed.value} chars/s`; });
  speed.addEventListener('change', () => {
    send({ type: 'setting', key: 'typingCharsPerSecond', value: Number(speed.value) });
  });
  speed.addEventListener('blur', () => { if (latestState) updateSpeed(latestState); });
  for (const action of ['skip', 'settings', 'output']) {
    element(action).addEventListener('click', () => send({ type: 'action', action }));
  }

  function updateSpeed(state) {
    speed.value = String(state.speed);
    element('speed-value').textContent = `${state.speed} chars/s`;
  }

  function render(state) {
    latestState = state;
    element('settings-scope').textContent = state.configurationScope === 'workspace'
      ? 'Saved for this project.' : 'Saved in your VS Code settings.';
    document.querySelector('.status-card').dataset.status = state.status;
    element('status-title').textContent = state.title;
    element('status-title').title = state.title;
    element('status-detail').textContent = state.detail;
    element('status-detail').title = state.detail;
    element('current-file').hidden = !state.file;
    const location = state.file && state.line ? `${state.file}:${state.line}` : state.file;
    element('current-file').textContent = location;
    element('current-file').title = location;
    element('queue').textContent = state.pending
      ? `${state.pending} ${state.pending === 1 ? 'change' : 'changes'} queued` : 'Nothing queued';
    element('skip').disabled = !state.canSkip;
    element('skip').textContent = 'Skip current';
    element('progress').hidden = state.progress === null;
    element('progress').value = state.progress ?? 0;
    for (const key of settings) {
      element(key).checked = state[key];
      element(key).disabled = false;
    }
    element('mode').value = state.mode;
    element('mode').disabled = false;
    speed.disabled = state.mode !== 'typing';
    if (document.activeElement !== speed) updateSpeed(state);
  }

  window.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'state') render(message.state);
    else if (message?.type === 'error') {
      element('error').textContent = message.message;
      element('error').hidden = false;
    }
  });
  send({ type: 'ready' });
})();
