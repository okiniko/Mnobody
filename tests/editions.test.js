const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { Worker } = require('node:worker_threads');
const { ouvrirBase } = require('../database');
const { reserverTirages, confirmerTirages, annulerReservation, disponibiliteEdition, DUREE_RESERVATION } = require('../editions');
function preparer(fichier = ':memory:') {
  const db = ouvrirBase(fichier);
  db.exec(`INSERT INTO categories VALUES(1,'Art');
    INSERT INTO oeuvres (titre,description,image,edition,tirage,statut) VALUES('Art','Texte','images/print-abyss.png','limitee',49,'publiee');
    INSERT INTO produits VALUES(1,'Petit','Texte','images/print-abyss.png',10000,1),(2,'Grand','Texte','images/print-abyss.png',20000,1);
    INSERT INTO variantes (produit_id,oeuvre_id,support,largeur_mm,hauteur_mm,fournisseur) VALUES(1,1,'dibond',300,400,'merchone'),(2,1,'dibond',600,800,'merchone');`);
  for (let id=1;id<=20;id++) db.prepare('INSERT INTO clients VALUES(?,?,1)').run(id,`client${id}@example.test`);
  return db;
}
const cle = n => `commande_test_${String(n).padStart(5,'0')}`;
const reserver = (db, clientId, n, articles, temps=1000) => reserverTirages(db,{clientId,cle:cle(n),articles},temps);
function codeErreur(action, code) { assert.throws(action, e => e.code === code); }

test('la limite client additionne formats et commandes, y compris les réservations actives', () => {
  const db=preparer();
  try {
    codeErreur(()=>reserver(db,1,1,[{id:1,quantite:2},{id:2,quantite:2}]),'LIMITE_CLIENT');
    assert.equal(db.prepare('SELECT count(*) AS n FROM commandes_editions').get().n,0);
    const premiere=reserver(db,1,2,[{id:1,quantite:2}]);
    assert.equal(premiere.tirages.length,2);
    confirmerTirages(db,cle(2),1001);
    reserver(db,1,3,[{id:2,quantite:1}],1002);
    codeErreur(()=>reserver(db,1,4,[{id:1,quantite:1}],1003),'LIMITE_CLIENT');
    assert.equal(disponibiliteEdition(db,1,1003),46);
    // Un autre client conserve son propre quota.
    reserver(db,2,5,[{id:1,quantite:3}],1004);
    assert.equal(disponibiliteEdition(db,1,1004),43);
  } finally {db.close();}
});

test('aucun tirage au-delà de 49 et numéros uniques partagés entre formats', () => {
  const db=preparer();
  try {
    for(let id=1;id<=16;id++) {reserver(db,id,id,[{id:id%2+1,quantite:3}]);confirmerTirages(db,cle(id),1001);}
    const derniere=reserver(db,17,17,[{id:2,quantite:1}]);
    assert.equal(derniere.tirages[0].numero,49);
    codeErreur(()=>reserver(db,18,18,[{id:1,quantite:1}]),'EDITION_EPUISEE');
    assert.equal(disponibiliteEdition(db,1,1000),0);
    assert.deepEqual(db.prepare('SELECT numero FROM tirages_editions ORDER BY numero').all().map(l=>l.numero),Array.from({length:49},(_,i)=>i+1));
  } finally {db.close();}
});

test('expiration, annulation et paiement tardif ne permettent pas de revendre un numéro vendu', () => {
  const db=preparer();
  try {
    reserver(db,1,1,[{id:1,quantite:3}]);
    const apres=1000+DUREE_RESERVATION+1;
    assert.equal(disponibiliteEdition(db,1,apres),49);
    codeErreur(()=>confirmerTirages(db,cle(1),apres),'RESERVATION_TERMINEE');
    const seconde=reserver(db,2,2,[{id:2,quantite:1}],apres);
    assert.equal(seconde.tirages[0].numero,1);
    confirmerTirages(db,cle(2),apres+1);
    assert.deepEqual(confirmerTirages(db,cle(2),apres+2),confirmerTirages(db,cle(2),apres+3));
    codeErreur(()=>annulerReservation(db,cle(2)),'TIRAGES_VENDUS');
    reserver(db,1,3,[{id:1,quantite:3}],apres+4);
    annulerReservation(db,cle(3));
    assert.equal(disponibiliteEdition(db,1,apres+5),48);
    codeErreur(()=>reserver(db,1,3,[{id:1,quantite:3}],apres+6),'RESERVATION_TERMINEE');
    codeErreur(()=>confirmerTirages(db,cle(1),apres+6),'RESERVATION_TERMINEE');
  } finally {db.close();}
});

