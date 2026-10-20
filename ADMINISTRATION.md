# Administration

L’espace administrateur est accessible à `/admin` sur le site en HTTPS.
Les cookies de session utilisent `Secure`, `HttpOnly` et `SameSite=Strict`.
Aucun compte ni mot de passe par défaut n’est fourni.

## Créer ou remplacer le compte

Depuis un terminal interactif, dans le dossier du projet :

```sh
node scripts/creer-admin.js
```

Saisir l’identifiant, puis deux fois un mot de passe d’au moins 14 caractères.
Le mot de passe est masqué pendant la saisie et seul son dérivé scrypt avec sel
aléatoire est stocké dans SQLite. Cette commande remplace l’unique compte
administrateur et révoque toutes les sessions précédentes.

Redémarrer l’application avec le mécanisme habituel de l’hébergement après
l’installation des fichiers, puis ouvrir `/admin` en HTTPS.

## Sessions et données

Les sessions sont stockées dans `data/boutique.sqlite`, avec une durée absolue
de 8 heures après connexion. Les formulaires de connexion expirent après
20 minutes. La déconnexion révoque la session côté serveur.

Les formulaires POST sont protégés par un jeton CSRF. Les tentatives de
connexion sont limitées à 5 par adresse IP et 50 au total sur une fenêtre
de 15 minutes. L’adresse IP est celle observée par Express ; derrière un proxy
non configuré, plusieurs utilisateurs peuvent partager la même limite.

La base contient désormais des informations d’authentification : conserver
ses sauvegardes hors des ressources publiques. Le dossier `data/` n’est pas
servi par Express. Les fichiers SQLite sont exclus de Git.

## Catégories

Depuis `/admin`, ouvrir « Gérer les catégories ». Il est possible de créer une
catégorie, renommer une catégorie existante et supprimer une catégorie vide
après confirmation. Les noms sont limités à 100 caractères ; les doublons,
y compris les différences de casse, sont refusés.

Les produits conservent leur catégorie lors d’un renommage. Le filtre de la
boutique utilise les catégories de la base et n’affiche que celles contenant
des produits. Une catégorie contenant des produits ne peut pas être supprimée.

## Produits

Depuis `/admin`, ouvrir « Gérer les produits ». La liste donne accès à la fiche
publique, à la modification et à la suppression avec confirmation. Le formulaire
de création et de modification comporte le nom, la description, le prix en euros,
la catégorie et une image de la bibliothèque `public/images`.

Le prix accepte un point ou une virgule, avec deux décimales au maximum. Il est
stocké en centimes. Les champs sont validés côté serveur ; les catégories et les
images doivent exister. L’envoi de nouveaux fichiers image n’est pas inclus.

Les modifications sont visibles dans le catalogue et les fiches publiques au
prochain chargement. La suppression retire le produit du catalogue sans supprimer
son image, qui peut être partagée avec d’autres produits. Les identifiants des
produits supprimés ne sont pas réutilisés par la création administrateur.

À chaque chargement d’une page, un panier non vide est synchronisé avec le
catalogue : les informations et prix sont actualisés, les quantités conservées et
les produits supprimés retirés. Un message explique les changements sur les pages
présentant le panier. En cas d’erreur réseau ou de catalogue invalide, le panier
sauvegardé est conservé. Une page laissée ouverte ne reçoit pas automatiquement les
modifications ultérieures : il faut la recharger. Les prix et disponibilités devront
également être revérifiés côté serveur lors de l’implémentation des commandes. Le script d’import du JSON est un outil de
migration initiale ; le relancer peut recréer des produits supprimés depuis
l’administration.

## Exploitation et protection de la connexion

Voir `DEPLOIEMENT.md` pour les versions Node compatibles, les variables, les migrations et les sauvegardes.
La création de sessions anonymes est limitée à 20 par IP sur 20 minutes et à 1 000
sessions anonymes actives au total. Une session existante peut recharger son formulaire.
La limite de tentatives de connexion reste de 5 par IP et 50 au total sur 15 minutes.
Les limites globales protègent les ressources mais peuvent temporairement empêcher
une nouvelle connexion sous attaque. Vérifier TRUST_PROXY avant la mise en production.

## Œuvres et déclinaisons

`/admin/oeuvres` permet de créer et modifier une œuvre : titre, histoire, série,
année facultative, image principale, jusqu'à huit images complémentaires, édition
limitée à 49 tirages Dibond et statut de publication. Les images sont choisies dans la
bibliothèque existante ; les fichiers de fabrication ne sont pas gérés ici.
Une œuvre commence en brouillon. L'archivage masque sa fiche et ses déclinaisons
sans effacer les données. Il n'y a pas de suppression définitive d'œuvre dans l'interface.

