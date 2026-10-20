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
