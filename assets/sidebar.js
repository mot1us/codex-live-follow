'use strict';

(() => {
  const api = acquireVsCodeApi();
  const elements = new Map(Array.from(document.querySelectorAll('[id]'), node => [node.id, node]));
  const element = id => elements.get(id);
  const statusCard = document.querySelector('.status-card');
  const update = (id, property, value) => {
    const node = element(id);
    if (node[property] !== value) node[property] = value;
  };
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
  speed.addEventListener('input', () => update('speed-value', 'textContent', `${speed.value} chars/s`));
  speed.addEventListener('change', () => {
    send({ type: 'setting', key: 'typingCharsPerSecond', value: Number(speed.value) });
  });
  speed.addEventListener('blur', () => { if (latestState) updateSpeed(latestState); });
  for (const action of ['skip', 'settings', 'output']) {
    element(action).addEventListener('click', () => send({ type: 'action', action }));
  }

  function updateSpeed(state) {
    update('speed', 'value', String(state.speed));
    update('speed-value', 'textContent', `${state.speed} chars/s`);
  }

  function render(state) {
    latestState = state;
    update('settings-scope', 'textContent', state.configurationScope === 'workspace'
      ? 'Saved for this project.' : 'Saved in your VS Code settings.');
    if (statusCard.dataset.status !== state.status) statusCard.dataset.status = state.status;
    update('status-title', 'textContent', state.title);
    update('status-title', 'title', state.title);
    update('status-detail', 'textContent', state.detail);
    update('status-detail', 'title', state.detail);
    update('current-file', 'hidden', !state.file);
    const location = state.file && state.line ? `${state.file}:${state.line}` : state.file;
    update('current-file', 'textContent', location);
    update('current-file', 'title', location);
    update('queue', 'textContent', state.pending
      ? `${state.pending} ${state.pending === 1 ? 'change' : 'changes'} queued` : 'Nothing queued');
    update('skip', 'disabled', !state.canSkip);
    update('progress', 'hidden', state.progress === null);
    update('progress', 'value', state.progress ?? 0);
    for (const key of settings) {
      update(key, 'checked', state[key]);
      update(key, 'disabled', false);
    }
    update('mode', 'value', state.mode);
    update('mode', 'disabled', false);
    update('speed', 'disabled', state.mode !== 'typing');
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
