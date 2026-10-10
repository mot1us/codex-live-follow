'use strict';

const SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.venv',
  'venv', 'target', 'coverage', '__pycache__', '.vscode-test', '.cache', '.vscode', '.codex-live-follow'
]);
const DIRECTORY_LIMIT = 10000;

// Apply each project's exclusions before counting files. Stream results rather
// than building a list of every path in a large workspace. Do not follow symlinks.
async function* sourceFiles(api, folders, ignored, limit, current) {
  let files = 0;
  let directories = 0;
  for (const folder of folders) {
    const stack = [{ uri: folder.uri }];
    while (stack.length && files < limit && current()) {
      const frame = stack.at(-1);
      if (!frame.entries) {
        if (++directories > DIRECTORY_LIMIT) return;
        try { frame.entries = await api.workspace.fs.readDirectory(frame.uri); }
        catch { stack.pop(); continue; }
        if (!current()) return;
        frame.index = 0;
      }
      if (frame.index === frame.entries.length) { stack.pop(); continue; }
      const [name, type] = frame.entries[frame.index++];
      const uri = api.Uri.joinPath(frame.uri, name);
      if (type & api.FileType.SymbolicLink) continue;
      if (type & api.FileType.Directory) {
        if (!ignored(uri, true)) stack.push({ uri });
      } else if ((type & api.FileType.File) && !ignored(uri, false)) {
        files++;
        yield uri;
      }
    }
  }
}

module.exports = { sourceFiles, SKIP_DIRECTORIES, DIRECTORY_LIMIT };
