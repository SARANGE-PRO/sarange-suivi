import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
  type Unsubscribe
} from "firebase/firestore";
import {
  createSeedCommandes,
  prepareCommandeForSave
} from "./business";
import type { AppUser, Commande, CommandeDraft, DataMode, TrashItem } from "../types";

interface Listener {
  (commandes: Commande[]): void;
}

interface CommandesStore {
  mode: DataMode;
  getUser(): AppUser | null;
  getSnapshot(): Commande[];
  getTrashSnapshot(): TrashItem[];
  subscribeUser(listener: (user: AppUser | null) => void): () => void;
  subscribe(listener: Listener): () => void;
  subscribeTrash(listener: (items: TrashItem[]) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signOutUser(): Promise<void>;
  upsert(draft: CommandeDraft): Promise<void>;
  delete(commande: Commande): Promise<void>;
  restoreFromTrash(id: string): Promise<void>;
  deleteFromTrash(id: string): Promise<void>;
}

const STORAGE_KEY = "sarange-commandes";
const CHANNEL_KEY = "sarange-commandes-sync";
const TRASH_STORAGE_KEY = "sarange-commandes-trash";
const TRASH_CHANNEL_KEY = "sarange-commandes-trash-sync";
const TRASH_RETENTION_DAYS = 30;
const COLLECTION_NAME = "commandes";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function createFirestore(app: FirebaseApp) {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true
    });
  } catch {
    return getFirestore(app);
  }
}

function toAppUser(user: User | null): AppUser | null {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL
  };
}

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

function sortSnapshot(commandes: Commande[]) {
  return [...commandes].sort((left, right) => {
    const leftDate = left.dateCommande ? new Date(left.dateCommande).getTime() : 0;
    const rightDate = right.dateCommande ? new Date(right.dateCommande).getTime() : 0;
    return rightDate - leftDate;
  });
}

function sortTrashSnapshot(items: TrashItem[]) {
  return [...items].sort((left, right) => new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime());
}

function getTrashExpiry(deletedAt: Date) {
  const expiresAt = new Date(deletedAt);
  expiresAt.setDate(expiresAt.getDate() + TRASH_RETENTION_DAYS);
  return expiresAt.toISOString();
}

function removeExpiredTrash(items: TrashItem[]) {
  const now = Date.now();
  return items.filter((item) => new Date(item.expiresAt).getTime() > now);
}

function readTrashSnapshot() {
  const raw = window.localStorage.getItem(TRASH_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as TrashItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const cleaned = sortTrashSnapshot(removeExpiredTrash(parsed));
    window.localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    window.localStorage.removeItem(TRASH_STORAGE_KEY);
    return [];
  }
}

class LocalTrashStore {
  private snapshot = readTrashSnapshot();
  private listeners = new Set<(items: TrashItem[]) => void>();
  private channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(TRASH_CHANNEL_KEY) : null;

  constructor() {
    window.addEventListener("storage", this.handleStorage);
    this.channel?.addEventListener("message", this.handleBroadcast);
    window.setInterval(() => this.purgeExpired(), 3_600_000);
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (items: TrashItem[]) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  add(commande: Commande) {
    const deletedAt = new Date();
    const nextItem: TrashItem = {
      commande,
      deletedAt: deletedAt.toISOString(),
      expiresAt: getTrashExpiry(deletedAt)
    };

    this.persist([nextItem, ...this.snapshot.filter((item) => item.commande.id !== commande.id)]);
  }

  remove(id: string) {
    this.persist(this.snapshot.filter((item) => item.commande.id !== id));
  }

  private purgeExpired() {
    const cleaned = removeExpiredTrash(this.snapshot);
    if (cleaned.length !== this.snapshot.length) {
      this.persist(cleaned);
    }
  }

  private persist(items: TrashItem[]) {
    this.snapshot = sortTrashSnapshot(removeExpiredTrash(items));
    window.localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(this.snapshot));
    this.channel?.postMessage(this.snapshot);
    this.emit();
  }

  private handleStorage = (event: StorageEvent) => {
    if (event.key !== TRASH_STORAGE_KEY || !event.newValue) {
      return;
    }

    this.snapshot = sortTrashSnapshot(removeExpiredTrash(JSON.parse(event.newValue) as TrashItem[]));
    this.emit();
  };

