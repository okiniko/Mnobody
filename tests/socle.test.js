const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const { ouvrirBase, migrer } = require("../database");
const { sauvegarder } = require("../scripts/sauvegarder");
const { installerAdmin, definirAdministrateur } = require("../admin");
const { installerSecurite } = require("../securite");

test("adopte une base existante, conserve ses données et refuse un code trop ancien", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(fs.readFileSync(path.join(__dirname, "../migrations/001-catalogue.sql"), "utf8"));
    db.exec("INSERT INTO categories VALUES (1, 'Art'); INSERT INTO produits VALUES (42, 'Œuvre', 'Texte', 'images/test.png', 12345, 1)");
    migrer(db);
    migrer(db);
    assert.equal(db.prepare("SELECT count(*) AS n FROM migrations").get().n, 5);
    assert.equal(db.prepare("SELECT prix_centimes FROM produits WHERE id=42").get().prix_centimes, 12345);
    assert.equal(db.prepare("SELECT dernier_id FROM compteur_produits").get().dernier_id, 42);
    db.exec("INSERT INTO migrations (nom) VALUES ('999-future.sql')");
    assert.throws(() => migrer(db), /plus récente/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM produits").get().n, 1);
  } finally { db.close(); }
});

test("sauvegarde cohérente avec WAL, restauration et refus d'écrasement", () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "mnobody-"));
  const source = path.join(dossier, "source.sqlite");
  const copie = path.join(dossier, "copie.sqlite");
  const restauree = path.join(dossier, "restauree.sqlite");
  const db = ouvrirBase(source);
  try {
    db.exec("PRAGMA journal_mode=WAL; INSERT INTO categories VALUES (1, 'Dibond')");
    sauvegarder(source, copie);
    sauvegarder(copie, restauree);
    const lecture = ouvrirBase(restauree);
    try { assert.equal(lecture.prepare("SELECT nom FROM categories").get().nom, "Dibond"); }
    finally { lecture.close(); }
    assert.equal(fs.statSync(copie).mode & 0o777, 0o600);
    assert.throws(() => sauvegarder(source, copie), /EEXIST/);
    assert.throws(() => sauvegarder(path.join(dossier, "absente"), path.join(dossier, "vide")));
    assert.ok(!fs.existsSync(path.join(dossier, "absente")));
  } finally { db.close(); fs.rmSync(dossier, { recursive: true, force: true }); }
});

test("connexion admin, rotation, révocation, CSRF et limitation des sessions anonymes", async () => {
  const db = ouvrirBase(":memory:");
  await definirAdministrateur(db, "admin", "mot-de-passe-test-unique");
  const app = express();
  installerSecurite(app);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  installerAdmin(app, db);
  const serveur = app.listen(0, "127.0.0.1");
  await new Promise(resolve => serveur.once("listening", resolve));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const get = (url, cookie) => fetch(base + url, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const post = (url, cookie, body) => fetch(base + url, { method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  try {
    const page = await get("/admin/connexion");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("x-powered-by"), null);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(page.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
    const cookie = page.headers.get("set-cookie").split(";")[0];
    const csrf = (await page.text()).match(/name="csrf" value="([a-f0-9]+)"/)[1];
    assert.equal((await post("/admin/connexion", cookie, { csrf: "faux" })).status, 403);
    assert.equal((await post("/admin/connexion", cookie, { csrf, identifiant: "admin", motDePasse: "incorrect" })).status, 401);
    const connexion = await post("/admin/connexion", cookie, { csrf, identifiant: "admin", motDePasse: "mot-de-passe-test-unique" });
    assert.equal(connexion.status, 303);
    const nouveau = connexion.headers.get("set-cookie").split(";")[0];
    assert.notEqual(nouveau, cookie);
    assert.equal((await get("/admin", cookie)).status, 303);
    assert.equal((await get("/admin", nouveau)).status, 200);
    db.exec("UPDATE sessions_admin SET expiration = 0 WHERE connectee = 1");
    assert.equal((await get("/admin", nouveau)).status, 303);
    await definirAdministrateur(db, "admin", "autre-mot-de-passe-unique");
    assert.equal((await get("/admin", nouveau)).status, 303);
    for (let i = 0; i < 20; i++) assert.equal((await get("/admin/connexion")).status, 200);
    assert.equal((await get("/admin/connexion")).status, 429);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sessions_admin").get().n, 20);
    db.exec("DELETE FROM tentatives_admin; DELETE FROM sessions_admin");
    const p = await get("/admin/connexion");
    const c = p.headers.get("set-cookie").split(";")[0];
    const token = (await p.text()).match(/name="csrf" value="([a-f0-9]+)"/)[1];
    for (let i = 0; i < 5; i++) assert.equal((await post("/admin/connexion", c, { csrf: token })).status, 401);
    assert.equal((await post("/admin/connexion", c, { csrf: token })).status, 429);
  } finally { await new Promise(resolve => serveur.close(resolve)); db.close(); }
});
