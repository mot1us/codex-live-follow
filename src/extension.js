'use strict';

const vscode = require('vscode');
const { LiveFollow } = require('./controller');
let controller;

async function activate(context) {
  controller = new LiveFollow(vscode, context);
  context.subscriptions.push(controller);
  await controller.start();
  return {
    getState: () => controller?.getState(),
    areControlsReady: () => Boolean(controller?.sidebar?.ready)
  };
}

function deactivate() {
  controller?.dispose();
  controller = undefined;
}

module.exports = { activate, deactivate };
