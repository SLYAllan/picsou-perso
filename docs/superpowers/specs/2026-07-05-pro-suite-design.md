# Pro suite : compta micro, factures UwUTCG, simulateur Japon

> Statut : validé par Allan le 2026-07-05 (« go »)
> Origine : port du projet `pokecalc` (Next.js/SQLite, C:\Users\Allan\work\repos\pokecalc)
> dans Picsou pour tout centraliser. pokecalc sera archivé ensuite.

## Objectif

Une section « Pro » dans Picsou regroupant les trois modules de pokecalc :

1. **Compta micro-entreprise** — registre des ventes (bénéfice net par vente),
   récap URSSAF mensuel (CA encaissé, cotisations 12,3 % + CFP 0,1 % + VFL 1 %,
   « marquer déclaré »), vue annuelle avec jauge du seuil (188 700 €),
   stats par plateforme, export/import CSV.
2. **Générateur de factures** — PDF brandé UwUTCG (logo, magenta #E6398B, Poppins,
   mentions micro : SIRET, art. 293 B CGI), numérotation `UWUTCG-YYYY-NNNN`
   **côté serveur**, historique + re-téléchargement.
3. **Simulateur Japon** — lots cartes/accessoires en JPY (prix lot + proxy + port),
   taux JPY→EUR auto (provider FX Yahoo existant), répartition manuelle ou
   proportionnelle du coût, marge nette / ROI par plateforme de revente,
   simulations sauvegardées en base.

## Hors périmètre v1

- Parse PDF de relevés (pokecalc `parse-pdf`) — import CSV seulement.
- Lien automatique ventes ↔ transactions bancaires synchronisées.
- Multi-vendeur : le bloc vendeur de la facture reste celui d'UwUTCG (constante).

## Données (V40, Flyway, tout member-scoped)

| Table | Rôle |
|---|---|
| `resale_sale` | ventes : date, name, reference, type, platform, sale_price, purchase_price, shipping_cost, platform_commission, packaging_cost, notes |
| `pro_invoice` | factures : invoice_number (UNIQUE par membre), date, client_*, items (JSON texte), shipping_cost, subtotal, total, notes |
| `urssaf_declaration` | year, month, total_ca, urssaf/cfp/vfl/total_due, declared, declared_at — UNIQUE(member, year, month) |
| `pro_setting` | clé/valeur par membre : taux (urssaf 12.3, cfp 0.1, vfl 1.0, seuil 188700, emballage 0.35) + réglages simulateur (JSON) |
| `resale_simulation` | type cards/accessories, name, data (JSON texte : la simulation complète) |

**Import one-shot des données pokecalc à l'exécution** (révisé pendant
l'implémentation) : les factures contiennent des données personnelles clients
et le repo est public → les données ne passent PAS par la migration/git.
V40 = schéma seul ; un `pokecalc-export.json` généré localement est uploadé
une fois via `POST /api/pro/import` (bouton « Import pokecalc », idempotent).
Le compteur de factures repart à 0024 après import.

## API `/api/pro` (UserContext, mêmes conventions que budget)

- `GET/POST/PUT/DELETE /sales` (+ `POST /sales/bulk` pour l'import CSV)
- `GET /recap?year&month` — agrégats mensuels par type + URSSAF + seuil annuel cumulé
- `GET /annual?year` — CA/bénéfice par mois + total
- `POST /declarations` — upsert « déclaré » du mois
- `GET /invoices`, `POST /invoices` (le serveur attribue le numéro = max+1 et le renvoie)
- `GET/PUT /settings`
- `GET/POST/PUT/DELETE /simulations`
- `GET /fx/jpy` — taux JPY par EUR (inverse de `getFxRateToEur("JPY")`)

Les calculs par vente (charges sociales = CA×taux, bénéfice net, marge) et le
récap vivent dans `ProComptaService` (portés de `lib/compta.ts` + route recap),
testés unitairement.

## Frontend

Route `/pro` (nav sidebar, icône Briefcase), une page à onglets :
**Ventes** (tableau + formulaire + export/import CSV), **Récap** (mois +
URSSAF + déclaré + annuel + stats plateformes), **Factures** (formulaire +
aperçu live + PDF jsPDF + historique), **Simulateur** (cartes/accessoires,
répartition, résultats par plateforme, simulations sauvegardées).

- Génération PDF : port direct de `generateInvoicePdf` de pokecalc
  (jsPDF — nouvelle dépendance, import dynamique), `poppinsFont.ts` copié,
  logo dans `public/uwutcg-logo.png`.
- Slices `features/pro/{api.ts,hooks.ts}` (TanStack Query), i18n fr/en.

## Décisions

- Numérotation facture côté serveur (fin du compteur localStorage : plus de
  risque de doublon multi-appareil).
- Données historiques importées par migration Flyway plutôt qu'un écran
  d'import : zéro action utilisateur au déploiement.
- Simulateur : calculs purs côté client (port de `lib/calculations.ts`),
  seule la persistance passe par l'API.
