export interface Commande {
  id: string;
  numeroDevis: string;
  client: string;
  typeCommande: string;
  statutCommande: string;
  dateCommande: string | null;
  ordreFabrication?: number | null;
  datePosePrevue: string | null;
  datePoseFin: string | null;
  dateSavPrevue: string | null;
  derniereMaj: string | null;
  commentaireSuivi: string;
  etatFacturation: string;
  numeroFacture: string;
  dateFacture: string | null;
  commentaireFacturation: string;
}

export interface CommandeDraft {
  id?: string;
  numeroDevis: string;
  client: string;
  typeCommande: string;
  statutCommande: string;
  dateCommande: string;
  datePosePrevue: string;
  datePoseFin: string;
  dateSavPrevue: string;
  commentaireSuivi: string;
  etatFacturation: string;
  numeroFacture: string;
  dateFacture: string;
  commentaireFacturation: string;
}

export interface AlertInfo {
  label: string;
  tone: "green" | "mint" | "orange" | "red" | "purple" | "yellow" | "slate";
  priority: number;
}

export interface TrashItem {
  commande: Commande;
  deletedAt: string;
  expiresAt: string;
}

export interface FabricationOrderUpdate {
  id: string;
  ordreFabrication: number | null;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type ThemeMode = "light" | "dark";
export type DataMode = "local" | "firebase";
export type TableView = "bureau" | "facturation" | "archives" | "sav";
