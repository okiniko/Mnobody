const express = require("express");
const { routesCategories } = require("./admin-categories");
const { routesProduits } = require("./admin-produits");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const empreinte = valeur => crypto.createHash("sha256").update(valeur).digest("hex");
const COOKIE = "mnobody_admin";

function preparerAdmin(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS administrateur (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      identifiant TEXT NOT NULL,
      sel TEXT NOT NULL,
      mot_de_passe TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions_admin (
      jeton TEXT PRIMARY KEY,
      csrf TEXT NOT NULL,
      connectee INTEGER NOT NULL DEFAULT 0,
      expiration INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tentatives_admin (
      cle TEXT PRIMARY KEY,
      nombre INTEGER NOT NULL,
      expiration INTEGER NOT NULL
    );
  `);
}

async function definirAdministrateur(db, identifiant, motDePasse) {
  if (!/^[a-zA-Z0-9_.@-]{3,100}$/.test(identifiant)) {
    throw new Error("Identifiant : 3 à 100 lettres, chiffres ou caractères _ . @ -");
  }
  if (typeof motDePasse !== "string" || motDePasse.length < 14 || motDePasse.length > 256) {
    throw new Error("Le mot de passe doit contenir entre 14 et 256 caractères.");
  }
  preparerAdmin(db);
  const sel = crypto.randomBytes(32).toString("hex");
  const hash = (await scrypt(motDePasse, sel, 64)).toString("hex");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO administrateur VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET identifiant=excluded.identifiant,
      sel=excluded.sel, mot_de_passe=excluded.mot_de_passe`).run(identifiant, sel, hash);
    db.exec("DELETE FROM sessions_admin; DELETE FROM tentatives_admin; COMMIT;");
  } catch (erreur) {
    db.exec("ROLLBACK");
    throw erreur;
  }
}

function installerAdmin(app, db, { secureCookies = true } = {}) {
  preparerAdmin(db);
  const router = express.Router();
  const optionsCookie = { httpOnly: true, secure: secureCookies, sameSite: "strict", path: "/admin" };
  const lireSession = db.prepare("SELECT * FROM sessions_admin WHERE jeton = ? AND expiration > ?");
  const supprimerSession = db.prepare("DELETE FROM sessions_admin WHERE jeton = ?");

  function creerSession(res, connectee) {
    const jeton = crypto.randomBytes(32).toString("hex");
    const csrf = crypto.randomBytes(32).toString("hex");
    const duree = connectee ? 8 * 60 * 60 * 1000 : 20 * 60 * 1000;
    db.prepare("INSERT INTO sessions_admin VALUES (?, ?, ?, ?)")
      .run(empreinte(jeton), csrf, connectee ? 1 : 0, Date.now() + duree);
    res.cookie(COOKIE, jeton, { ...optionsCookie, maxAge: duree });
    return { jeton: empreinte(jeton), csrf, connectee: connectee ? 1 : 0 };
  }

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "same-origin");
    const maintenant = Date.now();
    db.prepare("DELETE FROM sessions_admin WHERE expiration <= ?").run(maintenant);
    db.prepare("DELETE FROM tentatives_admin WHERE expiration <= ?").run(maintenant);
    const cookie = (req.headers.cookie || "").split(";")
      .map(partie => partie.trim()).find(partie => partie.startsWith(COOKIE + "="));
    const jeton = cookie?.slice(COOKIE.length + 1);
    req.sessionAdmin = jeton && /^[a-f0-9]{64}$/.test(jeton)
      ? lireSession.get(empreinte(jeton), maintenant) : undefined;
    next();
  });
  router.use(express.urlencoded({ extended: false, limit: "64kb" }));
  router.use((req, res, next) => {
    if (req.method === "POST") {
      const attendu = req.sessionAdmin?.csrf;
      const recu = req.body?.csrf;
      if (typeof recu !== "string" || !/^[a-f0-9]{64}$/.test(recu) || !attendu ||
          !crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu))) {
        return res.status(403).send("Formulaire expiré ou invalide. Rechargez la page.");
      }
    }
    next();
  });

  router.get("/connexion", (req, res) => {
    if (req.sessionAdmin?.connectee) return res.redirect("/admin");
    const session = req.sessionAdmin || creerSession(res, false);
    return res.render("admin/connexion", { csrf: session.csrf, erreur: null });
  });

  router.post("/connexion", async (req, res) => {
    const session = req.sessionAdmin;
    // La limite globale couvre aussi les attaques distribuées ; la limite par IP est plus stricte.
    const cles = ["global", empreinte(req.ip || "inconnue")];
    const limites = [50, 5];
    for (let i = 0; i < cles.length; i++) {
      const tentative = db.prepare("SELECT nombre FROM tentatives_admin WHERE cle = ?").get(cles[i]);
      if (tentative && tentative.nombre >= limites[i]) {
        res.set("Retry-After", "900");
        return res.status(429).render("admin/connexion", {
          csrf: session.csrf, erreur: "Trop de tentatives. Réessayez dans 15 minutes."
        });
      }
    }
    for (const cle of cles) {
      db.prepare(`INSERT INTO tentatives_admin VALUES (?, 1, ?)
        ON CONFLICT(cle) DO UPDATE SET nombre = nombre + 1`).run(cle, Date.now() + 900000);
    }
    const admin = db.prepare("SELECT * FROM administrateur WHERE id = 1").get();
    const identifiant = typeof req.body.identifiant === "string" ? req.body.identifiant : "";
    const motDePasse = typeof req.body.motDePasse === "string" ? req.body.motDePasse : "";
    const hash = await scrypt(motDePasse.slice(0, 256), admin?.sel || "compte-non-configure", 64);
    if (!admin || identifiant !== admin.identifiant || motDePasse.length > 256 ||
        !crypto.timingSafeEqual(hash, Buffer.from(admin.mot_de_passe, "hex"))) {
      return res.status(401).render("admin/connexion", {
        csrf: session.csrf, erreur: "Identifiant ou mot de passe incorrect."
      });
    }
    // Une session expirée ou révoquée pendant la vérification ne doit pas être réactivée.
    if (!lireSession.get(session.jeton, Date.now())) return res.redirect(303, "/admin/connexion");
    supprimerSession.run(session.jeton);
    creerSession(res, true);
    return res.redirect(303, "/admin");
  });

  router.use((req, res, next) => {
    if (!req.sessionAdmin?.connectee) return res.redirect(303, "/admin/connexion");
    next();
  });
  router.use("/categories", routesCategories(db));
  router.use("/produits", routesProduits(db));
  router.get("/", (req, res) => {
    res.render("admin/index", { csrf: req.sessionAdmin.csrf });
  });
  router.post("/deconnexion", (req, res) => {
    supprimerSession.run(req.sessionAdmin.jeton);
    res.clearCookie(COOKIE, optionsCookie);
    res.redirect(303, "/admin/connexion");
  });
  router.use((erreur, req, res, next) => {
    console.error("Erreur administration :", erreur);
    if (res.headersSent) return next(erreur);
    res.status(erreur.status === 413 ? 413 : 500).send("Impossible de traiter la demande.");
  });
  app.use("/admin", router);
}

module.exports = { installerAdmin, definirAdministrateur };