  private handleBroadcast = (event: MessageEvent<TrashItem[]>) => {
    this.snapshot = sortTrashSnapshot(removeExpiredTrash(event.data));
    this.emit();
  };

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

const trashStore = new LocalTrashStore();

function readLocalSnapshot() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = sortSnapshot(createSeedCommandes());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as Commande[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = sortSnapshot(createSeedCommandes());
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    return sortSnapshot(parsed);
  } catch {
    const seeded = sortSnapshot(createSeedCommandes());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

class LocalCommandesStore implements CommandesStore {
  mode: DataMode = "local";
  private snapshot = readLocalSnapshot();
  private listeners = new Set<Listener>();
  private channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_KEY) : null;

  constructor() {
    window.addEventListener("storage", this.handleStorage);
    this.channel?.addEventListener("message", this.handleBroadcast);
  }

  getSnapshot() {
    return this.snapshot;
  }

  getUser() {
    return null;
  }

  getTrashSnapshot() {
    return trashStore.getSnapshot();
  }

  subscribeUser(listener: (user: AppUser | null) => void) {
    listener(null);

    return () => undefined;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeTrash(listener: (items: TrashItem[]) => void) {
    return trashStore.subscribe(listener);
  }

  async signInWithGoogle() {
    return undefined;
  }

  async signOutUser() {
    return undefined;
  }

  async upsert(draft: CommandeDraft) {
    const previous = this.snapshot.find((commande) => commande.id === draft.id);
    const nextCommande = prepareCommandeForSave(draft, previous);
    const nextSnapshot = previous
      ? this.snapshot.map((commande) => (commande.id === nextCommande.id ? nextCommande : commande))
      : [nextCommande, ...this.snapshot];

    this.persist(nextSnapshot);
  }

  async delete(commande: Commande) {
    this.persist(this.snapshot.filter((item) => item.id !== commande.id));
    trashStore.add(commande);
  }

  async restoreFromTrash(id: string) {
    const item = trashStore.getSnapshot().find((trashItem) => trashItem.commande.id === id);
    if (!item) {
      return;
    }

    const nextSnapshot = this.snapshot.some((commande) => commande.id === id)
      ? this.snapshot.map((commande) => (commande.id === id ? item.commande : commande))
      : [item.commande, ...this.snapshot];

    this.persist(nextSnapshot);
    trashStore.remove(id);
  }

  async deleteFromTrash(id: string) {
    trashStore.remove(id);
  }

  private persist(commandes: Commande[]) {
    this.snapshot = sortSnapshot(commandes);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot));
    this.channel?.postMessage(this.snapshot);
    this.emit();
  }

  private handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return;
    }

    this.snapshot = sortSnapshot(JSON.parse(event.newValue) as Commande[]);
    this.emit();
  };

  private handleBroadcast = (event: MessageEvent<Commande[]>) => {
    this.snapshot = sortSnapshot(event.data);
    this.emit();
  };

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

class FirebaseCommandesStore implements CommandesStore {
  mode: DataMode = "firebase";
  private snapshot: Commande[] = [];
  private user: AppUser | null = null;
  private listeners = new Set<Listener>();
  private userListeners = new Set<(user: AppUser | null) => void>();
  private db: Firestore;
  private auth: Auth;
  private unsubscribeCommandes: Unsubscribe | null = null;

  constructor() {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    this.db = createFirestore(app);
    this.auth = getAuth(app);
    this.auth.useDeviceLanguage();

    onAuthStateChanged(this.auth, (user) => {
      this.user = toAppUser(user);
      this.emitUser();
      this.unsubscribeCommandes?.();
      this.unsubscribeCommandes = null;

      if (user) {
        this.listenCommandes();
        return;
      }

      this.snapshot = [];
      this.emit();
    });
  }

  private listenCommandes() {
    const commandesQuery = query(collection(this.db, COLLECTION_NAME), orderBy("dateCommande", "desc"));

    this.unsubscribeCommandes = onSnapshot(
      commandesQuery,
      (snapshot) => {
        this.snapshot = sortSnapshot(
          snapshot.docs.map((snapshotDoc) => ({
            ...(snapshotDoc.data() as Omit<Commande, "id">),
            id: snapshotDoc.id
          }))
        );
        this.emit();
      },
      (error) => {
        console.error("Erreur Firestore:", error);
      }
    );
  }

  getUser() {
    return this.user;
  }

  getSnapshot() {
    return this.snapshot;
  }

  getTrashSnapshot() {
    return trashStore.getSnapshot();
  }

  subscribeUser(listener: (user: AppUser | null) => void) {
    this.userListeners.add(listener);
    listener(this.user);

    return () => {
      this.userListeners.delete(listener);
    };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeTrash(listener: (items: TrashItem[]) => void) {
    return trashStore.subscribe(listener);
  }

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(this.auth, provider);
  }

  async signOutUser() {
    await signOut(this.auth);
  }

  async upsert(draft: CommandeDraft) {
    const previous = this.snapshot.find((commande) => commande.id === draft.id);
    const nextCommande = prepareCommandeForSave(draft, previous);
    await setDoc(doc(this.db, COLLECTION_NAME, nextCommande.id), nextCommande, { merge: true });
  }

  async delete(commande: Commande) {
    await deleteDoc(doc(this.db, COLLECTION_NAME, commande.id));
    trashStore.add(commande);
  }

  async restoreFromTrash(id: string) {
    const item = trashStore.getSnapshot().find((trashItem) => trashItem.commande.id === id);
    if (!item) {
      return;
    }

    await setDoc(doc(this.db, COLLECTION_NAME, id), item.commande, { merge: true });
    trashStore.remove(id);
  }

  async deleteFromTrash(id: string) {
    trashStore.remove(id);
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private emitUser() {
    this.userListeners.forEach((listener) => listener(this.user));
  }
}

export function createCommandesStore(): CommandesStore {
  if (hasFirebaseConfig()) {
    return new FirebaseCommandesStore();
  }

  return new LocalCommandesStore();
}
