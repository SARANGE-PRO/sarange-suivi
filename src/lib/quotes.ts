import { getApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore, orderBy, query, Timestamp } from "firebase/firestore";

// Lecture seule des devis de devis-sarange (même projet Firebase sarange-pro,
// collection users/{uid}/quotes). Sert uniquement au bouton "Importer depuis
// un devis" : le suivi ne modifie jamais un devis.

export interface DevisSummary {
  id: string;
  quoteNumber: string;
  title: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  adresse: string;
  totalTTC: number | null;
  /** Statut effectif : signatureWorkflow.status en priorité, sinon status. */
  status: string;
  /** Date la plus parlante : signature, sinon émission, sinon dernière modification. */
  displayDate: string | null;
}

export const DEVIS_STATUS_LABELS: Record<string, string> = {
  draft: "Non envoyé",
  sent: "Envoyé",
  viewed: "Consulté",
  signed: "Signé",
  refused: "Refusé",
  expired: "Expiré",
  archived: "Archivé"
};

function toIsoDate(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function composeAdresse(clientData: Record<string, unknown> | null): string {
  if (!clientData) {
    return "";
  }
  const adresse = asString(clientData.adresse);
  const cpVille = [asString(clientData.codePostal), asString(clientData.ville)].filter(Boolean).join(" ");
  return [adresse, cpVille].filter(Boolean).join(", ");
}

export async function fetchDevisList(uid: string): Promise<DevisSummary[]> {
  if (!getApps().length) {
    return [];
  }
  const db = getFirestore(getApp());
  const quotesQuery = query(collection(db, "users", uid, "quotes"), orderBy("updatedAt", "desc"));
  const snapshot = await getDocs(quotesQuery);

  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, unknown>;
    const workflow = (data.signatureWorkflow as Record<string, unknown> | undefined) ?? null;
    const payload = (data.payload as Record<string, unknown> | undefined) ?? null;
    const clientData = (payload?.clientData as Record<string, unknown> | undefined) ?? null;
    const status = asString(workflow?.status) || asString(data.status) || "draft";

    return {
      id: docSnapshot.id,
      quoteNumber: asString(data.quoteNumber),
      title: asString(data.title),
      clientId: typeof data.clientId === "string" && data.clientId ? data.clientId : null,
      clientName: asString(data.clientName),
      clientPhone: asString(data.clientPhone),
      adresse: composeAdresse(clientData),
      totalTTC: typeof data.totalTTC === "number" ? data.totalTTC : null,
      status,
      displayDate:
        toIsoDate(workflow?.signedAt) ?? toIsoDate(data.quoteIssuedAt) ?? toIsoDate(data.updatedAt)
    };
  });
}
