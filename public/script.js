let chargementProduits;

function chargerProduits() {
  // Une seule requête pour le catalogue et le panier pendant ce chargement de page.
  if (!chargementProduits) {
    chargementProduits = fetch("/api/produits", { cache: "no-store" })
      .then(reponse => {
        if (!reponse.ok) throw new Error("Impossible de charger les produits");
        return reponse.json();
      })
      .then(produits => {
        const ids = new Set();
        if (!Array.isArray(produits) || !produits.every(produit => {
          if (!produit || !Number.isSafeInteger(produit.id) || produit.id <= 0 ||
              ids.has(produit.id) || typeof produit.nom !== "string" ||
              typeof produit.description !== "string" || typeof produit.image !== "string" ||
              !Number.isFinite(produit.prix) || produit.prix < 0) return false;
          ids.add(produit.id);
          return true;
        })) {
          throw new Error("Le catalogue reçu est invalide");
        }
        return produits;
      });
  }
  return chargementProduits;
}

const productList = document.querySelector(".product-list");

if (productList) {
  chargerProduits()
    .then(produits => {
      const catalogue = new Catalogue(produits);
      catalogue.afficherProduits();
    })
    .catch(erreur => {
      console.error(erreur);
      productList.textContent =
        "Impossible de charger le catalogue. Veuillez réessayer.";
    });
}
class Catalogue {
  constructor(produits, nombreParPage = 12) {
    this.produits = produits;
    this.produitsFiltres = produits;

    this.productList = document.querySelector(".product-list");
  	if (!this.productList) return;

    this.nombreParPage = nombreParPage;
    this.indexActuel = 0;

    this.creerControles();
    this.creerBoutonVoirPlus();
  }
	creerControles() {
  this.controles = document.createElement("div");
  this.controles.classList.add("catalogue-controles");

  this.recherche = document.createElement("input");
  this.recherche.setAttribute("aria-label", "Rechercher un produit");
  this.recherche.type = "search";
  this.recherche.placeholder = "Rechercher un produit...";

  this.filtre = document.createElement("select");
this.filtre.setAttribute("aria-label", "Filtrer par catégorie");
  const tous = document.createElement("option");
  tous.value = "tous";
  tous.textContent = "Tous les produits";
  this.filtre.append(tous);

  const categories = new Map(this.produits.map(produit => [
    produit.categorie_id, produit.categorie
  ]));
  [...categories.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
    .forEach(([id, nom]) => {
      const option = document.createElement("option");
      option.value = String(id);
      option.textContent = nom;
      this.filtre.append(option);
    });

  this.tri = document.createElement("select");
this.tri.setAttribute("aria-label", "Trier les produits");
  this.tri.innerHTML = `
    <option value="defaut">Trier</option>
    <option value="prix-asc">Prix croissant</option>
    <option value="prix-desc">Prix décroissant</option>
    <option value="nom-asc">Nom A-Z</option>
    <option value="nom-desc">Nom Z-A</option>
  `;

  this.controles.append(
    this.recherche,
    this.filtre,
    this.tri
  );

  this.productList.before(this.controles);

  this.recherche.addEventListener("input", () => {
    this.appliquerFiltres();
  });

  this.filtre.addEventListener("change", () => {
    this.appliquerFiltres();
  });

  this.tri.addEventListener("change", () => {
    this.appliquerFiltres();
  });
}
	appliquerFiltres() {
  const texte = this.recherche.value.toLowerCase();
  const categorie = this.filtre.value;
  const tri = this.tri.value;

  this.produitsFiltres = this.produits.filter(produit => {
    const correspondRecherche =
      produit.nom.toLowerCase().includes(texte) ||
      produit.description.toLowerCase().includes(texte);

    const correspondCategorie =
      categorie === "tous" ||
      String(produit.categorie_id) === categorie;

    return correspondRecherche && correspondCategorie;
  });

  if (tri === "prix-asc") {
    this.produitsFiltres.sort((a, b) => a.prix - b.prix);
  }

  if (tri === "prix-desc") {
    this.produitsFiltres.sort((a, b) => b.prix - a.prix);
  }

  if (tri === "nom-asc") {
    this.produitsFiltres.sort((a, b) =>
      a.nom.localeCompare(b.nom)
    );
  }

  if (tri === "nom-desc") {
    this.produitsFiltres.sort((a, b) =>
      b.nom.localeCompare(a.nom)
    );
  }

  this.productList.innerHTML = "";
  this.indexActuel = 0;

  this.afficherProduits();
}
  creerProduit(produit) {
    const produitCard = document.createElement("div");
    produitCard.classList.add("carte");
    if (produit.oeuvre_id) produitCard.classList.add("carte-oeuvre-produit");

    const cardNom = document.createElement("h2");
    const cardDesc = document.createElement("p");
    const cardPrice = document.createElement("p");
    const cardImage = document.createElement("img");
    const cardADD = document.createElement("button");

    cardADD.classList.add("ajout");

const lienProduit = document.createElement("a");
lienProduit.href = `/produit/${produit.id}`;
lienProduit.textContent = produit.nom;
cardNom.append(lienProduit);
cardDesc.textContent = produit.description;
cardPrice.textContent = produit.prix.toFixed(2) + " €";
    cardImage.src = produit.image;
    cardImage.alt = produit.nom;
    cardImage.loading = "lazy";
    cardADD.textContent = produit.exemplaires_restants === 0 ? "ÉDITION ÉPUISÉE" : "AJOUTER";
    cardADD.disabled = produit.exemplaires_restants === 0;

    cardADD.addEventListener("click", (event) => {
       event.stopPropagation();
		panier.addToCart(produit);
    });

    produitCard.append(
      cardNom,
      cardDesc,
      cardPrice,
      cardImage,
      cardADD
    );

    this.productList.append(produitCard);
	
	produitCard.addEventListener("click", () => {
  window.location.href = `/produit/${produit.id}`;
});
  }

  afficherProduits() {

  if (this.produitsFiltres.length === 0) {
    this.productList.innerHTML = `
      <p class="aucun-produit">
        Aucun produit trouvé.
      </p>
    `;

    this.mettreAJourBouton();
    return;
  }

  const fin = this.indexActuel + this.nombreParPage;

  const produitsAAfficher = this.produitsFiltres.slice(
    this.indexActuel,
    fin
  );

  produitsAAfficher.forEach(produit => {
    this.creerProduit(produit);
  });

  this.indexActuel = fin;

  this.mettreAJourBouton();
}
  creerBoutonVoirPlus() {
    this.boutonVoirPlus = document.createElement("button");

    this.boutonVoirPlus.textContent = "AFFICHER PLUS";
    this.boutonVoirPlus.classList.add("voir-plus");

    this.productList.after(this.boutonVoirPlus);

    this.boutonVoirPlus.addEventListener("click", () => {
      this.afficherProduits();
    });
  }

  mettreAJourBouton() {
	    if (!this.boutonVoirPlus) return;

  this.boutonVoirPlus.style.display =
    this.indexActuel >= this.produitsFiltres.length
      ? "none"
      : "block";
}
}
class Panier {
  constructor() {
  this.items = [];

  try {
    const sauvegarde = JSON.parse(localStorage.getItem("panier"));

    if (Array.isArray(sauvegarde)) {
      this.items = sauvegarde.filter(item =>
  item !== null &&
  typeof item === "object" &&
  Number.isSafeInteger(item.id) &&
  item.id > 0 &&
  typeof item.nom === "string" &&
  Number.isFinite(item.prix) &&
  item.prix >= 0 &&
  Number.isSafeInteger(item.quantite) &&
  item.quantite > 0
);
    }
  } catch (erreur) {
    console.error("Impossible de lire le panier sauvegardé :", erreur);
  }
	  this.list = document.querySelector(".cart-list");
    this.total = document.querySelector(".total");
    this.boutonVider = document.querySelector(".vider");

    this.messageSynchronisation = null;
    if (this.list) {
      this.messageSynchronisation = document.createElement("p");
      this.messageSynchronisation.classList.add("panier-synchronisation");
      this.messageSynchronisation.setAttribute("role", "status");
      this.messageSynchronisation.setAttribute("aria-live", "polite");
      this.list.before(this.messageSynchronisation);
      try {
        this.messageSynchronisation.textContent = sessionStorage.getItem("panier-avis") || "";
        sessionStorage.removeItem("panier-avis");
      } catch (erreur) {
        console.error("Impossible de lire l’avis du panier :", erreur);
      }
    }

    this.boutonVider?.addEventListener("click", () => {
      this.viderPanier();
    });
  }
  afficherAvis(message) {
    if (this.messageSynchronisation) {
      this.messageSynchronisation.textContent = message;
    } else {
      try {
        const precedent = sessionStorage.getItem("panier-avis") || "";
        sessionStorage.setItem("panier-avis", [precedent, message].filter(Boolean).join(" "));
      } catch (erreur) {
        console.error("Impossible de conserver l’avis du panier :", erreur);
      }
    }
  }
  async synchroniser() {
    if (this.items.length === 0) return;
    const avisPrecedent = this.messageSynchronisation?.textContent || "";
    try {
      const produits = await chargerProduits();
      const catalogue = new Map(produits.map(produit => [produit.id, produit]));
      let retires = 0;
      let actualises = 0;
      // Lire les articles après la réponse : conserver les changements effectués entre-temps.
      this.items = this.items.flatMap(item => {
        const produit = catalogue.get(item.id);
        if (!produit) {
          retires++;
          return [];
        }
        if (["nom", "description", "image", "prix", "categorie_id", "categorie", "oeuvre_id", "support", "largeur_mm", "hauteur_mm", "taille", "couleur", "finition"]
          .some(champ => item[champ] !== produit[champ])) {
          actualises++;
        }
        return [{ ...produit, quantite: item.quantite }];
      });
      const limites = new Map();
      let quantitesReduites = false;
      this.items = this.items.flatMap(item => {
        if (item.support !== 'dibond' || !item.oeuvre_id) return [item];
        const plafond = Math.min(3, item.exemplaires_restants ?? 49);
        const deja = limites.get(item.oeuvre_id) || 0;
        const quantite = Math.min(item.quantite, Math.max(0, plafond - deja));
        if (quantite !== item.quantite) quantitesReduites = true;
        limites.set(item.oeuvre_id, deja + quantite);
        return quantite ? [{ ...item, quantite }] : [];
      });
      this.majPanier();
      {
        const messages = [];
        if (quantitesReduites) messages.push("Les quantités ont été ajustées à la limite de 3 tirages par œuvre et aux exemplaires disponibles.");
        if (actualises) messages.push("Les informations et les prix de votre panier ont été actualisés.");
        if (retires) messages.push("Les produits qui ne sont plus disponibles ont été retirés du panier.");
        if (messages.length) this.afficherAvis([avisPrecedent, ...messages].filter(Boolean).join(" "));
      }
    } catch (erreur) {
      console.error("Impossible de synchroniser le panier :", erreur);
      if (this.messageSynchronisation) {
        this.messageSynchronisation.textContent =
          "Impossible de vérifier le panier. Les informations sauvegardées sont conservées. Réessayez en rechargeant la page.";
      }
    }
  }

