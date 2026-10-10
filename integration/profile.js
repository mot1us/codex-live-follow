'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const inspector = require('node:inspector');
const { performance } = require('node:perf_hooks');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
  const deadline = Date.now() + 20000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Profile timed out: ${description}`);
    await sleep(25);
  }
}

function extensionSamples(profile, extensionPath) {
  const own = new Set(profile.nodes.filter(node =>
    node.callFrame.url.replace(/\\/g, '/').includes(extensionPath.replace(/\\/g, '/') + '/'))
    .map(node => node.id));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id);
  let self = 0;
  let inclusive = 0;
  for (let i = 0; i < (profile.samples || []).length; i++) {
    let id = profile.samples[i];
    const duration = (profile.timeDeltas[i] || 0) / 1000;
    if (own.has(id)) self += duration;
    while (id !== undefined && !own.has(id)) id = parents.get(id);
    if (id !== undefined) inclusive += duration;
  }
  return { specterSampledSelfMs: +self.toFixed(2), specterSampledInclusiveMs: +inclusive.toFixed(2) };
}

async function runProfile(vscode, api, extension, directory) {
  await fs.mkdir(directory, { recursive: true });
  const config = vscode.workspace.getConfiguration('codexLiveFollow');
  for (const [key, value] of Object.entries({ suspendWhenPaused: true,
    pauseOnInteraction: false, pauseWhenUnfocused: false, mode: 'typing',
    typingCharsPerSecond: 120, maxReplayDurationMs: 3000, minimumDisplayMs: 100 })) {
    await config.update(key, value, vscode.ConfigurationTarget.Workspace);
  }
  await vscode.commands.executeCommand('codexLiveFollow.pause');
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const small = path.join(root, 'specter-profile-small.txt');
  const large = path.join(root, 'specter-profile-large.txt');
  const beforeSmall = 'small source baseline\n'.repeat(200);
  const beforeLarge = 'unchanged source line\n'.repeat(24000);
  await fs.writeFile(small, beforeSmall);
  await fs.writeFile(large, beforeLarge);
  await vscode.commands.executeCommand('codexLiveFollow.resume');
  await until(() => api.getState().status === 'watching', 'profile baselines');
  // Let prior integration-test and language-service activity settle first.
  await sleep(1000);
  const session = new inspector.Session();
  session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) =>
    session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  const phases = [];
  let frames = 0;
  let peakQueue = 0;
  const subscription = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.scheme === 'codex-live-follow') frames++;
  });
  let polling;
  const measure = async (name, action) => {
    const firstFrame = frames;
    peakQueue = 0;
    if (name === 'file-burst') polling = setInterval(() => {
      peakQueue = Math.max(peakQueue, api.getState().pending);
    }, 25);
    await post('Profiler.start');
    const cpu = process.cpuUsage();
    const memory = process.memoryUsage();
    const started = performance.now();
    await action();
    const elapsedMs = performance.now() - started;
    const used = process.cpuUsage(cpu);
    const cpuMs = (used.user + used.system) / 1000;
    const after = process.memoryUsage();
    clearInterval(polling);
    polling = undefined;
    const { profile } = await post('Profiler.stop');
    await fs.writeFile(path.join(directory, `${name}.cpuprofile`), JSON.stringify(profile));
    const result = { name, elapsedMs: +elapsedMs.toFixed(1), extensionHostCpuMs: +cpuMs.toFixed(1),
      extensionHostCpuPercentOfOneCore: +(cpuMs * 100 / elapsedMs).toFixed(2),
      heapBeforeMiB: +(memory.heapUsed / 1048576).toFixed(2), heapAfterMiB: +(after.heapUsed / 1048576).toFixed(2),
      rssAfterMiB: +(after.rss / 1048576).toFixed(2), virtualDocumentChanges: frames - firstFrame,
      peakPendingReplays: peakQueue, ...extensionSamples(profile, extension.extensionPath) };
    phases.push(result);
    console.log(`SPECTER_PROFILE ${JSON.stringify(result)}`);
    return result;
  };
  try {
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval', { interval: 1000 });
    await measure('idle', () => sleep(2000));
    for (const [name, file, before] of [['small-replay', small, beforeSmall], ['large-replay', large, beforeLarge]]) {
      const after = before + 'new saved characters '.repeat(15) + '\n';
      const result = await measure(name, async () => {
        const prior = frames;
        await fs.writeFile(file, after);
        await until(() => frames > prior && api.getState().status === 'watching', name);
      });
      assert.ok(result.virtualDocumentChanges > 1, 'profile must exercise real typing');
      assert.equal(await fs.readFile(file, 'utf8'), after);
    }
    await config.update('mode', 'follow', vscode.ConfigurationTarget.Workspace);
    await measure('file-burst', async () => {
      const burst = path.join(root, 'specter-profile-burst');
      await fs.mkdir(burst);
      for (let start = 0; start < 400; start += 80) {
        await Promise.all(Array.from({ length: 80 }, (_, i) =>
          fs.writeFile(path.join(burst, `file-${start + i}.txt`), `saved file ${start + i}\n`)));
      }
      await until(() => api.getState().recent.some(entry => entry.file.includes('specter-profile-burst')), 'burst observed');
      await until(() => api.getState().status === 'watching' && api.getState().pending === 0, 'burst settled');
      await sleep(250);
      assert.ok(peakQueue <= 12, 'profile observes the real replay queue bound');
    });
    await vscode.commands.executeCommand('codexLiveFollow.pause');
    const recent = api.getState().recent.length;
    const paused = await measure('paused-save', async () => {
      await fs.appendFile(small, 'saved while paused\n');
      await sleep(1000);
    });
    assert.equal(paused.virtualDocumentChanges, 0);
    assert.equal(api.getState().recent.length, recent);
    await fs.writeFile(path.join(directory, 'summary.json'), JSON.stringify({
      version: extension.packageJSON.version, vscode: vscode.version, node: process.version,
      platform: process.platform, architecture: process.arch,
      scope: 'Disposable real VS Code host with other installed extensions disabled. CPU and RAM counters describe the entire extension-host process, not Specter alone. Sampling attribution is approximate; renderer/GPU and language-service child processes are excluded. Heap changes include garbage collection and profiler/test overhead.',
      phases
    }, null, 2));
    console.log('PASS packaged-extension CPU profiles, real playback, burst bounds, and paused save');
  } finally {
    clearInterval(polling);
    subscription.dispose();
    session.disconnect();
    await vscode.commands.executeCommand('codexLiveFollow.pause');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
}

module.exports = { runProfile };
