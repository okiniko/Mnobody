const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { ouvrirBase } = require('../database');
const { routesGalerie } = require('../galerie');

test('le musée ne publie que les œuvres exposées, sans données fournisseur ni accès aux originaux', async () => {
  const db = ouvrirBase(':memory:');
  db.exec(`INSERT INTO oeuvres(titre,description,image,statut) VALUES
    ('Publiée <script>', 'Texte', 'images/print-abyss.png', 'publiee'),
    ('Brouillon secret', 'Privé', 'images/print-abyss.png', 'brouillon'),
    ('Archive secrète', 'Privé', 'images/print-abyss.png', 'archivee')`);
  const app = express(); app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, '../views')); app.use(routesGalerie(db));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(url + '/api/musee'); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json(); assert.equal(data.length, 1); assert.deepEqual(Object.keys(data[0]), ['id', 'titre', 'description', 'image', 'finition']);
    const html = await (await fetch(url + '/musee')).text();
    assert.match(html, /Publiée &lt;script&gt;/); assert.ok(!html.includes('Brouillon secret')); assert.ok(!html.includes('Archive secrète'));
    assert.match(html, /href="\/oeuvre\/1"/); assert.match(html, /type="module" src="\/musee.js"/);
    db.exec("UPDATE oeuvres SET statut='archivee'");
    assert.deepEqual(await (await fetch(url + '/api/musee')).json(), []);
    const vide = await (await fetch(url + '/musee')).text(); assert.match(vide, /La première exposition se prépare/); assert.ok(!vide.includes('id="musee-demarrer"'));
  } finally { await new Promise(r => server.close(r)); db.close(); }
});