  peutAjouter(produit) {
    if (produit.support !== 'dibond' || !produit.oeuvre_id) return true;
    const quantite = this.items.filter(item => item.support === 'dibond' && item.oeuvre_id === produit.oeuvre_id)
      .reduce((somme, item) => somme + item.quantite, 0);
    const plafond = Math.min(3, produit.exemplaires_restants ?? 49);
    if (quantite >= plafond) {
      this.afficherAvis(plafond === 0 ? "Cette édition est épuisée ou entièrement réservée." : "Maximum 3 tirages par œuvre et par client, tous formats et commandes confondus. La disponibilité sera revérifiée lors de la commande.");
      return false;
    }
    return true;
  }
  addToCart(produit) {
  if (!this.peutAjouter(produit)) return;
  const produitExistant = this.items.find(item => item.id === produit.id);

  if (produitExistant) {
    produitExistant.quantite++;
  } else {
    this.items.push({
      ...produit,
      quantite: 1
    });
  }
  this.majPanier()
}
  afficherPanier() {
  if (!this.list) return;

  this.list.innerHTML = "";

  const boutonAcheter = document.querySelector(".buycart");
  const boutonVider = document.querySelector(".vider");

  // PANIER VIDE
  if (this.items.length === 0) {

    const message = document.createElement("li");

    message.classList.add("panier-vide");
    message.textContent = "Votre panier est vide.";

    this.list.append(message);

    if (boutonAcheter) {
      boutonAcheter.style.display = "none";
    }

    if (boutonVider) {
      boutonVider.style.display = "none";
    }

    return;
  }

  // PANIER NON VIDE
  if (boutonAcheter) {
    boutonAcheter.style.display = "";
  }

  if (boutonVider) {
    boutonVider.style.display = "";
  }

  this.items.forEach(item => {

    const ligne = document.createElement("li");

    const nom = document.createElement("span");
    nom.textContent =
`${item.nom}${item.support === 'dibond' ? ` · Dibond ${item.largeur_mm / 10} × ${item.hauteur_mm / 10} cm` : item.support === 'textile' ? ` · ${item.taille}${item.couleur ? ' · ' + item.couleur : ''}` : ''} - ${item.prix.toFixed(2)} €`;
    const moins = document.createElement("button");
    moins.textContent = "-";
    moins.setAttribute(
  "aria-label",
  `Diminuer la quantité de ${item.nom}`
);

    const quantite = document.createElement("span");
    quantite.textContent = item.quantite;

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.setAttribute(
  "aria-label",
  `Augmenter la quantité de ${item.nom}`
);

    const suppr = document.createElement("button");
    suppr.textContent = "X";
    suppr.setAttribute(
  "aria-label",
  `Supprimer ${item.nom} du panier`
);

    plus.disabled = item.support === "dibond" && item.oeuvre_id &&
      this.items.filter(p => p.support === "dibond" && p.oeuvre_id === item.oeuvre_id).reduce((n,p) => n+p.quantite, 0) >= Math.min(3, item.exemplaires_restants ?? 49);
    plus.addEventListener("click", () => {
      if (!this.peutAjouter(item)) return;
      item.quantite++;
      this.majPanier();
    });

    moins.addEventListener("click", () => {

      if (item.quantite === 1) {
        this.supprimerProduit(item.id);
        return;
      }

      item.quantite--;

      this.majPanier();
    });

    suppr.addEventListener("click", () => {
      this.supprimerProduit(item.id);
    });

    ligne.append(
      nom,
      moins,
      quantite,
      plus,
      suppr
    );

    this.list.append(ligne);
  });
}
  calculTotal(){
  const total = document.querySelector(".total");
	    if (!this.total) return;

  let somme = 0;
  this.items.forEach(item =>{
    somme += item.prix * item.quantite;
  });
  this.total.textContent =
    "TOTAL " + somme.toFixed(2) + " €";
}
  supprimerProduit(id) {
  const index = this.items.findIndex(item => item.id === id);

  if (index === -1) return;

  const produit = this.items[index];

  modal.confirmation(
    `Supprimer "${produit.nom}" du panier ?`,
    () => {
      const indexActuel = this.items.findIndex(item => item.id === id);
      if (indexActuel !== -1) {
        this.items.splice(indexActuel, 1);
        this.majPanier();
        this.afficherAvis(`« ${produit.nom} » a été retiré du panier.`);
      }
    }
  );
}
  viderPanier() {
  modal.confirmation(
    "Voulez-vous vraiment vider tout le panier ?",
    () => {
      this.items = [];
      this.majPanier();
      this.afficherAvis("Votre panier a été vidé.");
    }
  );
}
  sauvegarderPanier() {
  try {
    localStorage.setItem("panier", JSON.stringify(this.items));
  } catch (erreur) {
    console.error("Impossible de sauvegarder le panier :", erreur);
  }
}
  majPanier() {
  this.sauvegarderPanier();
  this.afficherPanier();
  this.calculTotal();
}

}
class Modal {
  constructor() {
    this.overlay = null;
    this.fermetureEnCours = false;
    this.elementPrecedent = null;
    this.elementsArrierePlan = [];
  }

