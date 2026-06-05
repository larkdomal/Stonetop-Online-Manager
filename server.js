const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '/data';

fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

function safeId(id) {
  return /^[a-zA-Z0-9_-]{6,80}$/.test(id);
}
function fileFor(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

app.post('/api/jsonBlob', (req, res) => {
  const id = crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(fileFor(id), JSON.stringify(req.body ?? {}, null, 2));
  res.set('Location', `/api/jsonBlob/${id}`);
  res.status(201).json({ id });
});

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
  fs.writeFileSync(fileFor(id), JSON.stringify(req.body ?? {}, null, 2));
  res.json({ ok: true });
});

app.get('/health', (_, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Stonetop self-sync server running on port ${PORT}, data dir ${DATA_DIR}`);
});
