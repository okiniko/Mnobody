# Musée virtuel — trois salles

`/musee` propose une visite immersive de trois salles de cinq œuvres, dans l’ordre de publication des identifiants. `/api/musee` lit les 15 premières œuvres publiées : id, titre, description, aperçu et finition Dibond. Les données fournisseur et fichiers HD restent privés. L’ajout d’œuvres au-delà des 15 nécessite une nouvelle organisation des salles.

## Visite

Salle 1 : La salle des regards ; salle 2 : Échos intérieurs ; salle 3 : Présences nocturnes. Le sélecteur change de salle, les miniatures donnent accès directement à chaque œuvre et Précédent / Suivant traversent les 15 œuvres en changeant de salle. Les flèches clavier offrent le même parcours. Vue de la salle rétablit la vue d’ensemble de la salle actuelle.

La caméra se place face à l’œuvre, avec une transition douce ou instantanée si l’utilisateur préfère réduire les animations. Un glissement permet de regarder autour de soi ; un clic sur un tableau le sélectionne. La fiche se déploie dans la visite avec sa description, sa finition et un lien vers les formats dans un autre onglet. Échap et Fermer referment la fiche. Plein écran est disponible selon le navigateur.

Murs sombres chauds, éclairage dirigé, banc central et lumière indépendante des images. Les tableaux conservent leurs couleurs et leur cadrage. Les aperçus servent de textures sRGB ; les originaux HD ne sont pas exposés.

## Technique

La page immersive possède sa propre feuille `/musee.css`. Three.js 0.186.1 et sa licence MIT sont servis localement dans `public/vendor/three/`, sans CDN. `npm run musee:build` copie les modules depuis la dépendance de développement. Aucun paquet Three.js n’est requis à l’exécution côté serveur.

La bibliothèque exige WebGL2 pour la visite. En cas d’indisponibilité, une liste HTML donne accès aux œuvres ; un bloc noscript assure également ce parcours sans JavaScript. Les images sont chargées sur le domaine du site. L’animation est suspendue quand l’onglet est masqué et le rendu n’est recalculé qu’en cas de changement. La définition est plafonnée à 1,5 fois le pixel CSS.

## Vérification

26 tests, incluant visibilité des œuvres publiées et confidentialité des données. Contrôle navigateur de l’aperçu : changement de salle, passage de 10 à 11, retour de 15 à 1, sélection, fiche de l’œuvre 15 et son lien. Contrôle à largeur 390 px. Les essais sur téléphones physiques restent à effectuer. Aucun paiement ni commande fournisseur n’est raccordé à cette visite.