  confirmation(message, action) {
    if (this.overlay) return;

    this.elementPrecedent = document.activeElement;
    this.overlay = document.createElement("div");
    this.overlay.classList.add("modal-confirmation");
    const overlay = this.overlay;

    const modal = document.createElement("div");
    modal.classList.add("modal-content");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "confirmation-titre");
    modal.setAttribute("aria-describedby", "confirmation-message");

    const titre = document.createElement("h2");
    titre.id = "confirmation-titre";
    titre.textContent = "Confirmation";

    const texte = document.createElement("p");
    texte.id = "confirmation-message";
    texte.textContent = message;

    const actions = document.createElement("div");
    actions.classList.add("modal-actions");

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.textContent = "ANNULER";
    annuler.classList.add("modal-annuler");

    const confirmer = document.createElement("button");
    confirmer.type = "button";
    confirmer.textContent = "CONFIRMER";
    confirmer.classList.add("modal-confirmer");

    actions.append(annuler, confirmer);
    modal.append(titre, texte, actions);
    overlay.append(modal);
    document.body.append(overlay);

    this.elementsArrierePlan = [...document.body.children]
      .filter(element => element !== overlay && !element.inert);
    this.elementsArrierePlan.forEach(element => {
      element.inert = true;
    });

    annuler.focus();
    requestAnimationFrame(() => {
      if (!this.fermetureEnCours && this.overlay === overlay) {
        overlay.classList.add("visible");
      }
    });

