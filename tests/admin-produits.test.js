const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const { ouvrirBase } = require("../database");

test("CRUD produits protégé et répercussion sur la boutique", async () => {
  const db = ouvrirBase(":memory:");
  db.exec("INSERT INTO categories VALUES (1, 'Art'), (2, 'Accessoires')");
  db.prepare("INSERT INTO produits VALUES (120, 'Original', 'Description', ?, 2990, 1)")
    .run("images/t-shirt-abyss.png");
  const app = express();
  const ecouter = app.listen;
  app.listen = () => app;
  const fauxExpress = () => app;
  fauxExpress.static = express.static;
  const racine = path.join(__dirname, "..");
  vm.runInNewContext(fs.readFileSync(path.join(racine, "app.js"), "utf8"), {
    __dirname: racine, process, console,
    require(nom) {
      if (nom === "express") return fauxExpress;
      if (nom === "./database") return { ouvrirBase: () => db };
      return require(nom.startsWith("./") ? path.join(racine, nom) : nom);
    }
  });
  app.listen = ecouter;
  const jeton = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions_admin VALUES (?, ?, 1, ?)")
    .run(crypto.createHash("sha256").update(jeton).digest("hex"), csrf, Date.now() + 60000);
  const cookie = `mnobody_admin=${jeton}`;
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (url, session = true) => fetch(base + url, { redirect: "manual", headers: session ? { cookie } : {} });
  const post = (url, champs = {}, session = true) => fetch(base + url, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(session ? { cookie } : {}) },
    body: new URLSearchParams({ csrf, ...champs })
  });
  const produit = { nom: "Nouveau <b>produit</b>", description: "Description <script>alert(1)</script>",
    prix: "12,34", categorie_id: "1", image: "images/t-shirt-abyss.png" };
  try {
    const sante = await get("/healthz", false);
    assert.equal(sante.status, 200);
    assert.deepEqual(await sante.json(), { statut: "ok" });
    assert.equal(sante.headers.get("cache-control"), "no-store");
    assert.equal(sante.headers.get("x-powered-by"), null);
    assert.match(sante.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal((await get("/absente", false)).status, 404);
    assert.equal((await get("/api/produits/120", false)).status, 404);
    assert.equal((await get("/produit/120", false)).status, 404);
    assert.deepEqual(await (await get("/api/produits", false)).json(), []);
    const ancienneBoutique = await get("/boutique", false);
    assert.equal(ancienneBoutique.status, 301);
    assert.equal(ancienneBoutique.headers.get("location"), "/galerie");
    assert.equal((await get("/admin/produits", false)).status, 303);
    assert.equal((await post("/admin/produits", produit, false)).status, 403);
    assert.equal((await post("/admin/produits", { ...produit, csrf: "invalide" })).status, 403);
    assert.equal((await get("/admin/produits")).status, 200);
    assert.equal((await get("/admin/produits/nouveau")).status, 200);
    for (const changement of [
      { nom: " " }, { nom: "x".repeat(201) }, { description: "" }, { description: "x".repeat(4001) },
      { prix: "-1" }, { prix: "1.999" }, { prix: "1e2" }, { prix: "1000000" },
      { categorie_id: "999" }, { categorie_id: "abc" },
      { image: "../database.js" }, { image: "https://example.org/a.png" }, { image: "images/inexistante.png" }
    ]) {
      assert.equal((await post("/admin/produits", { ...produit, ...changement })).status, 400, JSON.stringify(changement));
      assert.equal(db.prepare("SELECT count(*) AS n FROM produits").get().n, 1);
    }
    assert.equal((await post("/admin/produits", produit)).status, 303);
    const nouveau = db.prepare("SELECT * FROM produits WHERE id > 120").get();
    assert.equal(nouveau.prix_centimes, 1234);
    const id = nouveau.id;
    let listeFiltree = await (await get("/admin/produits?q=nouveau&categorie=1&tri=prix_asc")).text();
    assert.match(listeFiltree, /1 produit\(s\) affiché\(s\) sur 2/);
    assert.ok(!listeFiltree.includes('href="/produit/120"'));
    listeFiltree = await (await get("/admin/produits?q=absent")).text();
    assert.match(listeFiltree, /Aucun produit ne correspond/);
    listeFiltree = await (await get("/admin/produits?tri=prix_asc")).text();
    assert.ok(listeFiltree.indexOf(`href="/produit/${id}"`) < listeFiltree.indexOf('href="/produit/120"'));
    listeFiltree = await (await get("/admin/produits?tri=prix_desc")).text();
    assert.ok(listeFiltree.indexOf('href="/produit/120"') < listeFiltree.indexOf(`href="/produit/${id}"`));
    assert.equal((await get("/admin/produits?q=a&q=b&tri=__proto__")).status, 200);
    let fiche = await get(`/api/produits/${id}`, false);
    assert.equal(fiche.status, 404);
    fiche = await get(`/produit/${id}`, false);
    assert.equal(fiche.status, 404);
    let formulaire = await get(`/admin/produits/${id}/modifier`);
    assert.equal(formulaire.status, 200);
    assert.match(await formulaire.text(), /&lt;b&gt;produit&lt;\/b&gt;/);
    assert.equal((await post(`/admin/produits/${id}/modifier`, { ...produit, prix: "9.99", categorie_id: "2", nom: "Modifié" })).status, 303);
    assert.equal((await get(`/api/produits/${id}`, false)).status, 404);
    const actualise = db.prepare("SELECT prix_centimes, categorie_id FROM produits WHERE id=?").get(id);
    assert.equal(actualise.prix_centimes, 999);
    assert.equal(actualise.categorie_id, 2);
    assert.equal((await post(`/admin/produits/${id}/modifier`, { ...produit, prix: "incorrect" })).status, 400);
    assert.equal(db.prepare("SELECT prix_centimes FROM produits WHERE id = ?").get(id).prix_centimes, 999);
    assert.equal((await get(`/admin/produits/${id}/supprimer`)).status, 200);
    assert.ok(db.prepare("SELECT id FROM produits WHERE id = ?").get(id));
    assert.equal((await post(`/admin/produits/${id}/supprimer`)).status, 303);
    assert.equal((await get(`/api/produits/${id}`, false)).status, 404);
    assert.equal((await get(`/produit/${id}`, false)).status, 404);
    assert.equal((await post(`/admin/produits/${id}/supprimer`)).status, 404);
    assert.equal((await post(`/admin/produits/${id}/modifier`, produit)).status, 404);
    assert.equal((await get("/admin/produits/abc/modifier")).status, 404);
    assert.equal((await post("/admin/produits", { ...produit, prix: "0" })).status, 303);
    const suivant = db.prepare("SELECT * FROM produits WHERE id > 120").get();
    assert.ok(suivant.id > id, "Un identifiant supprimé ne doit pas être réutilisé");
    assert.equal(suivant.prix_centimes, 0);
    formulaire = await get(`/admin/produits/${suivant.id}/modifier`);
    assert.match(await formulaire.text(), /value="0.00"/);
    assert.equal((await get("/boutique", false)).status, 301);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
