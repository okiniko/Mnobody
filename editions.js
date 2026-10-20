const TIRAGE = 49;
const LIMITE_CLIENT = 3;
const DUREE_RESERVATION = 15 * 60 * 1000;
class ErreurEdition extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function refuser(code, message) { throw new ErreurEdition(code, message); }
function nettoyer(db, maintenant) {
  db.prepare("UPDATE commandes_editions SET etat='expiree' WHERE etat='reservee' AND expiration<=?").run(maintenant);
  db.exec("DELETE FROM tirages_editions WHERE commande_cle IN (SELECT cle FROM commandes_editions WHERE etat IN ('expiree','annulee'))");
}
function transaction(db, travail) {
  db.exec('BEGIN IMMEDIATE');
  try { const resultat = travail(); db.exec('COMMIT'); return resultat; }
  catch (erreur) { db.exec('ROLLBACK'); throw erreur; }
}
function lireArticles(db, articles) {
  if (!Array.isArray(articles) || !articles.length || articles.length > 100) refuser('PANIER_INVALIDE', 'Panier invalide.');
  const ids = new Set();
  return articles.map(article => {
    if (!article || !Number.isSafeInteger(article.id) || article.id < 1 || ids.has(article.id) ||
      !Number.isSafeInteger(article.quantite) || article.quantite < 1 || article.quantite > 99) refuser('PANIER_INVALIDE', 'Quantité ou article invalide.');
    ids.add(article.id);
    const p = db.prepare(`SELECT p.id, p.prix_centimes, v.oeuvre_id, v.support, v.disponible, o.statut, o.edition, o.tirage
      FROM produits p LEFT JOIN variantes v ON v.produit_id=p.id LEFT JOIN oeuvres o ON o.id=v.oeuvre_id WHERE p.id=?`).get(article.id);
    if (!p || !p.oeuvre_id || p.support !== 'dibond' || !p.disponible || p.statut !== 'publiee') refuser('ARTICLE_INDISPONIBLE', 'Ce tirage n’est pas disponible.');
    if (p.edition !== 'limitee' || p.tirage !== TIRAGE) refuser('EDITION_INVALIDE', 'Ce tirage doit appartenir à une édition de 49 exemplaires.');
    return { ...p, quantite: article.quantite };
  });
}
function numerosCommande(db, cle) {
  return db.prepare('SELECT oeuvre_id, numero, produit_id, prix_centimes FROM tirages_editions WHERE commande_cle=? ORDER BY oeuvre_id, numero').all(cle);
}
// Appel interne seulement : clientId doit provenir de la session authentifiée,
// jamais d'un champ envoyé par le navigateur. Aucune commande fournisseur ici.
function reserverTirages(db, { clientId, cle, articles }, maintenant = Date.now()) {
  if (!Number.isSafeInteger(clientId) || typeof cle !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(cle)) refuser('IDENTITE_INVALIDE', 'Client ou référence de commande invalide.');
  return transaction(db, () => {
    nettoyer(db, maintenant);
    const client = db.prepare('SELECT email_verifie FROM clients WHERE id=?').get(clientId);
    if (!client?.email_verifie) refuser('CONNEXION_REQUISE', 'Un compte client avec adresse e-mail vérifiée est nécessaire.');
    const existante = db.prepare('SELECT * FROM commandes_editions WHERE cle=?').get(cle);
    if (existante) {
      if (existante.client_id !== clientId) refuser('COMMANDE_INVALIDE', 'Référence de commande déjà utilisée.');
      if (!['reservee','vendue'].includes(existante.etat)) refuser('RESERVATION_TERMINEE', 'Cette réservation est terminée ; recommencez avec une nouvelle référence.');
      const lignes = numerosCommande(db, cle);
      const attendu = new Map();
      for (const ligne of lignes) attendu.set(ligne.produit_id, (attendu.get(ligne.produit_id) || 0) + 1);
      if (!Array.isArray(articles) || articles.length !== attendu.size || new Set(articles.map(a => a?.id)).size !== articles.length ||
        articles.some(a => !a || attendu.get(a.id) !== a.quantite)) refuser('COMMANDE_INVALIDE', 'Cette référence correspond à un autre panier.');
      return { cle, expiration: existante.expiration, etat: existante.etat, tirages: lignes };
    }
    const lignes = lireArticles(db, articles);
    const groupes = new Map();
    for (const l of lignes) groupes.set(l.oeuvre_id, (groupes.get(l.oeuvre_id) || 0) + l.quantite);
    for (const [oeuvreId, quantite] of groupes) {
      const acquis = db.prepare(`SELECT count(*) AS n FROM tirages_editions t JOIN commandes_editions c ON c.cle=t.commande_cle
        WHERE t.oeuvre_id=? AND c.client_id=? AND c.etat IN ('reservee','vendue')`).get(oeuvreId, clientId).n;
      if (quantite + acquis > LIMITE_CLIENT) refuser('LIMITE_CLIENT', 'Maximum 3 exemplaires par œuvre et par client, tous formats et commandes confondus.');
      const utilises = db.prepare('SELECT count(*) AS n FROM tirages_editions WHERE oeuvre_id=?').get(oeuvreId).n;
      if (quantite + utilises > TIRAGE) refuser('EDITION_EPUISEE', 'Cette édition ne dispose plus d’assez d’exemplaires.');
    }
    const expiration = maintenant + DUREE_RESERVATION;
    db.prepare("INSERT INTO commandes_editions VALUES (?, ?, 'reservee', ?)").run(cle, clientId, expiration);
    for (const l of lignes) {
      const utilises = new Set(db.prepare('SELECT numero FROM tirages_editions WHERE oeuvre_id=?').all(l.oeuvre_id).map(t => t.numero));
      let numero = 1;
      for (let i = 0; i < l.quantite; i++) {
        while (utilises.has(numero)) numero++;
        db.prepare('INSERT INTO tirages_editions VALUES (?, ?, ?, ?, ?)').run(l.oeuvre_id, numero, l.id, cle, l.prix_centimes);
        utilises.add(numero);
      }
    }
    return { cle, expiration, etat: 'reservee', tirages: numerosCommande(db, cle) };
  });
}
// À appeler uniquement après vérification côté serveur du paiement et de son montant.
function confirmerTirages(db, cle, maintenant = Date.now()) {
  return transaction(db, () => {
    const c = db.prepare('SELECT * FROM commandes_editions WHERE cle=?').get(cle);
    if (!c) refuser('COMMANDE_INVALIDE', 'Commande introuvable.');
    if (c.etat === 'vendue') return numerosCommande(db, cle);
    if (c.etat !== 'reservee' || c.expiration <= maintenant) refuser('RESERVATION_TERMINEE', 'Réservation expirée : ne pas lancer la fabrication. Traiter le paiement tardif séparément.');
    db.prepare("UPDATE commandes_editions SET etat='vendue' WHERE cle=?").run(cle);
    return numerosCommande(db, cle);
  });
}
function annulerReservation(db, cle) {
  return transaction(db, () => {
    const c = db.prepare('SELECT etat FROM commandes_editions WHERE cle=?').get(cle);
    if (!c) refuser('COMMANDE_INVALIDE', 'Commande introuvable.');
    if (c.etat === 'vendue') refuser('TIRAGES_VENDUS', 'Les numéros vendus ne sont pas remis en vente automatiquement.');
    db.prepare("UPDATE commandes_editions SET etat='annulee' WHERE cle=? AND etat='reservee'").run(cle);
    db.prepare('DELETE FROM tirages_editions WHERE commande_cle=?').run(cle);
  });
}
function disponibiliteEdition(db, oeuvreId, maintenant = Date.now()) {
  const utilises = db.prepare(`SELECT count(*) AS n FROM tirages_editions t JOIN commandes_editions c ON c.cle=t.commande_cle
    WHERE t.oeuvre_id=? AND (c.etat='vendue' OR (c.etat='reservee' AND c.expiration>?))`).get(oeuvreId, maintenant).n;
  return Math.max(0, TIRAGE - utilises);
}
module.exports = { TIRAGE, LIMITE_CLIENT, DUREE_RESERVATION, ErreurEdition, reserverTirages, confirmerTirages, annulerReservation, disponibiliteEdition };
