'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { FollowSidebar } = require('../src/sidebar');
const { LiveFollow } = require('../src/controller');
const { createVscodeMock } = require('./helpers/vscode');

test('the actual sidebar enables the speed slider during a demo in Changed lines mode', t => {
  const mock = createVscodeMock({ config: { enabled: false, mode: 'follow' } });
  const controller = new LiveFollow(mock.vscode, mock.context);
  const sidebar = new FollowSidebar(mock.vscode, mock.context, controller);
  t.after(() => { sidebar.dispose(); controller.dispose(); mock.dispose(); });
  const html = sidebar.html({ cspSource: 'local', asWebviewUri: uri => uri.toString() }, mock.context.extensionUri);
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) =>
    [id, { id, addEventListener() {}, replaceChildren() {} }]));
  let receive;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/sidebar.js'), 'utf8'), {
    acquireVsCodeApi: () => ({ postMessage() {} }),
    document: { querySelectorAll: () => [...nodes.values()], querySelector: () => ({ dataset: {} }), activeElement: null },
    window: { addEventListener(_type, handler) { receive = handler; } }
  });
  const render = () => receive({ data: { type: 'state', state: controller.getState() } });
  render();
  assert.equal(nodes.get('speed').disabled, true);
  controller.demoJob = { demo: true };
  render();
  assert.equal(nodes.get('speed').disabled, false);
  controller.demoJob = undefined;
  render();
  assert.equal(nodes.get('speed').disabled, true);
});
