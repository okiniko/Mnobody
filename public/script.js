const productList = document.querySelector(".product-list");

if (productList) {
  fetch("/api/produits")
    .then(reponse => reponse.json())
    .then(produits => {
      const catalogue = new Catalogue(produits);
      catalogue.afficherProduits();
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
  this.recherche.type = "search";
  this.recherche.placeholder = "Rechercher un produit...";

  this.filtre = document.createElement("select");

  this.filtre.innerHTML = `
    <option value="tous">Tous les produits</option>
    <option value="T-shirt">T-shirts</option>
    <option value="Sweat">Sweats</option>
    <option value="Hoodie">Hoodies</option>
    <option value="Poster">Posters</option>
    <option value="Mug">Mugs</option>
    <option value="Totebag">Totebags</option>
    <option value="Casquette">Casquettes</option>
    <option value="Sticker">Stickers</option>
    <option value="Print">Prints</option>
    <option value="Badge">Badges</option>
  `;

  this.tri = document.createElement("select");

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
      produit.nom.startsWith(categorie);

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

    const cardNom = document.createElement("h2");
    const cardDesc = document.createElement("p");
    const cardPrice = document.createElement("p");
    const cardImage = document.createElement("img");
    const cardADD = document.createElement("button");

    cardADD.classList.add("ajout");

    cardNom.textContent = produit.nom;
    cardDesc.textContent = produit.description;
    cardPrice.textContent = produit.prix + " €";
    cardImage.src = produit.image;
    cardADD.textContent = "AJOUTER";

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
  constructor(items =  JSON.parse(localStorage.getItem("panier")) || []){
    this.items = items;
	  this.list = document.querySelector(".cart-list");
    this.total = document.querySelector(".total");
    this.boutonVider = document.querySelector(".vider");

    this.boutonVider?.addEventListener("click", () => {
      this.viderPanier();
    });
  }
  addToCart(produit) {
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
      `${item.nom} - ${item.prix} €`;

    const moins = document.createElement("button");
    moins.textContent = "-";

    const quantite = document.createElement("span");
    quantite.textContent = item.quantite;

    const plus = document.createElement("button");
    plus.textContent = "+";

    const suppr = document.createElement("button");
    suppr.textContent = "X";

    plus.addEventListener("click", () => {
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
      this.items.splice(index, 1);
      this.majPanier();
    }
  );
}
  viderPanier() {
  modal.confirmation(
    "Voulez-vous vraiment vider tout le panier ?",
    () => {
      this.items = [];
      this.majPanier();
    }
  );
}
  sauvegarderPanier() {
  localStorage.setItem("panier", JSON.stringify(this.items));
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
  }

  confirmation(message, action) {
    this.overlay = document.createElement("div");
    this.overlay.classList.add("modal-confirmation");

    const modal = document.createElement("div");
    modal.classList.add("modal-content");

    const titre = document.createElement("h2");
    titre.textContent = "Confirmation";

    const texte = document.createElement("p");
    texte.textContent = message;

    const actions = document.createElement("div");
    actions.classList.add("modal-actions");

    const annuler = document.createElement("button");
    annuler.textContent = "ANNULER";
    annuler.classList.add("modal-annuler");

    const confirmer = document.createElement("button");
    confirmer.textContent = "CONFIRMER";
    confirmer.classList.add("modal-confirmer");

    actions.append(annuler, confirmer);
    modal.append(titre, texte, actions);
    this.overlay.append(modal);

    document.body.append(this.overlay);
requestAnimationFrame(() => {
  this.overlay.classList.add("visible");
});
    annuler.addEventListener("click", () => {
      this.fermer();
    });

    confirmer.addEventListener("click", () => {
      action();
      this.fermer();
    });
  }

  fermer() {
  if (!this.overlay) return;

  this.overlay.classList.remove("visible");

  setTimeout(() => {
    this.overlay.remove();
    this.overlay = null;
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
      .then(reponse => reponse.json())
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
