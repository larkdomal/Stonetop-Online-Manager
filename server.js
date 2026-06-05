const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '/data';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

function safeId(id) {
  return /^[a-zA-Z0-9_-]{6,80}$/.test(id);
}
function fileFor(id) {
  return path.join(DATA_DIR, `${id}.json`);
}
function backupFolderFor(id) {
  return path.join(BACKUP_DIR, id);
}
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
function backupName(type) {
  return `${timestamp()}-${type}.json`;
}
function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function createBackup(id, data, type = 'auto') {
  if (!safeId(id)) throw new Error('Invalid room id');
  const dir = backupFolderFor(id);
  fs.mkdirSync(dir, { recursive: true });
  const filename = backupName(type);
  const file = path.join(dir, filename);
  const payload = {
    _backup: { roomId: id, type, createdAt: new Date().toISOString() },
    data
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  rotateBackups(id, 'auto', 20);
  return filename;
}
function listBackups(id) {
  const dir = backupFolderFor(id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      const type = f.includes('-manual.json') ? 'manual' : 'auto';
      return { name: f, type, createdAt: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function rotateBackups(id, type, keep) {
  const dir = backupFolderFor(id);
  if (!fs.existsSync(dir)) return;
  const files = listBackups(id).filter(b => b.type === type);
  files.slice(keep).forEach(b => {
    try { fs.unlinkSync(path.join(dir, b.name)); } catch (_) {}
  });
}
function backupFileFor(id, name) {
  if (!safeId(id) || !/^[0-9T\-]+-(auto|manual)\.json$/.test(name)) return null;
  return path.join(backupFolderFor(id), name);
}

app.get('/api/jsonBlob/:id', (req, res) => {
  const id = req.params.id;
  if (!safeId(id)) return res.status(400).json({ error: 'Invalid room id' });
  const file = fileFor(id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Room not found' });
  res.type('json').send(fs.readFileSync(file, 'utf8'));
});

app.put('/api/jsonBlob/:id', (req, res) => {
  const id = req.params.id;
  if (!safeId(id)) return res.status(400).json({ error: 'Invalid room id' });
  const file = fileFor(id);
  const next = req.body ?? {};
  if (fs.existsSync(file)) {
    try {
      const current = readJsonFile(file);
      if (!sameJson(current, next)) createBackup(id, current, 'auto');
    } catch (_) {}
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  res.json({ ok: true });
});

app.get('/api/backups/:id', (req, res) => {
  const id = req.params.id;
  if (!safeId(id)) return res.status(400).json({ error: 'Invalid room id' });
  res.json({ backups: listBackups(id) });
});

app.post('/api/backups/:id/manual', (req, res) => {
  const id = req.params.id;
  if (!safeId(id)) return res.status(400).json({ error: 'Invalid room id' });
  let data = req.body;
  if (!data || Object.keys(data).length === 0) {
    const file = fileFor(id);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Room not found' });
    data = readJsonFile(file);
  }
  const name = createBackup(id, data, 'manual');
  res.json({ ok: true, backup: name });
});

app.post('/api/backups/:id/restore/:name', (req, res) => {
  const { id, name } = req.params;
  const bfile = backupFileFor(id, name);
  if (!bfile || !fs.existsSync(bfile)) return res.status(404).json({ error: 'Backup not found' });
  const currentFile = fileFor(id);
  if (fs.existsSync(currentFile)) {
    try { createBackup(id, readJsonFile(currentFile), 'auto'); } catch (_) {}
  }
  const backup = readJsonFile(bfile);
  const data = backup.data ?? backup;
  fs.writeFileSync(currentFile, JSON.stringify(data, null, 2));
  res.json({ ok: true, restored: name, data });
});

app.get('/health', (_, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Stonetop server running on port ${PORT}, data dir ${DATA_DIR}`);
});