    modal.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.fermer();
      } else if (event.key === "Tab") {
        event.preventDefault();
        const cible = document.activeElement === annuler
          ? confirmer
          : annuler;
        cible.focus();
      }
    });

    annuler.addEventListener("click", () => {
      this.fermer();
    });

    confirmer.addEventListener("click", () => {
      if (this.fermetureEnCours) return;
      try {
        action();
      } finally {
        this.fermer();
      }
    });
  }

  fermer() {
    if (!this.overlay || this.fermetureEnCours) return;
    this.fermetureEnCours = true;
    const overlay = this.overlay;
    overlay.classList.remove("visible");

    setTimeout(() => {
      overlay.remove();
      this.elementsArrierePlan.forEach(element => {
        element.inert = false;
      });
      this.elementsArrierePlan = [];
      this.overlay = null;
      this.fermetureEnCours = false;

      const precedent = this.elementPrecedent;
      this.elementPrecedent = null;
      if (precedent?.isConnected) {
        precedent.focus();
      }

      // La mise à jour du panier peut supprimer ou masquer le bouton initial.
      if (document.activeElement === document.body) {
        const main = document.querySelector("main");
        if (main) {
          const ancienTabindex = main.getAttribute("tabindex");
          main.setAttribute("tabindex", "-1");
          main.focus();
          if (ancienTabindex === null) {
            main.removeAttribute("tabindex");
          } else {
            main.setAttribute("tabindex", ancienTabindex);
          }
        }
      }
    }, 300);
  }
}
const modal = new Modal();
const panier = new Panier();
const boutonProduit = document.querySelector(".ajout-produit");

if (boutonProduit) {
  boutonProduit.addEventListener("click", () => {
    const id = boutonProduit.dataset.id;

    fetch(`/api/produits/${id}`)
      .then(reponse => {
  if (!reponse.ok) {
    throw new Error("Impossible de charger ce produit");
  }

  return reponse.json();
})
      .then(produit => {
        panier.addToCart(produit);
      })
      .catch(erreur => {
        console.error(
          "Erreur chargement produit :",
          erreur
        );
      });
  });
}
panier.majPanier();
panier.synchroniser();
