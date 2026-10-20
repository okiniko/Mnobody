const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const { ouvrirBase } = require("../database");
const { installerAdmin } = require("../admin");

test("gestion protégée des catégories et intégrité des produits", async () => {
  const db = ouvrirBase(":memory:");
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  installerAdmin(app, db);
  const jeton = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions_admin VALUES (?, ?, 1, ?)")
    .run(crypto.createHash("sha256").update(jeton).digest("hex"), csrf, Date.now() + 60000);
  const cookie = `mnobody_admin=${jeton}`;
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (url, avecSession = true) => fetch(base + url, {
    redirect: "manual", headers: avecSession ? { cookie } : {}
  });
  const post = (url, champs = {}, avecSession = true) => fetch(base + url, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(avecSession ? { cookie } : {}) },
    body: new URLSearchParams({ csrf, ...champs })
  });
  try {
    assert.equal((await get("/admin/categories", false)).status, 303);
    assert.equal((await post("/admin/categories", { nom: "Interdit" }, false)).status, 403);
    assert.equal((await post("/admin/categories", { nom: "Interdit", csrf: "invalide" })).status, 403);
    assert.equal((await post("/admin/categories", { nom: "   " })).status, 400);
    assert.equal((await post("/admin/categories", { nom: "x".repeat(101) })).status, 400);
    assert.equal((await post("/admin/categories", { nom: "  Décoration  " })).status, 303);
    const id = db.prepare("SELECT id FROM categories WHERE nom = ?").get("Décoration").id;
    const sansAccent = await (await get("/admin/categories?q=DECORATION")).text();
    assert.match(sansAccent, /1 catégorie\(s\) affichée\(s\) sur 1/);
    assert.equal((await post("/admin/categories", { nom: "DÉCORATION" })).status, 409);
    assert.equal((await post("/admin/categories", { nom: "Accessoires" })).status, 303);
    assert.equal((await post(`/admin/categories/${id}/renommer`, { nom: "accessoires" })).status, 409);
    assert.equal((await post(`/admin/categories/${id}/renommer`, { nom: "<b>Art</b>" })).status, 303);
    let page = await get("/admin/categories");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /&lt;b&gt;Art&lt;\/b&gt;/);
    db.prepare("INSERT INTO produits VALUES (1, 'Produit', 'Description', 'images/test.png', 100, ?)").run(id);
    let resultat = await (await get("/admin/categories?q=access&etat=vides")).text();
    assert.match(resultat, /1 catégorie\(s\) affichée\(s\) sur 2/);
    assert.ok(!resultat.includes(`action="/admin/categories/${id}/renommer"`));
    resultat = await (await get("/admin/categories?etat=avec-produits")).text();
    assert.match(resultat, /1 catégorie\(s\) affichée\(s\) sur 2/);
    resultat = await (await get("/admin/categories?q=absent")).text();
    assert.match(resultat, /Aucune catégorie ne correspond/);
    assert.equal((await get("/admin/categories?q=a&q=b&etat=invalide")).status, 200);
    assert.equal((await post(`/admin/categories/${id}/renommer`, { nom: "Art" })).status, 303);
    assert.equal(db.prepare("SELECT categorie_id FROM produits WHERE id = 1").get().categorie_id, id);
    assert.equal((await post(`/admin/categories/${id}/supprimer`)).status, 409);
    assert.ok(db.prepare("SELECT id FROM categories WHERE id = ?").get(id));
    const vide = db.prepare("SELECT id FROM categories WHERE nom = 'Accessoires'").get().id;
    page = await get(`/admin/categories/${vide}/supprimer`);
    assert.equal(page.status, 200);
    assert.ok(db.prepare("SELECT id FROM categories WHERE id = ?").get(vide));
    assert.equal((await post(`/admin/categories/${vide}/supprimer`)).status, 303);
    assert.equal(db.prepare("SELECT id FROM categories WHERE id = ?").get(vide), undefined);
    assert.equal((await post(`/admin/categories/${vide}/supprimer`)).status, 404);
    assert.equal((await post("/admin/categories/abc/renommer", { nom: "Autre" })).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});

test("le filtre public utilise la catégorie plutôt que le nom du produit", () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "script.js"), "utf8");
  const contexte = {};
  vm.runInNewContext(source.slice(source.indexOf("class Catalogue {"), source.indexOf("class Panier {")) +
    "\nglobalThis.Catalogue = Catalogue;", contexte);
  const catalogue = Object.create(contexte.Catalogue.prototype);
  catalogue.produits = [
    { nom: "Sweat classique", description: "", prix: 20, categorie_id: 1 },
    { nom: "Sweat zippé", description: "", prix: 30, categorie_id: 2 },
    { nom: "Création originale", description: "", prix: 25, categorie_id: 1 }
  ];
  catalogue.recherche = { value: "" };
  catalogue.filtre = { value: "1" };
  catalogue.tri = { value: "defaut" };
  catalogue.productList = { innerHTML: "" };
  catalogue.afficherProduits = () => {};
  catalogue.appliquerFiltres();
  assert.deepEqual(catalogue.produitsFiltres.map(p => p.nom), ["Sweat classique", "Création originale"]);
  catalogue.filtre.value = "tous";
  catalogue.appliquerFiltres();
  assert.equal(catalogue.produitsFiltres.length, 3);
});