Dans un formulaire produit, la section « Déclinaison d'une œuvre » permet de relier
un produit à une œuvre. Un produit Dibond a une largeur et une hauteur en millimètres ;
un textile a une taille et éventuellement une couleur. Chaque produit reste un article
vendable distinct, avec son identifiant et son prix en centimes. La finition est libre :
y préciser matériau, épaisseur, protection ou accrochage après validation du devis.

La migration ne crée aucune œuvre et n'affecte aucun produit existant. Les produits
non rattachés restent visibles dans la boutique. Une déclinaison rattachée n'est visible
que si son œuvre est publiée et si elle est disponible. Les paniers se synchronisent
avec ces conditions au rechargement, comme pour un produit supprimé.

La galerie `/galerie` présente les œuvres publiées. La fiche `/oeuvre/:id` rassemble
les formats Dibond en premier et les textiles seulement s'ils existent ; les liens
mènent aux fiches produit et au panier existants. Les images d'œuvres sont affichées
sans recadrage ni filtre de couleur.

Les champs fournisseur et référence sont facultatifs, privés et non exposés par l'API
publique. MerchOne est proposé par défaut pour les nouvelles déclinaisons. Pixartprinting et Spreadconnect restent disponibles pour les anciens rattachements. Leur
renseignement ne transmet aucune commande et ne garantit pas la validité d'une référence.
Le module interne `editions.js` réserve et décompte les tirages, mais son raccordement au compte client et au paiement reste à réaliser. Le bouton de
commande du panier reste à implémenter.


## Édition de 49 et limite de 3 par client

Les nouvelles œuvres enregistrées dans l'administration sont limitées à 49 tirages
Dibond au total, tous formats confondus. Les textiles sont exclus de cette édition.
MerchOne est proposé par défaut, sans création de stock physique ni envoi automatique.
Le catalogue et les prix de vente restent à renseigner manuellement.

Le panier additionne les formats d'une même œuvre et bloque l'ajout au-delà de 3.
Il ajuste un ancien panier à ce plafond et aux exemplaires disponibles au rechargement.
Ce contrôle de confort ne constitue pas une autorisation de vente.

Le module `editions.js`, non exposé comme route HTTP, fournit :
- `reserverTirages` : vérifie le compte client et son e-mail vérifié, cumule les achats
  et réservations actives par œuvre, réserve les numéros disponibles sous transaction.
- `confirmerTirages` : transforme une réservation en vente. Son appel doit suivre la
  vérification serveur du paiement (référence, montant, devise et statut).
- `annulerReservation` : libère uniquement une réservation non vendue.

Chaque tirage reçoit un numéro unique de 1 à 49 pour son œuvre. Une réservation
expire après 15 minutes. Les numéros non vendus peuvent être réutilisés après
annulation ou expiration ; un numéro vendu n'est jamais remis en vente automatiquement,
même après remboursement. La numérotation est interne : elle ne produit pas encore
un certificat ni un fichier d'impression numéroté.

La clé de commande doit être stable et générée par le serveur. Répéter la même
requête ne réserve pas une seconde fois et ne prolonge pas son échéance. Une même
clé ne peut pas changer de client ou de contenu. Les prix sont figés côté serveur.
Les numéros sont réservés de façon atomique, même entre deux connexions SQLite.
Un paiement reçu après expiration exige une procédure de traitement/remboursement
avant toute fabrication ; il ne doit pas déclencher automatiquement MerchOne.

## Raccordement nécessaire avant l'ouverture des ventes

Le site ne dispose pas encore d'authentification client ni de paiement. La table
`clients` est une préparation ; aucun compte client public n'est créé par ce lot.
La limite cumulée est donc testée dans le module serveur mais ne peut pas encore
être appliquée à un parcours d'achat réel. L'ouverture des ventes doit être bloquée
jusqu'à la mise en place des éléments suivants :

1. Compte client avec e-mail vérifié et identité issue de la session serveur.
   Ne jamais accepter un client_id fourni librement par le navigateur.
2. Réservation des éditions avant le paiement, puis montant et devise contrôlés
   à partir des lignes de réservation, hors confiance dans les prix du navigateur.
3. Confirmation à partir d'un webhook de paiement authentifié, avec traitement
   des doubles événements et paiements tardifs.
4. Envoi MerchOne après paiement confirmé, avec une clé évitant les doublons,
   références produit et fichiers de fabrication figés dans la commande.

La limite est liée au compte client vérifié. Une même personne utilisant plusieurs
comptes distincts ne peut pas être identifiée de façon certaine par ce seul mécanisme.
Aucun paiement, appel API MerchOne, envoi de fichier ou commande fournisseur n'est
réalisé par le présent lot.