test('réservation idempotente, prix côté serveur et compte vérifié obligatoire', () => {
  const db=preparer();
  try {
    db.exec('UPDATE clients SET email_verifie=0 WHERE id=1');
    codeErreur(()=>reserver(db,1,1,[{id:1,quantite:1}]),'CONNEXION_REQUISE');
    codeErreur(()=>reserver(db,999,1,[{id:1,quantite:1}]),'CONNEXION_REQUISE');
    const a=reserver(db,2,2,[{id:1,quantite:1,prix:0}]);
    assert.equal(a.tirages[0].prix_centimes,10000);
    db.exec('UPDATE produits SET prix_centimes=12000 WHERE id=1');
    const b=reserver(db,2,2,[{id:1,quantite:1}],1001);
    assert.deepEqual(a,b);
    codeErreur(()=>reserver(db,3,2,[{id:1,quantite:1}]),'COMMANDE_INVALIDE');
    codeErreur(()=>reserver(db,2,2,[{id:1,quantite:2}]),'COMMANDE_INVALIDE');
    codeErreur(()=>reserver(db,2,3,[{id:1,quantite:1},{id:1,quantite:1}]),'PANIER_INVALIDE');
    assert.throws(()=>db.exec('DELETE FROM produits WHERE id=1'),/FOREIGN KEY/);
    assert.throws(()=>db.exec('UPDATE variantes SET largeur_mm=100 WHERE produit_id=1'),/tirages/);
    assert.throws(()=>db.exec("UPDATE oeuvres SET edition='ouverte',tirage=NULL WHERE id=1"),/49 exemplaires/);
  } finally {db.close();}
});

test('deux connexions simultanées ne peuvent pas réserver le dernier exemplaire', {timeout:15000}, async () => {
  const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'mnobody-edition-'));
  const fichier=path.join(dossier,'base.sqlite');
  const db=preparer(fichier);
  for(let id=1;id<=16;id++) {reserver(db,id,id,[{id:1,quantite:3}]);confirmerTirages(db,cle(id),1001);}
  const workers=[];
  try {
    const source=`const {parentPort,workerData}=require('node:worker_threads');
      const {ouvrirBase}=require(workerData.racine+'/database');
      const {reserverTirages}=require(workerData.racine+'/editions');
      const db=ouvrirBase(workerData.fichier);
      parentPort.once('message',()=>{try {reserverTirages(db,{clientId:workerData.client,cle:'commande_course_'+workerData.client,articles:[{id:2,quantite:1}]},1002);parentPort.postMessage('ok');}
        catch(e){parentPort.postMessage(e.code||e.message);}finally{db.close();}});
      parentPort.postMessage('pret');`;
    const prets=[],resultats=[];
    for(const client of [17,18]) {
      const w=new Worker(source,{eval:true,workerData:{racine:path.join(__dirname,'..'),fichier,client}});workers.push(w);
      prets.push(new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));
    }
    await Promise.all(prets);
    for(const w of workers) resultats.push(new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));
    workers.forEach(w=>w.postMessage('depart'));
    assert.deepEqual((await Promise.all(resultats)).sort(),['EDITION_EPUISEE','ok']);
    assert.equal(db.prepare('SELECT count(*) AS n FROM tirages_editions').get().n,49);
  } finally {await Promise.all(workers.map(w=>w.terminate()));db.close();fs.rmSync(dossier,{recursive:true,force:true});}
});
