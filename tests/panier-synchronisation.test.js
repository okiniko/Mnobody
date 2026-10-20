const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "public", "script.js"), "utf8");
const produit = (id, prix = 10) => ({ id, prix, nom: `Produit ${id}`, description: "Description actuelle",
  image: "images/t-shirt-abyss.png", categorie_id: 1, categorie: "Art" });
const copie = valeur => JSON.parse(JSON.stringify(valeur));

function environnement(items, fetch) {
  let sauvegarde = JSON.stringify(items);
  let ecritures = 0;
  const contexte = {
    fetch, console: { error() {} },
    sessionStorage: {
      valeurs: new Map(),
      getItem(cle) { return this.valeurs.get(cle) || null; },
      setItem(cle, valeur) { this.valeurs.set(cle, valeur); },
      removeItem(cle) { this.valeurs.delete(cle); }
    },
    document: { querySelector: () => null },
    localStorage: {
      getItem: () => sauvegarde,
      setItem(cle, valeur) { sauvegarde = valeur; ecritures++; }
    }
  };
  vm.runInNewContext(source.slice(0, source.indexOf('const productList =')) +
    source.slice(source.indexOf('class Panier {'), source.indexOf('class Modal {')) +
    '\nglobalThis.Panier = Panier; globalThis.charger = chargerProduits;', contexte);
  const panier = new contexte.Panier();
  panier.messageSynchronisation = { textContent: "" };
  panier.total = { textContent: "" };
  return { panier, contexte, sauvegarde: () => JSON.parse(sauvegarde), ecritures: () => ecritures };
}

test("actualise les informations, retire les produits supprimés et conserve les quantités", async () => {
  const ancien = { ...produit(1, 5), nom: "Ancien nom", quantite: 3 };
  const env = environnement([ancien, { ...produit(2), quantite: 1 }],
    async () => ({ ok: true, json: async () => [produit(1, 12.34)] }));
  await env.panier.synchroniser();
  assert.deepEqual(copie(env.panier.items), [{ ...produit(1, 12.34), quantite: 3 }]);
  assert.deepEqual(env.sauvegarde(), copie(env.panier.items));
  assert.equal(env.panier.total.textContent, "TOTAL 37.02 €");
  assert.match(env.panier.messageSynchronisation.textContent, /actualisés/);
  assert.match(env.panier.messageSynchronisation.textContent, /retirés/);
});

test("conserve le panier sur erreur réseau, HTTP ou catalogue invalide", async () => {
  const items = [{ ...produit(1), quantite: 2 }];
  const reponses = [
    async () => { throw new Error("Hors ligne"); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => { throw new Error("JSON invalide"); } }),
    async () => ({ ok: true, json: async () => ({ erreur: "Serveur" }) }),
    async () => ({ ok: true, json: async () => [produit(1), { id: 2 }] }),
    async () => ({ ok: true, json: async () => [produit(1), produit(1)] })
  ];
  for (const fetch of reponses) {
    const env = environnement(items, fetch);
    await env.panier.synchroniser();
    assert.deepEqual(copie(env.panier.items), items);
    assert.deepEqual(env.sauvegarde(), items);
    assert.equal(env.ecritures(), 0);
    assert.match(env.panier.messageSynchronisation.textContent, /sauvegardées sont conservées/);
  }
});

test("un catalogue vide valide retire tous les produits", async () => {
  const env = environnement([{ ...produit(1), quantite: 2 }],
    async () => ({ ok: true, json: async () => [] }));
  await env.panier.synchroniser();
  assert.deepEqual(env.sauvegarde(), []);
  assert.equal(env.panier.total.textContent, "TOTAL 0.00 €");
});

test("ne rétablit pas les quantités ou articles modifiés pendant le chargement", async () => {
  for (const vider of [false, true]) {
    let terminer;
    const env = environnement([{ ...produit(1), quantite: 2 }],
      () => new Promise(resolve => { terminer = resolve; }));
    const attente = env.panier.synchroniser();
    if (vider) env.panier.items = [];
    else {
      env.panier.items[0].quantite = 4;
      env.panier.addToCart(produit(2));
    }
    terminer({ ok: true, json: async () => [produit(1, 20), produit(2)] });
    await attente;
    assert.deepEqual(env.sauvegarde(), vider ? [] : [
      { ...produit(1, 20), quantite: 4 }, { ...produit(2), quantite: 1 }
    ]);
  }
});

