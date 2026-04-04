# Index de la documentation technique

> Picsou est un tableau de bord financier personnel auto-heberge.
> Il aggrege les comptes bancaires, boursiers, crypto et on-chain, et suit le patrimoine dans le temps.
>
> Ce fichier est le point d'entree de la documentation technique.
> Lire ce fichier en premier pour savoir ou trouver l'information.

## Architecture

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- Vue d'ensemble, modules, flux de donnees

## Decisions techniques (ADR)

| Date | Decision | Statut |
|------|----------|--------|
| 2026-01-01 | [Architecture ports et adaptateurs](./decisions/2026-01-01-ports-and-adapters.md) | Actif |
| 2026-01-01 | [Utilisateur unique avec JWT en cookies HttpOnly](./decisions/2026-01-01-single-user-jwt-cookies.md) | Actif |
| 2026-01-01 | [Flyway proprietaire du schema](./decisions/2026-01-01-flyway-schema-ownership.md) | Actif |
| 2026-03-01 | [Double fournisseur bancaire](./decisions/2026-03-01-dual-bank-providers.md) | Actif |
| 2026-03-01 | [Chiffrement AES-256-GCM pour les secrets crypto](./decisions/2026-03-01-aes-gcm-crypto-secrets.md) | Actif |

## Notes techniques par fonctionnalite

| Fonctionnalite | Derniere maj | Note |
|----------------|-------------|------|
| Synchronisation bancaire | 2026-04-04 | [bank-sync.md](./features/bank-sync.md) |
| Trade Republic | 2026-04-04 | [trade-republic.md](./features/trade-republic.md) |
| Conversion ISIN → Ticker | 2026-04-04 | [isin-to-ticker-conversion.md](./features/ISIN_TO_TICKER_CONVERSION.md) |
| Suivi crypto | 2026-04-04 | [crypto-tracking.md](./features/crypto-tracking.md) |
| Objectifs d'epargne | 2026-04-04 | [goals.md](./features/goals.md) |
| Service de prix | 2026-04-04 | [price-service.md](./features/price-service.md) |
| Prix en direct (holdings) | 2026-04-04 | [live-prices-holdings.md](./features/live-prices-holdings.md) |
| Import Finary | 2026-04-04 | [finary-import.md](./features/finary-import.md) |

## Conventions

| Sujet | Fichier |
|-------|---------|
| API REST | [api-rest.md](./conventions/api-rest.md) |
| Gestion des erreurs | [error-handling.md](./conventions/error-handling.md) |
| Tests | [testing.md](./conventions/testing.md) |
| Frontend | [frontend.md](./conventions/frontend.md) |
| Base de donnees | [database.md](./conventions/database.md) |

## Modeles

- [FEATURE.md](./templates/FEATURE.md) -- Modele de note technique par fonctionnalite
- [DECISION.md](./templates/DECISION.md) -- Modele d'enregistrement de decision architecturale (ADR)
