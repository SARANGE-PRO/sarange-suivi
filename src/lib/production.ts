import { useSyncExternalStore } from "react";
import { getApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  collectionGroup,
  getFirestore,
  onSnapshot,
  type Unsubscribe
} from "firebase/firestore";

// Avancement de production atelier (sarange-prodoutil, même projet Firebase).
// Lecture seule des collections Chantiers + Unites (collectionGroup) en temps
// réel, agrégée par chantier. Jointure avec les commandes :
//   1. commande.chantierId (liaison manuelle) — prioritaire ;
//   2. commande.quoteId === chantier.quote_id (automatique).
// Le suivi ne modifie JAMAIS les données atelier, et l'avancement ne change
// jamais un statut de commande tout seul : il propose, l'utilisateur clique.

export interface AlerteAtelier {
  repere: string;
  motif: string;
}

export interface ChantierProduction {
  chantierId: string;
  referenceClient: string;
  quoteId: string | null;
  quoteNumber: string | null;
  /** Pièces = quantités cumulées (une unité × N pièces identiques). */
  totalPieces: number;
  terminePieces: number;
  totalUnites: number;
  termineUnites: number;
  enCours: number;
  alertes: AlerteAtelier[];
  /** % de pièces terminées (0-100). */
  pct: number;
}

export interface ProductionSnapshot {
  ready: boolean;
  chantiers: ChantierProduction[];
  byChantierId: Map<string, ChantierProduction>;
  byQuoteId: Map<string, ChantierProduction>;
}

const EMPTY_SNAPSHOT: ProductionSnapshot = {
  ready: false,
  chantiers: [],
  byChantierId: new Map(),
  byQuoteId: new Map()
};

interface RawUnite {
  chantierId: string;
  statut: string;
  quantite: number;
  repere: string;
  motif: string | null;
}

interface RawChantier {
  referenceClient: string;
  quoteId: string | null;
  quoteNumber: string | null;
}

let snapshot: ProductionSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let started = false;
let unsubscribeChantiers: Unsubscribe | null = null;
let unsubscribeUnites: Unsubscribe | null = null;
let chantiersMeta = new Map<string, RawChantier>();
let unites: RawUnite[] = [];
let hasUnitesSnapshot = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function recompute() {
  const byChantierId = new Map<string, ChantierProduction>();

  for (const unite of unites) {
    let entry = byChantierId.get(unite.chantierId);
    if (!entry) {
      const meta = chantiersMeta.get(unite.chantierId);
      entry = {
        chantierId: unite.chantierId,
        referenceClient: meta?.referenceClient ?? "(dossier atelier)",
        quoteId: meta?.quoteId ?? null,
        quoteNumber: meta?.quoteNumber ?? null,
        totalPieces: 0,
        terminePieces: 0,
        totalUnites: 0,
        termineUnites: 0,
        enCours: 0,
        alertes: [],
        pct: 0
      };
      byChantierId.set(unite.chantierId, entry);
    }
    entry.totalUnites += 1;
    entry.totalPieces += unite.quantite;
    if (unite.statut === "TERMINE") {
      entry.termineUnites += 1;
      entry.terminePieces += unite.quantite;
    } else if (unite.statut === "EN_COURS") {
      entry.enCours += 1;
    } else if (unite.statut === "ALERTE") {
      entry.alertes.push({ repere: unite.repere, motif: unite.motif ?? "motif non précisé" });
    }
  }

  const byQuoteId = new Map<string, ChantierProduction>();
  const chantiers = [...byChantierId.values()];
  for (const chantier of chantiers) {
    chantier.pct = chantier.totalPieces
      ? Math.round((chantier.terminePieces / chantier.totalPieces) * 100)
      : 0;
    if (chantier.quoteId) {
      byQuoteId.set(chantier.quoteId, chantier);
    }
  }
  chantiers.sort((left, right) => left.referenceClient.localeCompare(right.referenceClient));

  snapshot = { ready: hasUnitesSnapshot, chantiers, byChantierId, byQuoteId };
  emit();
}

function teardown() {
  unsubscribeChantiers?.();
  unsubscribeUnites?.();
  unsubscribeChantiers = null;
  unsubscribeUnites = null;
  chantiersMeta = new Map();
  unites = [];
  hasUnitesSnapshot = false;
  snapshot = EMPTY_SNAPSHOT;
  emit();
}

function subscribeFirestore() {
  const db = getFirestore(getApp());

  unsubscribeChantiers = onSnapshot(
    collection(db, "Chantiers"),
    (snap) => {
      chantiersMeta = new Map(
        snap.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Record<string, unknown>;
          return [
            docSnapshot.id,
            {
              referenceClient:
                typeof data.reference_client === "string" ? data.reference_client : "",
              quoteId: typeof data.quote_id === "string" && data.quote_id ? data.quote_id : null,
              quoteNumber:
                typeof data.quote_number === "string" && data.quote_number
                  ? data.quote_number
                  : null
            }
          ];
        })
      );
      recompute();
    },
    (error) => {
      console.error("Lecture des chantiers atelier impossible", error);
    }
  );

  unsubscribeUnites = onSnapshot(
    collectionGroup(db, "Unites"),
    (snap) => {
      unites = snap.docs.map((docSnapshot) => {
        const data = docSnapshot.data() as Record<string, unknown>;
        const alerte = (data.alerte as Record<string, unknown> | null | undefined) ?? null;
        return {
          chantierId: typeof data.chantier_id === "string" ? data.chantier_id : "",
          statut: typeof data.statut === "string" ? data.statut : "A_FAIRE",
          quantite:
            typeof data.quantite === "number" && Number.isFinite(data.quantite)
              ? Math.max(1, Math.round(data.quantite))
              : 1,
          repere: typeof data.repere === "string" ? data.repere : "",
          motif: typeof alerte?.motif === "string" ? alerte.motif : null
        };
      });
      hasUnitesSnapshot = true;
      recompute();
    },
    (error) => {
      console.error("Lecture des unités atelier impossible", error);
    }
  );
}

function start() {
  if (!getApps().length) {
    return; // mode local : pas de production atelier
  }
  // La lecture exige un utilisateur authentifié (règles Firestore) : on suit
  // la session de l'app (Google @sarange.fr) et on nettoie à la déconnexion.
  onAuthStateChanged(getAuth(getApp()), (user) => {
    if (user && !unsubscribeUnites) {
      subscribeFirestore();
    } else if (!user && unsubscribeUnites) {
      teardown();
    }
  });
}

export function subscribeProduction(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    start();
  }
  return () => {
    listeners.delete(listener);
  };
}

export const getProductionSnapshot = (): ProductionSnapshot => snapshot;

export function useProduction(): ProductionSnapshot {
  return useSyncExternalStore(subscribeProduction, getProductionSnapshot);
}

/** Chantier atelier lié à une commande : liaison manuelle, sinon n° de devis. */
export function productionForCommande(
  production: ProductionSnapshot,
  commande: { chantierId?: string | null; quoteId?: string | null }
): ChantierProduction | null {
  if (commande.chantierId) {
    const manual = production.byChantierId.get(commande.chantierId);
    if (manual) {
      return manual;
    }
  }
  if (commande.quoteId) {
    return production.byQuoteId.get(commande.quoteId) ?? null;
  }
  return null;
}