test("partage le chargement du catalogue et ignore les paniers vides", async () => {
  let appels = 0;
  const env = environnement([{ ...produit(1), quantite: 1 }], async (url, options) => {
    appels++;
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => [produit(1)] };
  });
  await Promise.all([env.contexte.charger(), env.panier.synchroniser()]);
  assert.equal(appels, 1);
  const vide = environnement([], () => { throw new Error("Requête inutile"); });
  await vide.panier.synchroniser();
  assert.equal(vide.ecritures(), 0);
});

test("une confirmation ouverte pendant la synchronisation supprime le bon article", async () => {
  const env = environnement([{ ...produit(1), quantite: 1 }, { ...produit(2), quantite: 1 }],
    async () => ({ ok: true, json: async () => [produit(2)] }));
  let confirmer;
  env.contexte.modal = { confirmation(message, action) { confirmer = action; } };
  env.panier.supprimerProduit(1);
  await env.panier.synchroniser();
  confirmer();
  assert.deepEqual(env.sauvegarde(), [{ ...produit(2), quantite: 1 }]);
});


test("conserve l’avis de retrait entre la boutique et le panier, même devenu vide", async () => {
  const env = environnement([{ ...produit(1), quantite: 1 }],
    async () => ({ ok: true, json: async () => [] }));
  env.panier.messageSynchronisation = null;
  await env.panier.synchroniser();
  assert.match(env.contexte.sessionStorage.getItem("panier-avis"), /retirés/);
  const liste = { before() {} };
  env.contexte.document.querySelector = selecteur => selecteur === ".cart-list" ? liste : null;
  env.contexte.document.createElement = () => ({
    textContent: "", classList: { add() {} }, setAttribute() {}
  });
  const suivant = new env.contexte.Panier();
  await suivant.synchroniser();
  assert.match(suivant.messageSynchronisation.textContent, /retirés/);
  assert.equal(env.contexte.sessionStorage.getItem("panier-avis"), null);
});

test("une synchronisation sans changement conserve l’avis déjà affiché", async () => {
  const env = environnement([{ ...produit(1), quantite: 1 }],
    async () => ({ ok: true, json: async () => [produit(1)] }));
  env.panier.messageSynchronisation.textContent = "Un produit a été retiré du panier.";
  await env.panier.synchroniser();
  assert.equal(env.panier.messageSynchronisation.textContent, "Un produit a été retiré du panier.");
});

test("confirme le retrait manuel et le vidage dans le panier", () => {
  const env = environnement([{ ...produit(1), quantite: 1 }], async () => {});
  env.contexte.modal = { confirmation(message, action) { action(); } };
  env.panier.supprimerProduit(1);
  assert.match(env.panier.messageSynchronisation.textContent, /Produit 1.*retiré/);
  assert.deepEqual(env.sauvegarde(), []);
  env.panier.viderPanier();
  assert.equal(env.panier.messageSynchronisation.textContent, "Votre panier a été vidé.");
});

test("limite à trois tirages d’une même œuvre en cumulant les formats, sans limiter les textiles", async () => {
  const petit={...produit(1),oeuvre_id:1,support:'dibond',exemplaires_restants:49};
  const grand={...produit(2),oeuvre_id:1,support:'dibond',exemplaires_restants:49};
  const textile={...produit(3),oeuvre_id:1,support:'textile'};
  const env=environnement([],async()=>({ok:true,json:async()=>[petit,grand,textile]}));
  env.panier.addToCart(petit);env.panier.addToCart(grand);env.panier.addToCart(grand);env.panier.addToCart(petit);
  assert.equal(env.panier.items.reduce((n,i)=>n+i.quantite,0),3);
  assert.match(env.panier.messageSynchronisation.textContent,/Maximum 3/);
  for(let i=0;i<4;i++) env.panier.addToCart(textile);
  assert.equal(env.panier.items.find(i=>i.id===3).quantite,4);
});
test("réduit un ancien panier au quota cumulé et aux exemplaires restants", async () => {
  const a={...produit(1),oeuvre_id:1,support:'dibond',exemplaires_restants:2};
  const b={...produit(2),oeuvre_id:1,support:'dibond',exemplaires_restants:2};
  const env=environnement([{...a,quantite:2},{...b,quantite:3}],async()=>({ok:true,json:async()=>[a,b]}));
  await env.panier.synchroniser();
  assert.equal(env.panier.items.reduce((n,i)=>n+i.quantite,0),2);
  assert.match(env.panier.messageSynchronisation.textContent,/quantités ont été ajustées/);
  const vide=environnement([{...a,quantite:1}],async()=>({ok:true,json:async()=>[{...a,exemplaires_restants:0}]}));
  await vide.panier.synchroniser();assert.equal(vide.panier.items.length,0);
});
