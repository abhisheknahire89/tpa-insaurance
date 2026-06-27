import { PreAuthRecord, PatientRecord } from '../components/PreAuthWizard/types';

const DB_NAME = 'AivanaInsuranceDB';
const DB_VERSION = 1;
const PREAUTH_STORE = 'preauths';
const PATIENT_STORE = 'patients';

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { db = request.result; resolve(db); };
        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;
            if (!database.objectStoreNames.contains(PREAUTH_STORE)) {
                database.createObjectStore(PREAUTH_STORE, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(PATIENT_STORE)) {
                database.createObjectStore(PATIENT_STORE, { keyPath: 'id' });
            }
        };
    });
};

const tx = async <T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

// ---- PreAuth Operations ----

export const savePreAuth = async (record: PreAuthRecord): Promise<void> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PREAUTH_STORE, 'readwrite');
        const store = transaction.objectStore(PREAUTH_STORE);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const getPreAuth = async (id: string): Promise<PreAuthRecord | undefined> => {
    return tx<PreAuthRecord | undefined>(PREAUTH_STORE, 'readonly', store => store.get(id));
};

export const getAllPreAuths = async (): Promise<PreAuthRecord[]> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PREAUTH_STORE, 'readonly');
        const store = transaction.objectStore(PREAUTH_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
};

export const deletePreAuth = async (id: string): Promise<void> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PREAUTH_STORE, 'readwrite');
        const store = transaction.objectStore(PREAUTH_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// ---- Patient Operations ----

export const savePatient = async (patient: PatientRecord): Promise<void> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PATIENT_STORE, 'readwrite');
        const store = transaction.objectStore(PATIENT_STORE);
        const req = store.put(patient);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const getAllPatients = async (): Promise<PatientRecord[]> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PATIENT_STORE, 'readonly');
        const store = transaction.objectStore(PATIENT_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
};

export const searchPatients = async (query: string): Promise<PatientRecord[]> => {
    const all = await getAllPatients();
    const q = query.toLowerCase();
    return all.filter(p =>
        p.patientName.toLowerCase().includes(q) ||
        p.mobileNumber.includes(q) ||
        (p.uhid && p.uhid.toLowerCase().includes(q)) ||
        (p.lastKnownPolicyNumber && p.lastKnownPolicyNumber.toLowerCase().includes(q))
    );
};

// ---- ID Generation ----

export const generatePreAuthId = (): string => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    return `PA-AIVANA-${dateStr}-${seq}`;
};

export const generatePatientId = (): string => `PAT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
