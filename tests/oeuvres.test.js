const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const { ouvrirBase, migrer } = require("../database");
const { validerVariante } = require("../art");
const racine = path.join(__dirname, "..");

test("la migration d’art ne change aucun produit ni identifiant existant", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const nom of ["001-catalogue.sql", "002-administration.sql", "003-compteur-produits.sql"]) db.exec(fs.readFileSync(path.join(racine, "migrations", nom), "utf8"));
    db.exec("INSERT INTO categories VALUES (1, 'Art'); INSERT INTO produits VALUES (120, 'Ancien', 'Texte', 'images/print-abyss.png', 4990, 1)");
    const avant = db.prepare("SELECT * FROM produits").all();
    migrer(db); migrer(db);
    assert.deepEqual(db.prepare("SELECT * FROM produits").all(), avant);
    assert.equal(db.prepare("SELECT count(*) AS n FROM oeuvres").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM variantes").get().n, 0);
  } finally { db.close(); }
});

test("œuvres protégées, variantes transactionnelles et visibilité publique cohérente", async () => {
  const db = ouvrirBase(":memory:");
  db.exec("INSERT INTO categories VALUES (1, 'Art'); INSERT INTO produits VALUES (120, 'Ancien', 'Texte', 'images/print-abyss.png', 4990, 1)");
  const app = express();
  const originalListen = app.listen;
  app.listen = () => app;
  const fauxExpress = () => app; fauxExpress.static = express.static;
  vm.runInNewContext(fs.readFileSync(path.join(racine, "app.js"), "utf8"), {
    __dirname: racine, process, console,
    require(nom) { if (nom === "express") return fauxExpress;
      if (nom === "./database") return { ouvrirBase: () => db };
      return require(nom.startsWith("./") ? path.join(racine, nom) : nom); }
  });
  app.listen = originalListen;
  const jeton = crypto.randomBytes(32).toString("hex"), csrf = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions_admin VALUES (?, ?, 1, ?)").run(crypto.createHash("sha256").update(jeton).digest("hex"), csrf, Date.now() + 60000);
  const serveur = app.listen(0, "127.0.0.1"); await new Promise(r => serveur.once("listening", r));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const get = (url, auth = false) => fetch(base + url, { redirect: "manual", headers: auth ? {cookie: `mnobody_admin=${jeton}`} : {} });
  const post = (url, champs, token = csrf) => fetch(base + url, { method: "POST", redirect: "manual",
    headers: {cookie: `mnobody_admin=${jeton}`, "content-type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({ csrf: token, ...champs }) });
  const oeuvre = {titre: '<script>Art</script>', description: 'Histoire <b>de l’œuvre</b>', image: 'images/print-abyss.png', serie: 'Série', annee: '2026', edition: 'limitee', tirage: '49', statut: 'brouillon'};
  const produit = {nom: 'Tirage', description: 'Texte', image: 'images/print-abyss.png', prix: '99,90', categorie_id: '1'};
  try {
    assert.equal((await get('/admin/oeuvres')).status, 303);
    assert.equal((await post('/admin/oeuvres', oeuvre, 'incorrect')).status, 403);
    assert.equal((await get('/admin/oeuvres/nouvelle', true)).status, 200);
    assert.equal((await post('/admin/oeuvres', {...oeuvre, tirage:'48'})).status, 400);
    assert.equal((await post('/admin/oeuvres', {...oeuvre, images:'../database.js'})).status, 400);
    assert.equal((await post('/admin/oeuvres', oeuvre)).status, 303);
    const id = db.prepare('SELECT id FROM oeuvres').get().id;
    const dibond = {...produit, oeuvre_id:String(id), support:'dibond', largeur_mm:'500', hauteur_mm:'700', finition:'Blanc 3 mm', disponible:'1', fournisseur:'pixartprinting', reference_fournisseur:'REFERENCE-PRIVEE'};
    for (const modif of [{largeur_mm:'0'}, {hauteur_mm:'1.5'}, {oeuvre_id:'9999'}, {taille:'M'}, {fournisseur:'spreadconnect'}, {disponible:'oui'}]) {
      assert.equal((await post('/admin/produits', {...dibond,...modif})).status, 400);
      assert.equal(db.prepare('SELECT count(*) AS n FROM produits').get().n, 1);
    }
    assert.equal((await post('/admin/produits', dibond)).status, 303);
    const variante = db.prepare('SELECT produit_id FROM variantes').get().produit_id;
    assert.ok(variante > 120);
    assert.equal((await get(`/oeuvre/${id}`)).status, 404);
    assert.equal((await get(`/api/produits/${variante}`)).status, 404);
    assert.equal((await get('/galerie')).status, 200);
    assert.equal((await post(`/admin/oeuvres/${id}/modifier`, {...oeuvre,statut:'publiee'})).status, 303);
    const fiche = await (await get(`/oeuvre/${id}`)).text();
    assert.match(fiche, /50 × 70 <small>cm/);
    assert.match(fiche, /&lt;script&gt;Art&lt;\/script&gt;/);
    assert.ok(!fiche.includes('Déclinaisons textiles'));
    const api = await (await get(`/api/produits/${variante}`)).json();
    assert.equal(api.oeuvre_id,id); assert.equal(api.prix,99.9);
    assert.ok(!JSON.stringify(api).includes('REFERENCE-PRIVEE'));
    assert.match(await (await get(`/produit/${variante}`)).text(), /50 × 70 cm/);
    assert.equal((await get(`/admin/produits/${variante}/modifier`,true)).status,200);
    const textile = {...produit, nom:'T-shirt', oeuvre_id:String(id), support:'textile', taille:'M', couleur:'Noir', fournisseur:'spreadconnect'};
    assert.equal((await post('/admin/produits',textile)).status,303);
    assert.match(await (await get(`/oeuvre/${id}`)).text(), /Déclinaisons textiles/);
    assert.equal((await post(`/admin/produits/${variante}/modifier`,{...dibond,disponible:'0'})).status,303);
    assert.equal((await get(`/api/produits/${variante}`)).status,404);
    const annonce = await (await get(`/oeuvre/${id}`)).text();
    assert.match(annonce, /50 × 70 <small>cm/);
    assert.match(annonce, /Bientôt disponible/);
    assert.match(annonce, /Les ventes ne sont pas encore ouvertes/);
    assert.ok(!annonce.includes(`href="/produit/${variante}"`));
    assert.ok(!annonce.includes('REFERENCE-PRIVEE'));
    assert.ok(!annonce.includes('disponible(s) à la réservation'));
    assert.match(await (await get('/galerie')).text(), /Tirages bientôt disponibles/);
    assert.equal(db.prepare('SELECT prix_centimes FROM produits WHERE id=?').get(variante).prix_centimes,9990);
    assert.equal((await post(`/admin/oeuvres/${id}/modifier`,{...oeuvre,statut:'archivee'})).status,303);
    assert.equal((await get(`/oeuvre/${id}`)).status,404);
    assert.equal((await (await get('/api/produits')).json()).length,0);
    assert.throws(()=>db.prepare('DELETE FROM oeuvres WHERE id=?').run(id),/FOREIGN KEY/);
    assert.equal((await post(`/admin/produits/${variante}/supprimer`,{})).status,303);
    assert.equal(db.prepare('SELECT count(*) AS n FROM variantes WHERE produit_id=?').get(variante).n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM oeuvres').get().n,1);
  } finally { await new Promise(r=>serveur.close(r)); db.close(); }
});

test("une déclinaison textile exige une taille sans imposer de dimensions Dibond", () => {
  const db=ouvrirBase(':memory:');
  try {
    db.exec("INSERT INTO oeuvres (titre,description,image) VALUES ('Art','Texte','images/print-abyss.png')");
    assert.equal(validerVariante(db,{oeuvre_id:'1',support:'textile',taille:'XL'}).erreurs.length,0);
    assert.ok(validerVariante(db,{oeuvre_id:'1',support:'textile'}).erreurs.length);
    assert.ok(validerVariante(db,{oeuvre_id:'1',support:'textile',taille:'XL',largeur_mm:'500'}).erreurs.length);
    assert.equal(validerVariante(db,{}).variante,null);
  } finally {db.close();}
});
